-- Notas: capa de tareas. Por hacer y Por investigar se ordenan en Entrada, Hoy, Próximo,
-- Cuando sea, Algún día y Registro; Link, Nota e Inspiración siguen en el muro.
-- due_date sigue siendo "Cuándo", así Inicio y las notas que ya existen no cambian.
alter table public.notes
  add column bucket text not null default 'entrada' check (bucket in ('entrada', 'cuando_sea', 'algun_dia')),
  add column deadline date,
  add column checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  add column completed_at timestamptz;

-- La pone la base al marcarla hecha y la borra al reabrirla, igual que en public.tasks.
create or replace function public.set_note_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.done then
    new.completed_at := null;
  elsif tg_op = 'INSERT' or not old.done then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

create trigger notes_set_completed_at before insert or update of done on public.notes
  for each row execute function public.set_note_completed_at();

-- Notas ya hechas: su última edición es la mejor fecha que tenemos.
update public.notes set completed_at = updated_at where done and completed_at is null;
