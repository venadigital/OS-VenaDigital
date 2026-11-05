import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '@/components/ui';
import type { CalendarEvent } from '@/data/types';
import { hhmm } from '@/lib/format';
import { eventLink } from '@/features/calendario/useAgendaEvents';

/** The events of one day, above its to-dos. Those already over read dimmer. */
export function AgendaList({ events, now, colorOf, boxed }: { events: CalendarEvent[]; now: Date; colorOf: (e: CalendarEvent) => string; boxed?: boolean }) {
  if (!events.length) return null;
  return (
    <ul className={cx('notas-agenda', boxed && 'is-boxed')} aria-label="Agenda">
      {events.map((e) => (
        <li key={`${e.id}:${e.start}`}>
          <Link to={eventLink(e)} className={cx('notas-agenda-row', new Date(e.end) <= now && 'is-past')} style={{ '--ev': colorOf(e) } as CSSProperties}>
            <span className="notas-agenda-time tnum">{e.allDay ? 'Todo el día' : hhmm(new Date(e.start))}</span>
            <i aria-hidden="true" />
            <span className="notas-agenda-title">{e.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
