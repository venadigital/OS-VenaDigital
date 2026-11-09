-- Notas: el orden que se le da a mano a las tareas al arrastrarlas.
-- sort ordena las vistas, las áreas y los proyectos; today_sort ordena solo Hoy, para que
-- planear el día no desordene los proyectos. Vacías, cada lista conserva su orden de siempre.
alter table public.notes
  add column sort double precision,
  add column today_sort double precision;
