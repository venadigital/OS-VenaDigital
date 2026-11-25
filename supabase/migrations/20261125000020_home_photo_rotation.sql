-- Inicio: cada cuánto cambia la foto.
-- visit: cada vez que se abre Inicio · hour: cada hora · day: cada día · week: cada semana (lunes).

alter table public.home_settings
  add column photo_rotation text not null default 'day'
    check (photo_rotation in ('visit', 'hour', 'day', 'week'));
