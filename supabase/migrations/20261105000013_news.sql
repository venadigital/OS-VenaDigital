-- Noticias: panel diario de noticias de IA.
-- La Edge Function news-sync, con service role, llena estas tablas cada hora. Las noticias
-- no son de ninguna usuaria en particular: quien tenga sesión las lee, nadie las escribe.

create table public.news_sources (
  slug text primary key check (char_length(slug) between 1 and 60),
  name text not null check (char_length(name) between 1 and 120),
  site text not null check (char_length(site) between 1 and 200),
  last_checked_at timestamptz,
  last_ok_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300)
);

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  source text not null references public.news_sources (slug) on delete cascade,
  url text not null unique check (url ~ '^https?://' and char_length(url) <= 2048),
  title text not null check (char_length(title) between 1 and 400),
  summary text check (summary is null or char_length(summary) <= 600),
  image_url text check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2048)),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index news_items_published_idx on public.news_items (published_at desc);
create index news_items_source_published_idx on public.news_items (source, published_at desc);

alter table public.news_sources enable row level security;
alter table public.news_items enable row level security;
create policy "read news sources" on public.news_sources for select to authenticated using (true);
create policy "read news items" on public.news_items for select to authenticated using (true);
revoke all on public.news_sources, public.news_items from anon, authenticated;
grant select on public.news_sources, public.news_items to authenticated;

-- La función news-sync pregunta aquí si la llamada trae el secreto de Vault; así el secreto
-- no pasa por el repositorio ni por las variables de la función. Solo service role.
create function public.news_sync_authorized(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  expected text;
begin
  select decrypted_secret into expected from vault.decrypted_secrets where name = 'news_cron_secret' limit 1;
  return expected is not null and p_secret = expected;
end;
$$;
revoke all on function public.news_sync_authorized(text) from public, anon, authenticated;
