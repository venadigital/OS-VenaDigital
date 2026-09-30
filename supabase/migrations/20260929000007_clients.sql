-- Clientes: ficha de cada cliente, su bitácora de interacciones y su facturación.
-- Un cliente se une a UN proyecto de Tiempo (clients.project_id, único); sus tareas
-- son las tareas de ese proyecto. Las facturas son solo registro: no hay pasarela de pago.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'activo' check (status in ('activo', 'pausa', 'cerrado', 'prospecto')),
  project_id uuid unique references public.projects (id) on delete set null,
  -- Contacto
  contact_name text check (char_length(contact_name) <= 120),
  contact_role text check (char_length(contact_role) <= 120),
  company text check (char_length(company) <= 160),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 60),
  channel text check (channel in ('whatsapp', 'correo', 'llamada', 'reunion')),
  city text check (char_length(city) <= 120),
  since date,
  notes text not null default '' check (char_length(notes) <= 4000),
  -- Acuerdo vigente
  agreement text not null default 'retainer' check (agreement in ('retainer', 'proyecto', 'horas')),
  currency text not null default 'COP' check (currency in ('COP', 'USD', 'EUR')),
  -- Retainer: tarifa mensual. Proyecto: valor total. Por horas: valor de la hora.
  fee numeric(14, 2) not null default 0 check (fee >= 0),
  included_hours numeric(6, 2) check (included_hours is null or included_hours >= 0),
  extra_hour_rate numeric(14, 2) check (extra_hour_rate is null or extra_hour_rate >= 0),
  billing_day smallint check (billing_day between 1 and 31),
  payment_terms_days smallint not null default 15 check (payment_terms_days between 0 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_user_idx on public.clients (user_id, name);
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

create table public.client_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null default 'nota' check (kind in ('reunion', 'llamada', 'correo', 'decision', 'entrega', 'nota')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 4000),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index client_logs_client_idx on public.client_logs (client_id, occurred_at desc);
create index client_logs_user_idx on public.client_logs (user_id, occurred_at desc);

create table public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  number text not null check (char_length(number) between 1 and 40),
  concept text not null default '' check (char_length(concept) <= 300),
  issued_on date not null default current_date,
  due_on date,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  currency text not null default 'COP' check (currency in ('COP', 'USD', 'EUR')),
  paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, number),
  constraint client_invoices_dates check (due_on is null or due_on >= issued_on)
);
create index client_invoices_client_idx on public.client_invoices (client_id, issued_on desc);
create trigger client_invoices_set_updated_at before update on public.client_invoices
  for each row execute function public.set_updated_at();

-- Fecha de entrega de una tarea (entregable). "Hecha" sigue siendo archived = true.
alter table public.tasks add column due_date date;

-- ---------------------------------------------------------------------------
-- Seguridad: cada usuaria ve y edita solo lo suyo, y solo puede unir sus propias filas.
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.client_logs enable row level security;
alter table public.client_invoices enable row level security;

create policy "own clients" on public.clients for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  );
create policy "own client logs" on public.client_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid()))
  );
create policy "own client invoices" on public.client_invoices for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.clients, public.client_logs, public.client_invoices to authenticated;
