-- Vena OS · configuración completa de la base de datos
-- Pega todo este archivo en Supabase → SQL Editor → Run. Es seguro correrlo una sola vez
-- en un proyecto nuevo. Generado desde supabase/migrations con: npm run db:setup-sql

-- =====================================================================
-- 20260911000001_init.sql
-- =====================================================================
-- OS Vena Digital — esquema base
-- Tiempo (proyectos → tareas → registros), Notas, Tableros y Consumo IA.
-- Todo es por usuaria: cada tabla lleva user_id y RLS restringe a auth.uid().

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tiempo
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#2a78d6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index projects_user_idx on public.projects (user_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_user_idx on public.tasks (user_id);
create index tasks_project_idx on public.tasks (project_id);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint time_entries_range check (ended_at is null or ended_at >= started_at)
);
create index time_entries_user_started_idx on public.time_entries (user_id, started_at desc);
create index time_entries_task_idx on public.time_entries (task_id);
-- Un solo cronómetro activo por usuaria.
create unique index time_entries_one_running on public.time_entries (user_id) where ended_at is null;

-- Inicia una tarea: detiene la que esté en curso y abre un registro nuevo.
create or replace function public.start_timer(p_task_id uuid)
returns public.time_entries
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entry public.time_entries;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.tasks t where t.id = p_task_id and t.user_id = auth.uid()) then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  update public.time_entries
     set ended_at = now()
   where user_id = auth.uid() and ended_at is null;
  insert into public.time_entries (user_id, task_id)
  values (auth.uid(), p_task_id)
  returning * into v_entry;
  return v_entry;
end;
$$;

create or replace function public.stop_timer()
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.time_entries
     set ended_at = now()
   where user_id = auth.uid() and ended_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Notas
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null default 'nota' check (type in ('hacer', 'investigar', 'link', 'nota', 'inspiracion')),
  body text not null default '' check (char_length(body) <= 10000),
  url text check (url is null or url ~* '^https?://'),
  link_title text,
  link_description text,
  link_image text,
  link_site text,
  image_path text,
  pinned boolean not null default false,
  done boolean not null default false,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_created_idx on public.notes (user_id, created_at desc);
create trigger notes_set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tableros (escenas de Excalidraw)
-- ---------------------------------------------------------------------------
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default 'Sin título' check (char_length(name) between 1 and 120),
  scene jsonb not null default '{}'::jsonb,
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index boards_user_updated_idx on public.boards (user_id, updated_at desc);
create trigger boards_set_updated_at before update on public.boards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Consumo IA
-- ---------------------------------------------------------------------------
-- Cuentas y suscripciones. email = cuenta que reporta el colector
-- (Claude Code: correo de la sesión activa). Para OpenAI basta una cuenta.
create table public.ai_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  email text check (email is null or char_length(email) <= 200),
  label text not null check (char_length(label) between 1 and 60),
  plan text check (plan is null or char_length(plan) <= 60),
  monthly_price numeric(10, 2) not null default 0 check (monthly_price >= 0),
  renews_day smallint check (renews_day between 1 and 31),
  color text not null default '#eb6834' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);
create index ai_accounts_user_idx on public.ai_accounts (user_id);

-- Precios por millón de tokens (USD). Editables: el costo se calcula al leer.
create table public.model_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  model text not null check (char_length(model) between 1 and 100),
  input numeric(12, 4) not null check (input >= 0),
  output numeric(12, 4) not null check (output >= 0),
  cache_read numeric(12, 4) not null default 0 check (cache_read >= 0),
  cache_write numeric(12, 4) not null default 0 check (cache_write >= 0),
  cache_write_1h numeric(12, 4) not null default 0 check (cache_write_1h >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, model)
);
create trigger model_prices_set_updated_at before update on public.model_prices
  for each row execute function public.set_updated_at();

-- Totales diarios que sube el colector local (valores absolutos, idempotentes).
create table public.usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  source text not null check (source in ('claude_code', 'codex')),
  account text not null default 'unknown',
  model text not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_write_1h_tokens bigint not null default 0,
  messages integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, source, account, model)
);
create index usage_daily_user_day_idx on public.usage_daily (user_id, day);

