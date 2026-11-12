-- Inicio: lo que cada persona elige para su pantalla de inicio.
-- Una fila por usuario: la ciudad del clima (nombre y coordenadas), sus frases y sus fotos.
-- quotes: lista de { "text": "...", "author": "..." | null }; rota una por día.
-- photos: rutas dentro del bucket privado `home`, en home/<user_id>/<archivo>, en el
-- orden en que rotan.

create table public.home_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  city_name text check (city_name is null or char_length(city_name) between 1 and 160),
  city_lat double precision check (city_lat is null or city_lat between -90 and 90),
  city_lon double precision check (city_lon is null or city_lon between -180 and 180),
  quotes jsonb not null default '[]'::jsonb
    check (case when jsonb_typeof(quotes) = 'array' then jsonb_array_length(quotes) <= 500 else false end),
  photos text[] not null default '{}' check (cardinality(photos) <= 60),
  updated_at timestamptz not null default now()
);
create trigger home_settings_set_updated_at before update on public.home_settings
  for each row execute function public.set_updated_at();

alter table public.home_settings enable row level security;
create policy "own home settings" on public.home_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.home_settings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('home', 'home', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "home photos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'home' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "home photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'home' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "home photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'home' and (storage.foldername(name))[1] = (select auth.uid())::text);
