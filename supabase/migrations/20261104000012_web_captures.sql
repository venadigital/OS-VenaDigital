-- Webs para anotar y capturas de pantalla.
-- Una web cargada por URL es un documento más: su PDF va al bucket `documents` y
-- documents.source_url guarda de dónde salió. Las capturas son imágenes aparte, en el
-- bucket privado `captures`, en captures/<user_id>/<capture_id>.<png|jpg>, y siguen
-- guardadas aunque se borre el documento del que salieron.

alter table public.documents
  add column source_url text check (source_url is null or char_length(source_url) <= 2048);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  file_path text not null check (char_length(file_path) between 1 and 300),
  file_size bigint not null default 0 check (file_size >= 0),
  width integer not null default 0 check (width >= 0),
  height integer not null default 0 check (height >= 0),
  thumbnail text,
  created_at timestamptz not null default now()
);
create index captures_user_created_idx on public.captures (user_id, created_at desc);
create index captures_document_idx on public.captures (document_id);

alter table public.captures enable row level security;
create policy "own captures" on public.captures for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.captures to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 52428800, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "captures: read own" on storage.objects for select to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "captures: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "captures: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid())::text);
