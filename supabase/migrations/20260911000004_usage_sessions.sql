-- Consumo IA por proyecto (carpeta) y por sesión.
-- El colector sube, por cada sesión de Claude Code o Codex: carpeta, inicio, fin y
-- tokens por modelo. Nunca el contenido de las conversaciones.

create table public.usage_sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('claude_code', 'codex')),
  session_id text not null check (char_length(session_id) between 1 and 100),
  project text not null default '' check (char_length(project) <= 200),
  account text not null default 'unknown',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- { "<modelo>": { input, output, cache_read, cache_write, cache_write_1h, messages } }
  models jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, source, session_id)
);
create index usage_sessions_user_started_idx on public.usage_sessions (user_id, started_at desc);

alter table public.usage_sessions enable row level security;
create policy "read own sessions" on public.usage_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "delete own sessions" on public.usage_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, delete on public.usage_sessions to authenticated;

-- Carpeta de trabajo asociada a un proyecto de Tiempo (para unir horas y costo de IA).
alter table public.projects add column folder text check (folder is null or char_length(folder) <= 200);

-- ingest_usage ahora también recibe sesiones (parámetro opcional: el colector viejo sigue funcionando).
drop function if exists public.ingest_usage(text, jsonb, jsonb);

create function public.ingest_usage(p_token text, p_rows jsonb, p_status jsonb default '{}'::jsonb, p_sessions jsonb default '[]'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_user uuid;
  v_count integer := 0;
  v_sessions integer := 0;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 200 then
    raise exception 'invalid token' using errcode = '28000';
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select t.user_id into v_user
    from public.collector_tokens t
   where t.token_hash = v_hash and t.revoked_at is null;
  if v_user is null then
    raise exception 'invalid token' using errcode = '28000';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a json array' using errcode = '22023';
  end if;
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    raise exception 'sessions must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 or jsonb_array_length(p_sessions) > 2000 then
    raise exception 'too many items per call' using errcode = '22023';
  end if;

  insert into public.usage_daily as u (
    user_id, day, source, account, model,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens,
    messages, updated_at
  )
  select v_user,
         (r ->> 'day')::date,
         r ->> 'source',
         coalesce(nullif(left(r ->> 'account', 200), ''), 'unknown'),
         left(r ->> 'model', 100),
         greatest(coalesce((r ->> 'input_tokens')::bigint, 0), 0),
         greatest(coalesce((r ->> 'output_tokens')::bigint, 0), 0),
         greatest(coalesce((r ->> 'cache_read_tokens')::bigint, 0), 0),
         greatest(coalesce((r ->> 'cache_write_tokens')::bigint, 0), 0),
         greatest(coalesce((r ->> 'cache_write_1h_tokens')::bigint, 0), 0),
         greatest(coalesce((r ->> 'messages')::integer, 0), 0),
         now()
    from jsonb_array_elements(p_rows) as r
   where r ->> 'model' is not null and r ->> 'day' is not null
  on conflict (user_id, day, source, account, model) do update set
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    cache_read_tokens = excluded.cache_read_tokens,
    cache_write_tokens = excluded.cache_write_tokens,
    cache_write_1h_tokens = excluded.cache_write_1h_tokens,
    messages = excluded.messages,
    updated_at = now();
  get diagnostics v_count = row_count;

  insert into public.usage_sessions as s (user_id, source, session_id, project, account, started_at, ended_at, models, updated_at)
  select v_user,
         x ->> 'source',
         left(x ->> 'session_id', 100),
         left(coalesce(x ->> 'project', ''), 200),
         coalesce(nullif(left(x ->> 'account', 200), ''), 'unknown'),
         (x ->> 'started_at')::timestamptz,
         greatest((x ->> 'ended_at')::timestamptz, (x ->> 'started_at')::timestamptz),
         case when jsonb_typeof(x -> 'models') = 'object' then x -> 'models' else '{}'::jsonb end,
         now()
    from jsonb_array_elements(p_sessions) as x
   where x ->> 'session_id' is not null and x ->> 'started_at' is not null and x ->> 'ended_at' is not null
  on conflict (user_id, source, session_id) do update set
    project = excluded.project,
    account = excluded.account,
    started_at = least(s.started_at, excluded.started_at),
    ended_at = greatest(s.ended_at, excluded.ended_at),
    models = excluded.models,
    updated_at = now();
  get diagnostics v_sessions = row_count;

  update public.collector_tokens set last_used_at = now() where token_hash = v_hash;

  if p_status ? 'machine' then
    insert into public.collector_status (user_id, machine, last_seen_at, current_account, version)
    values (
      v_user,
      left(p_status ->> 'machine', 100),
      now(),
      left(p_status ->> 'current_account', 200),
      left(p_status ->> 'version', 40)
    )
    on conflict (user_id, machine) do update set
      last_seen_at = now(),
      current_account = excluded.current_account,
      version = excluded.version;
  end if;

  return v_count + v_sessions;
end;
$$;

revoke all on function public.ingest_usage(text, jsonb, jsonb, jsonb) from public, authenticated;
grant execute on function public.ingest_usage(text, jsonb, jsonb, jsonb) to anon;
comment on function public.ingest_usage(text, jsonb, jsonb, jsonb) is
  'Llamada por el colector local con la llave publicable. Autoriza con un token por equipo (solo su SHA-256 vive en collector_tokens).';
