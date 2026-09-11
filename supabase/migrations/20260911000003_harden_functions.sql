-- link_preview no necesita privilegios extra: corre con los de la usuaria.
alter function public.link_preview(text) security invoker;

-- ingest_usage es para el colector (llave publicable + token del equipo); la app no la usa.
revoke execute on function public.ingest_usage(text, jsonb, jsonb) from authenticated;
comment on function public.ingest_usage(text, jsonb, jsonb) is
  'Llamada por el colector local con la llave publicable. Autoriza con un token por equipo (solo su SHA-256 vive en collector_tokens).';
