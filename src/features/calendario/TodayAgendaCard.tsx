// "Agenda de hoy" on Inicio: what is on now or next, and the rest of the day.
import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { addDays, startOfDay } from 'date-fns';
import { ArrowUpRight, CalendarDays, Plus, Video } from 'lucide-react';
import { Card, cx, Skeleton } from '@/components/ui';
import type { CalendarEvent } from '@/data/types';
import { dur, hhmm } from '@/lib/format';
import { todayAgenda } from './model';
import { eventLink, useAgendaEvents } from './useAgendaEvents';

const MAX_ROWS = 3;
const timeRange = (e: CalendarEvent) => `${hhmm(new Date(e.start))} – ${hhmm(new Date(e.end))}`;

export function TodayAgendaCard({ now }: { now: Date }) {
  const dayStart = startOfDay(now).getTime();
  const { from, to } = useMemo(() => ({ from: new Date(dayStart), to: addDays(new Date(dayStart), 2) }), [dayStart]);
  const { statusQ, connected, calendarsQ, shown, eventsQ, colorOf } = useAgendaEvents(from, to);
  const agenda = useMemo(() => todayAgenda(eventsQ.data ?? [], now), [eventsQ.data, now]);

  const loading = statusQ.isLoading || (connected && (calendarsQ.isLoading || (eventsQ.isLoading && shown.length > 0)));
  // Too many rows: the ones already over go first.
  const upcoming = agenda.rest.filter((r) => !r.past);
  const rows = agenda.rest.length <= MAX_ROWS ? agenda.rest : upcoming.length >= MAX_ROWS ? upcoming.slice(0, MAX_ROWS) : agenda.rest.slice(-MAX_ROWS);
  const hidden = agenda.rest.length - rows.length;
  const focus = agenda.focus;

  return (
    <Card as="section" className="agenda-card">
      <div className="section-heading">
        <h2 className="metric-label">
          <span className="icon-tile"><CalendarDays size={18} /></span>
          Agenda de hoy
          {connected && !loading && <span className="count-badge">{agenda.count}</span>}
        </h2>
        <Link to="/calendario" className="text-link">
          Ver calendario <ArrowUpRight size={15} />
        </Link>
      </div>

      {loading ? (
        <Skeleton className="h-36" />
      ) : !connected ? (
        <div className="agenda-empty">
          <strong>Conecta tu Google Calendar</strong>
          <span>Tus reuniones del día aparecerán aquí.</span>
        </div>
      ) : eventsQ.error ? (
        <p className="text-[13.5px] text-ink-3">No se pudo leer tu calendario. Intenta de nuevo en un momento.</p>
      ) : agenda.count === 0 ? (
        <div className="agenda-empty">
          <strong className="agenda-clear">Día despejado</strong>
          <span>
            No tienes nada agendado hoy.
            {agenda.tomorrow && ` Mañana empiezas${agenda.tomorrow.allDay ? '' : ` a las ${hhmm(new Date(agenda.tomorrow.start))}`} con ${agenda.tomorrow.title}.`}
          </span>
        </div>
      ) : (
        <>
          {agenda.allDay.map((e) => (
            <Link key={e.id} to={eventLink(e)} className="agenda-allday" style={{ '--ev': colorOf(e) } as CSSProperties}>
              <small>Todo el día</small>
              <span>{e.title}</span>
            </Link>
          ))}

          {focus && (
            <div className={cx('agenda-focus', focus.live && 'is-live')}>
              <div className="agenda-focus-top">
                <span className="agenda-focus-when">
                  {focus.live && <i aria-hidden="true" />}
                  {focus.live ? `Ahora · quedan ${dur(focus.minutes)}` : `Próximo · en ${dur(focus.minutes)}`}
                </span>
                <span className="tnum">{timeRange(focus.event)}</span>
              </div>
              <div className="agenda-focus-main">
                <Link to={eventLink(focus.event)} className="min-w-0 flex-1">
                  <span className="agenda-focus-title">{focus.event.title}</span>
                  <Detail event={focus.event} />
                </Link>
                {focus.event.meetUrl && (
                  <a href={focus.event.meetUrl} target="_blank" rel="noreferrer" className="agenda-join">
                    <Video size={15} /> Unirse
                  </a>
                )}
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="agenda-list">
              {rows.map(({ event: e, past }) => (
                <Link key={e.id} to={eventLink(e)} className={cx('agenda-row', past && 'is-past')} style={{ '--ev': colorOf(e) } as CSSProperties}>
                  <span className="tnum">{hhmm(new Date(e.start))}</span>
                  <i aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="agenda-row-title">{e.title}</span>
                    {!past && <small>{[e.location, `hasta ${hhmm(new Date(e.end))}`].filter(Boolean).join(' · ')}</small>}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {hidden > 0 && (
            <Link to="/calendario" className="text-[13px] text-ink-3 hover:text-ink">
              +{hidden} más en el día
            </Link>
          )}
        </>
      )}

      <Link to={connected ? '/calendario?nuevo=1' : '/calendario'} className="text-link mt-auto">
        {connected ? <><Plus size={15} /> Nuevo evento</> : 'Conectar con Google'}
      </Link>
    </Card>
  );
}

/** Who is coming, or where it is. */
function Detail({ event }: { event: CalendarEvent }) {
  const guests = event.attendees.filter((a) => !a.self).map((a) => a.name ?? a.email);
  const text = guests.length ? (guests.length > 2 ? `${guests.slice(0, 2).join(', ')} y ${guests.length - 2} más` : guests.join(', ')) : event.location;
  return text ? <small>{text}</small> : null;
}
