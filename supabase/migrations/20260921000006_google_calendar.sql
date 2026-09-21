-- Calendario: conexión con Google Calendar.
-- Guarda el refresh token de Google de cada usuaria. Los eventos NO se copian aquí:
-- la Edge Function `google-calendar` los lee y escribe en vivo contra la API de Google.
--
-- La tabla es solo para el servidor: RLS activo y sin políticas, así que ni `anon`
-- ni `authenticated` pueden leerla. Solo la Edge Function (service role) entra.

create table public.google_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  refresh_token text not null,
  scopes text not null default '',
  access_token text,
  access_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger google_connections_updated_at
  before update on public.google_connections
  for each row execute function public.set_updated_at();

alter table public.google_connections enable row level security;
revoke all on public.google_connections from anon, authenticated;
