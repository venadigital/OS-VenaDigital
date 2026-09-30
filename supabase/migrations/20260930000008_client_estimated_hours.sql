-- Clientes de proyecto: horas estimadas, para medir las horas reales contra el presupuesto.
alter table public.clients
  add column estimated_hours numeric(7, 2) check (estimated_hours is null or estimated_hours >= 0);