-- Tokens del colector (solo se guarda el hash SHA-256).
create table public.collector_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default 'Mac' check (char_length(label) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index collector_tokens_user_idx on public.collector_tokens (user_id);

create table public.collector_status (
  user_id uuid not null references auth.users (id) on delete cascade,
  machine text not null,
  last_seen_at timestamptz not null default now(),
  current_account text,
  version text,
  primary key (user_id, machine)
);

-- El colector llama esta función con la llave publicable + su token.
-- security definer: valida el token y escribe solo filas de esa usuaria.
create or replace function public.ingest_usage(p_token text, p_rows jsonb, p_status jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_user uuid;
  v_count integer := 0;
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
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'too many rows (max 5000 per call)' using errcode = '22023';
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

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seguridad: RLS en todo, cada usuaria ve y edita solo lo suyo
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.time_entries enable row level security;
alter table public.notes enable row level security;
alter table public.boards enable row level security;
alter table public.ai_accounts enable row level security;
alter table public.model_prices enable row level security;
alter table public.usage_daily enable row level security;
alter table public.collector_tokens enable row level security;
alter table public.collector_status enable row level security;

create policy "own projects" on public.projects for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own tasks" on public.tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own time entries" on public.time_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own notes" on public.notes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own boards" on public.boards for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own ai accounts" on public.ai_accounts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own model prices" on public.model_prices for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- usage_daily y collector_status solo se escriben vía ingest_usage.
create policy "read own usage" on public.usage_daily for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "delete own usage" on public.usage_daily for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy "own collector tokens" on public.collector_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "read own collector status" on public.collector_status for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "delete own collector status" on public.collector_status for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on
  public.projects, public.tasks, public.time_entries, public.notes, public.boards,
  public.ai_accounts, public.model_prices, public.collector_tokens
  to authenticated;
grant select, delete on public.usage_daily, public.collector_status to authenticated;

revoke all on function public.start_timer(uuid) from public, anon;
revoke all on function public.stop_timer() from public, anon;
grant execute on function public.start_timer(uuid) to authenticated;
grant execute on function public.stop_timer() to authenticated;
revoke all on function public.ingest_usage(text, jsonb, jsonb) from public;
grant execute on function public.ingest_usage(text, jsonb, jsonb) to anon, authenticated;

-- El cronómetro se sincroniza en vivo entre el Mac y el celular.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.time_entries;
  end if;
end;
$$;


-- =====================================================================
-- 20260911000002_notes_media.sql
-- =====================================================================
-- OS Vena Digital — imágenes de notas (Storage) y vista previa de links.

-- ---------------------------------------------------------------------------
-- Bucket privado para imágenes de notas: notes/<user_id>/<archivo>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "notes images: read own" on storage.objects for select to authenticated
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "notes images: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'notes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "notes images: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'notes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Vista previa de links (título, descripción, imagen) sin servicios externos.
-- Usa la extensión http de Postgres. Si falla, la app guarda el link igual.
-- ---------------------------------------------------------------------------
create extension if not exists http with schema extensions;

create or replace function public.link_preview(p_url text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host text;
  v_resp extensions.http_response;
  v_html text;
  v_title text;
  v_desc text;
  v_image text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_url is null or p_url !~* '^https?://[^/\s]+' or char_length(p_url) > 2000 then
    raise exception 'invalid url' using errcode = '22023';
  end if;

  v_host := lower(substring(p_url from '^https?://(?:[^@/]*@)?([^/:?#]+)'));
  -- Sin IPs ni nombres internos: solo dominios públicos.
  if v_host is null
     or v_host !~ '^[a-z0-9.-]+\.[a-z]{2,}$'
     or v_host ~ '(^|\.)(localhost|local|internal|lan|home|corp)$' then
    return jsonb_build_object('site', v_host);
  end if;

  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '4000');
    v_resp := extensions.http_get(p_url);
  exception when others then
    return jsonb_build_object('site', v_host);
  end;

  if v_resp.status >= 400 or v_resp.content is null then
    return jsonb_build_object('site', v_host);
  end if;

  v_html := left(v_resp.content, 400000);

  v_title := coalesce(
    (regexp_match(v_html, '<meta[^>]+property=["'']og:title["''][^>]*content=["'']([^"'']+)', 'i'))[1],
    (regexp_match(v_html, '<meta[^>]+content=["'']([^"'']+)["''][^>]*property=["'']og:title', 'i'))[1],
    (regexp_match(v_html, '<title[^>]*>([^<]+)</title>', 'i'))[1]
  );
  v_desc := coalesce(
    (regexp_match(v_html, '<meta[^>]+property=["'']og:description["''][^>]*content=["'']([^"'']+)', 'i'))[1],
    (regexp_match(v_html, '<meta[^>]+content=["'']([^"'']+)["''][^>]*property=["'']og:description', 'i'))[1],
    (regexp_match(v_html, '<meta[^>]+name=["'']description["''][^>]*content=["'']([^"'']+)', 'i'))[1]
  );
  v_image := coalesce(
    (regexp_match(v_html, '<meta[^>]+property=["'']og:image["''][^>]*content=["'']([^"'']+)', 'i'))[1],
    (regexp_match(v_html, '<meta[^>]+content=["'']([^"'']+)["''][^>]*property=["'']og:image', 'i'))[1]
  );
  if v_image is not null and v_image !~* '^https://' then
    v_image := null;
  end if;

  return jsonb_build_object(
    'site', v_host,
    'title', left(trim(replace(replace(replace(replace(v_title, '&amp;', '&'), '&quot;', '"'), '&#39;', ''''), '&#x27;', '''')), 200),
    'description', left(trim(replace(replace(replace(replace(v_desc, '&amp;', '&'), '&quot;', '"'), '&#39;', ''''), '&#x27;', '''')), 300),
    'image', left(v_image, 1000)
  );
end;
$$;

revoke all on function public.link_preview(text) from public, anon;
grant execute on function public.link_preview(text) to authenticated;
