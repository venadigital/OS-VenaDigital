-- Clientes: palabras clave para unir carpetas de IA, y foto o logo.
--
-- ai_keywords: una carpeta de Claude Code / Codex cuenta para el cliente si su nombre
-- contiene alguna de estas palabras (sin distinguir mayúsculas, tildes, guiones ni emoji).
-- logo_path: imagen en el bucket privado `clients`, en clients/<user_id>/<archivo>.

alter table public.clients
  add column ai_keywords text[] not null default '{}'
    check (cardinality(ai_keywords) <= 20),
  add column logo_path text check (logo_path is null or char_length(logo_path) <= 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clients', 'clients', false, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do nothing;

create policy "client logos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'clients' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "client logos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'clients' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "client logos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'clients' and (storage.foldername(name))[1] = (select auth.uid())::text);
