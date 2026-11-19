-- Teleprompter: guiones para leer en pantalla mientras se graba.
-- body es texto plano; una línea que empieza con "# " abre una sección (Gancho,
-- Desarrollo, Cierre) y las líneas en blanco separan párrafos.
-- Los ajustes de lectura (velocidad, tamaño, lado de la cámara, espejo) son de cada
-- dispositivo y viven en el navegador, no aquí.

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 100000),
  platform text not null default 'instagram' check (platform in ('instagram', 'youtube')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scripts_user_updated_idx on public.scripts (user_id, updated_at desc);
create trigger scripts_set_updated_at before update on public.scripts
  for each row execute function public.set_updated_at();

alter table public.scripts enable row level security;
create policy "own scripts" on public.scripts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.scripts to authenticated;
