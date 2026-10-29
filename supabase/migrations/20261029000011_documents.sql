-- Documentos: PDFs para leer y anotar.
-- El PDF original queda intacto en el bucket privado `documents`, en
-- documents/<user_id>/<document_id>.pdf; los trazos, textos, formas, resaltados y
-- notas van aparte en documents.annotations (JSON por página). "Descargar PDF
-- anotado" los incrusta en una copia desde el navegador.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  file_path text not null check (char_length(file_path) between 1 and 300),
  file_size bigint not null default 0 check (file_size >= 0),
  page_count integer not null default 0 check (page_count >= 0),
  annotations jsonb not null default '{}'::jsonb,
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_updated_idx on public.documents (user_id, updated_at desc);
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

alter table public.documents enable row level security;
create policy "own documents" on public.documents for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.documents to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy "documents: read own" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
