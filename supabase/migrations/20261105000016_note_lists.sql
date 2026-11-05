-- Notas: áreas y proyectos con secciones. Son propios de Notas, no los proyectos de Tiempo.
-- Borrar una lista o una sección nunca borra tareas: solo les quita el vínculo.
create table public.note_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'proyecto' check (kind in ('area', 'proyecto')),
  area_id uuid references public.note_lists (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index note_lists_user_idx on public.note_lists (user_id, sort);
create index note_lists_area_idx on public.note_lists (area_id);
create trigger note_lists_set_updated_at before update on public.note_lists
  for each row execute function public.set_updated_at();

create table public.note_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid not null references public.note_lists (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index note_sections_list_idx on public.note_sections (list_id, sort);
create index note_sections_user_idx on public.note_sections (user_id);
create trigger note_sections_set_updated_at before update on public.note_sections
  for each row execute function public.set_updated_at();

alter table public.notes
  add column list_id uuid references public.note_lists (id) on delete set null,
  add column section_id uuid references public.note_sections (id) on delete set null;
create index notes_list_idx on public.notes (list_id);
create index notes_section_idx on public.notes (section_id);

-- Un proyecto solo cuelga de un área propia. Va en un trigger porque una política de
-- note_lists que consulte note_lists se llamaría a sí misma sin fin.
create or replace function public.check_note_list_area()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.area_id is not null and (
    new.kind <> 'proyecto'
    or not exists (select 1 from public.note_lists a where a.id = new.area_id and a.kind = 'area')
  ) then
    raise exception 'el área no es válida' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger note_lists_check_area before insert or update of area_id, kind on public.note_lists
  for each row execute function public.check_note_list_area();

-- Una tarea solo puede estar en una sección de su propia lista.
create or replace function public.keep_note_section_in_list()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.section_id is not null and (
    new.list_id is null
    or not exists (select 1 from public.note_sections s where s.id = new.section_id and s.list_id = new.list_id)
  ) then
    new.section_id := null;
  end if;
  return new;
end;
$$;
create trigger notes_keep_section before insert or update of list_id, section_id on public.notes
  for each row execute function public.keep_note_section_in_list();

alter table public.note_lists enable row level security;
alter table public.note_sections enable row level security;

create policy "own note lists" on public.note_lists for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "own note sections" on public.note_sections for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.note_lists l where l.id = list_id and l.user_id = (select auth.uid()))
  );

drop policy "own notes" on public.notes;
create policy "own notes" on public.notes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (list_id is null or exists (select 1 from public.note_lists l where l.id = list_id and l.user_id = (select auth.uid())))
  );

grant select, insert, update, delete on public.note_lists, public.note_sections to authenticated;
