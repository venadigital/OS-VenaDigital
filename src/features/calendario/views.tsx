// The three ways to look at the calendar: hour grid (day / week), month and agenda.
import { useMemo, type CSSProperties, type MouseEvent } from 'react';
import { addDays, format, isSameDay, isSameMonth, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { MapPin, Repeat, Users, Video } from 'lucide-react';
import { cx } from '@/components/ui';
import type { CalendarEvent } from '@/data/types';
import { hhmm } from '@/lib/format';
import { daysIn } from '@/lib/time';
import { agendaDays, eventsOfDay, isAllDayLike, layoutDay } from './model';

const HOUR_PX = 52;
const SNAP_MIN = 30;
// The grid shows the working day and grows only when an event falls outside it, so the page never needs a second scrollbar.
const DAY_STARTS = 7;
const DAY_ENDS = 21;

export type ViewProps = {
  events: CalendarEvent[];
  colorOf: (e: CalendarEvent) => string;
  now: Date;
  onEvent: (e: CalendarEvent) => void;
  /** Empty time slot (or day) chosen: start a new event there. */
  onSlot: (start: Date, allDay: boolean) => void;
  onDay: (day: Date) => void;
};

const weekday = (d: Date) => format(d, 'EEE', { locale: es }).replace('.', '');
const selfStatus = (e: CalendarEvent) => e.attendees.find((a) => a.self)?.status;

/** Soft tint of the calendar color; pending invitations are outlined, declined ones struck through. */
function eventStyle(e: CalendarEvent, color: string): { className: string; style: CSSProperties } {
  const status = selfStatus(e);
  return {
    className: cx('cal-event', status === 'needsAction' && 'cal-event--pending', status === 'declined' && 'cal-event--declined'),
    style: { '--ev': color } as CSSProperties,
  };
}

const timeRange = (e: CalendarEvent) => `${hhmm(new Date(e.start))} – ${hhmm(new Date(e.end))}`;

// ---------------------------------------------------------------- hour grid
export function TimeGrid({ days, events, colorOf, now, onEvent, onSlot, onDay }: ViewProps & { days: Date[] }) {
  const strip = useMemo(() => days.map((d) => eventsOfDay(events, d).filter(isAllDayLike)), [days, events]);
  const placed = useMemo(() => days.map((d) => layoutDay(events, d)), [days, events]);
  const hasStrip = strip.some((list) => list.length > 0);
  const [firstHour, lastHour] = useMemo(() => {
    const all = placed.flat();
    const first = Math.min(DAY_STARTS, ...all.map((p) => Math.floor(p.top / 60)));
    const last = Math.max(DAY_ENDS, ...all.map((p) => Math.ceil((p.top + p.height) / 60)));
    return [Math.max(0, first), Math.min(24, last)];
  }, [placed]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const y = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR_PX;

  const slotAt = (day: Date, ev: MouseEvent<HTMLDivElement>) => {
    if (ev.target !== ev.currentTarget) return;
    const offset = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
    const clicked = firstHour * 60 + Math.floor(((offset / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN;
    const minutes = Math.min(1440 - SNAP_MIN, Math.max(0, clicked));
    onSlot(new Date(startOfDay(day).getTime() + minutes * 60_000), false);
  };

  return (
    <div className="cal-grid" style={{ '--cal-days': days.length } as CSSProperties}>
      <div className="cal-flow">
        <div className="cal-sticky">
          <div className="cal-row cal-head">
            <div className="cal-gutter" />
            {days.map((d) => (
              <button key={d.getTime()} type="button" className={cx('cal-dayhead', isSameDay(d, now) && 'is-today')} onClick={() => onDay(d)} title="Ver el día">
                <span>{weekday(d)}</span>
                <strong className="tnum">{d.getDate()}</strong>
              </button>
            ))}
          </div>

          {hasStrip && (
            <div className="cal-row cal-strip">
              <div className="cal-gutter">Todo el día</div>
              {days.map((d, i) => (
                <div key={d.getTime()} className="cal-strip-cell">
                  {strip[i].map((e) => (
                    <button key={e.id} type="button" {...eventStyle(e, colorOf(e))} onClick={() => onEvent(e)} title={e.title}>
                      <span className="cal-event-title">{e.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="cal-row cal-body" style={{ height: (lastHour - firstHour) * HOUR_PX, '--hour': `${HOUR_PX}px` } as CSSProperties}>
          <div className="cal-gutter cal-hours" aria-hidden="true">
            {Array.from({ length: lastHour - firstHour }, (_, i) => (
              <span key={i} className="tnum" style={{ top: i * HOUR_PX }}>
                {String(firstHour + i).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d.getTime()} className={cx('cal-col', isSameDay(d, now) && 'is-today')} onClick={(ev) => slotAt(d, ev)}>
              {placed[i].map(({ event: e, top, height, col, cols }) => (
                <button
                  key={e.id}
                  type="button"
                  {...eventStyle(e, colorOf(e))}
                  onClick={() => onEvent(e)}
                  title={`${e.title} · ${timeRange(e)}`}
                  style={{
                    '--ev': colorOf(e),
                    top: y(top),
                    height: Math.max(18, (height / 60) * HOUR_PX - 2),
                    left: `calc(${(col / cols) * 100}% + 1px)`,
                    width: `calc(${100 / cols}% - 3px)`,
                  } as CSSProperties}
                >
                  <span className="cal-event-title">{e.title}</span>
                  {height >= 45 && <span className="cal-event-time tnum">{timeRange(e)}</span>}
                  {height >= 75 && e.location && <span className="cal-event-time truncate">{e.location}</span>}
                </button>
              ))}
              {isSameDay(d, now) && nowMinutes >= firstHour * 60 && nowMinutes <= lastHour * 60 && <div className="cal-now" style={{ top: y(nowMinutes) }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- month
const MONTH_CHIPS = 3;

export function MonthGrid({ from, anchor, events, colorOf, now, onEvent, onSlot, onDay }: ViewProps & { from: Date; anchor: Date }) {
  const days = useMemo(() => daysIn(from, addDays(from, 42)), [from]);
  const byDay = useMemo(() => days.map((d) => eventsOfDay(events, d)), [days, events]);
  const openDay = (d: Date) => {
    // On the phone a cell is too small to hold events: open the day instead.
    if (window.matchMedia('(max-width: 767px)').matches) onDay(d);
    else onSlot(d, true);
  };
  return (
    <div className="cal-month">
      <div className="cal-month-head">
        {days.slice(0, 7).map((d) => (
          <span key={d.getTime()}>{weekday(d)}</span>
        ))}
      </div>
      <div className="cal-month-body">
        {days.map((d, i) => {
          const list = byDay[i];
          return (
            <div
              key={d.getTime()}
              className={cx('cal-cell', !isSameMonth(d, anchor) && 'is-outside', isSameDay(d, now) && 'is-today')}
              onClick={(ev) => ev.target === ev.currentTarget && openDay(d)}
            >
              <button type="button" className="cal-cell-day tnum" onClick={() => onDay(d)} aria-label={format(d, "EEEE d 'de' MMMM", { locale: es })}>
                {d.getDate()}
              </button>
              <div className="cal-cell-events">
                {list.slice(0, MONTH_CHIPS).map((e) => (
                  <button key={e.id} type="button" {...eventStyle(e, colorOf(e))} data-timed={!isAllDayLike(e) || undefined} onClick={() => onEvent(e)} title={e.title}>
                    {!isAllDayLike(e) && <span className="cal-event-time tnum">{hhmm(new Date(e.start))}</span>}
                    <span className="cal-event-title">{e.title}</span>
                  </button>
                ))}
                {list.length > MONTH_CHIPS && (
                  <button type="button" className="cal-more" onClick={() => onDay(d)}>
                    +{list.length - MONTH_CHIPS} más
                  </button>
                )}
              </div>
              <button type="button" className="cal-cell-dots" onClick={() => onDay(d)} tabIndex={-1} aria-hidden="true">
                {list.slice(0, 4).map((e) => (
                  <i key={e.id} style={{ background: colorOf(e) }} />
                ))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- agenda
export function Agenda({ from, to, events, colorOf, now, onEvent }: ViewProps & { from: Date; to: Date }) {
  const groups = useMemo(() => agendaDays(events, from, to), [events, from, to]);
  if (groups.length === 0) return <p className="cal-agenda-empty">No hay eventos en estos días.</p>;
  return (
    <div className="cal-agenda">
      {groups.map(({ day, events: list }) => (
        <section key={day.getTime()} className={cx('cal-agenda-day', isSameDay(day, now) && 'is-today')}>
          <header>
            <strong className="tnum">{day.getDate()}</strong>
            <span>
              {isSameDay(day, now) ? 'Hoy' : isSameDay(day, addDays(now, 1)) ? 'Mañana' : weekday(day)}
              <small>{format(day, 'MMM', { locale: es }).replace('.', '')}</small>
            </span>
          </header>
          <ul>
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" {...eventStyle(e, colorOf(e))} onClick={() => onEvent(e)}>
                  <span className="cal-event-time tnum">{isAllDayLike(e) ? 'Todo el día' : timeRange(e)}</span>
                  <span className="cal-event-title">{e.title}</span>
                  <span className="cal-agenda-meta">
                    {e.meetUrl && <Video size={14} aria-label="Con videollamada" />}
                    {e.attendees.length > 1 && <Users size={14} aria-label="Con invitados" />}
                    {e.seriesId && <Repeat size={13} aria-label="Se repite" />}
                    {e.location && (
                      <span className="cal-agenda-place">
                        <MapPin size={13} />
                        {e.location}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
