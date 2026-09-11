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
