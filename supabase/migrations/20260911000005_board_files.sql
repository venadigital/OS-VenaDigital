-- OS Vena Digital — imágenes de los tableros (Storage).
-- La escena de Excalidraw (boards.scene) guarda los trazos; cada imagen va aparte,
-- una sola vez, en boards/<user_id>/<board_id>/<file_id>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boards', 'boards', false, 5242880, array[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'image/bmp', 'image/x-icon', 'image/avif', 'image/jfif'
])
on conflict (id) do nothing;

create policy "board images: read own" on storage.objects for select to authenticated
  using (bucket_id = 'boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "board images: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "board images: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
