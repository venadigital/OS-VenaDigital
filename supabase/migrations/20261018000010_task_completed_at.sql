-- Fecha en que se terminó una tarea, para exportar las tareas de un período.
-- La pone la base al marcarla hecha (archived = true) y la borra al reabrirla,
-- así sirve igual desde Tiempo o desde Clientes.
alter table public.tasks add column completed_at timestamptz;

create or replace function public.set_task_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.archived then
    new.completed_at := null;
  elsif tg_op = 'INSERT' or not old.archived then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

create trigger tasks_set_completed_at before insert or update of archived on public.tasks
  for each row execute function public.set_task_completed_at();

-- Tareas ya hechas: la fecha de su última sesión en Tiempo (sin sesiones, queda vacía).
update public.tasks t
   set completed_at = s.last_at
  from (
    select task_id, max(coalesce(ended_at, started_at)) as last_at
      from public.time_entries
     group by task_id
  ) s
 where t.archived and t.completed_at is null and s.task_id = t.id;
