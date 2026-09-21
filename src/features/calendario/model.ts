// View ranges, day layout and local preferences for the calendar.
import { addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, isSameWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import type { CalendarEvent, CalendarInfo } from '@/data/types';

export type CalView = 'day' | 'week' | 'month' | 'agenda';
export const VIEW_LABELS: Record<CalView, string> = { day: 'Día', week: 'Semana', month: 'Mes', agenda: 'Agenda' };

const WEEK = { weekStartsOn: 1 as const };
const AGENDA_DAYS = 30;
const MS_MIN = 60_000;
const MS_DAY = 86_400_000;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Half-open [from, to). The month view covers the whole 6-week grid. */
export function viewRange(view: CalView, anchor: Date): { from: Date; to: Date } {
  if (view === 'day') {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (view === 'week') {
    const from = startOfWeek(anchor, WEEK);
    return { from, to: addDays(from, 7) };
  }
  if (view === 'month') {
    const from = startOfWeek(startOfMonth(anchor), WEEK);
    return { from, to: addDays(from, 42) };
  }
  const from = startOfDay(anchor);
  return { from, to: addDays(from, AGENDA_DAYS) };
}

export function shiftView(view: CalView, anchor: Date, delta: number): Date {
  if (view === 'day') return addDays(anchor, delta);
  if (view === 'week') return addWeeks(anchor, delta);
  if (view === 'month') return addMonths(anchor, delta);
  return addDays(anchor, delta * AGENDA_DAYS);
}

export function isCurrentView(view: CalView, anchor: Date, now: Date): boolean {
  if (view === 'week') return isSameWeek(anchor, now, WEEK);
  if (view === 'month') return isSameMonth(anchor, now);
  return isSameDay(anchor, now);
}

export function viewLabel(view: CalView, anchor: Date): string {
  const f = (d: Date, pattern: string) => format(d, pattern, { locale: es }).replace(/\./g, '');
  if (view === 'day') return cap(f(anchor, "EEEE d 'de' MMMM"));
  if (view === 'month') return cap(f(anchor, 'MMMM yyyy'));
  const { from, to } = viewRange(view, anchor);
  const last = addDays(to, -1);
  const sameMonth = from.getMonth() === last.getMonth();
  return `${f(from, sameMonth ? 'd' : 'd MMM')} – ${f(last, 'd MMM yyyy')}`;
}

/** All-day events and timed ones of 24 h or more live in the top strip, not in the hour grid. */
export function isAllDayLike(e: Pick<CalendarEvent, 'allDay' | 'start' | 'end'>): boolean {
  return e.allDay || new Date(e.end).getTime() - new Date(e.start).getTime() >= MS_DAY;
}

export function overlapsDay(e: Pick<CalendarEvent, 'start' | 'end'>, day: Date): boolean {
  const from = startOfDay(day).getTime();
  const start = new Date(e.start).getTime();
  const end = new Date(e.end).getTime();
  // Zero-length events still belong to the day they start in.
  return start < from + MS_DAY && (end > from || (end === start && start >= from));
}

/** Day order: strip events first, then by start; longer first on ties. */
export function sortEvents<T extends Pick<CalendarEvent, 'allDay' | 'start' | 'end' | 'title'>>(events: T[]): T[] {
  return [...events].sort(
    (a, b) =>
      Number(isAllDayLike(b)) - Number(isAllDayLike(a)) ||
      a.start.localeCompare(b.start) ||
      b.end.localeCompare(a.end) ||
      a.title.localeCompare(b.title, 'es'),
  );
}

export function eventsOfDay<T extends Pick<CalendarEvent, 'allDay' | 'start' | 'end' | 'title'>>(events: T[], day: Date): T[] {
  return sortEvents(events.filter((e) => overlapsDay(e, day)));
}

export type Placed<T> = {
  event: T;
  /** Minutes from midnight, clipped to the day. */
  top: number;
  height: number;
  col: number;
  cols: number;
};

const MIN_BLOCK = 25; // minutes an event occupies at least, so short ones stay readable

/** Side-by-side columns for overlapping timed events of one day. */
export function layoutDay<T extends Pick<CalendarEvent, 'allDay' | 'start' | 'end' | 'title'>>(events: T[], day: Date): Placed<T>[] {
  const dayStart = startOfDay(day).getTime();
  const items = eventsOfDay(events, day)
    .filter((e) => !isAllDayLike(e))
    .map((event) => {
      const top = Math.max(0, (new Date(event.start).getTime() - dayStart) / MS_MIN);
      const bottom = Math.min(1440, (new Date(event.end).getTime() - dayStart) / MS_MIN);
      return { event, top, height: Math.max(bottom - top, Math.min(MIN_BLOCK, 1440 - top)), col: 0, cols: 1 };
    });

  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(0, ...cluster.map((p) => p.col)) + 1;
    for (const p of cluster) placed.push({ ...p, cols });
    cluster = [];
  };
  for (const item of items) {
    if (cluster.length && item.top >= clusterEnd) flush();
    const taken = new Set(cluster.filter((p) => p.top + p.height > item.top).map((p) => p.col));
    let col = 0;
    while (taken.has(col)) col++;
    cluster.push({ ...item, col });
    clusterEnd = Math.max(clusterEnd, item.top + item.height);
  }
  if (cluster.length) flush();
  return placed;
}

/** Days of the range that have events, each with its sorted list. */
export function agendaDays<T extends Pick<CalendarEvent, 'allDay' | 'start' | 'end' | 'title'>>(events: T[], from: Date, to: Date): { day: Date; events: T[] }[] {
  const out: { day: Date; events: T[] }[] = [];
  for (let day = startOfDay(from); day < to; day = addDays(day, 1)) {
    const list = eventsOfDay(events, day);
    if (list.length) out.push({ day, events: list });
  }
  return out;
}

// ---------------------------------------------------------------- local preferences
type Prefs = { view?: CalView; visible: Record<string, boolean> };

export function readPrefs(scope: string): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(`vena-os-calendar-v1:${scope}`) ?? 'null');
    const view = ['day', 'week', 'month', 'agenda'].includes(raw?.view) ? (raw.view as CalView) : undefined;
    return { view, visible: raw?.visible && typeof raw.visible === 'object' ? raw.visible : {} };
  } catch {
    return { visible: {} };
  }
}

export function writePrefs(scope: string, prefs: Prefs) {
  try {
    localStorage.setItem(`vena-os-calendar-v1:${scope}`, JSON.stringify(prefs));
  } catch {
    /* Storage may be blocked; the calendar still works. */
  }
}

/** A calendar shows unless hidden here; by default it follows Google's own checkbox. */
export const isVisible = (c: CalendarInfo, visible: Record<string, boolean>) => visible[c.id] ?? c.selected;

// ---------------------------------------------------------------- today (Inicio)
type AgendaEvent = Pick<CalendarEvent, 'allDay' | 'start' | 'end' | 'title' | 'attendees'>;

export type TodayAgenda<T> = {
  /** Everything on today's calendar, declined invitations left out. */
  count: number;
  allDay: T[];
  /** The event happening now, or else the next one to start. */
  focus: { event: T; live: boolean; minutes: number } | null;
  /** The other timed events of the day, in order; `past` ones are already over. */
  rest: { event: T; past: boolean }[];
  /** First event of tomorrow, to fill an empty day. */
  tomorrow: T | null;
};

const declined = (e: AgendaEvent) => e.attendees.some((a) => a.self && a.status === 'declined');

export function todayAgenda<T extends AgendaEvent>(events: T[], now: Date): TodayAgenda<T> {
  const mine = events.filter((e) => !declined(e));
  const today = eventsOfDay(mine, now);
  const allDay = today.filter(isAllDayLike);
  const timed = today.filter((e) => !isAllDayLike(e));
  const t = now.getTime();
  const current = timed.find((e) => new Date(e.start).getTime() <= t && new Date(e.end).getTime() > t);
  const next = timed.find((e) => new Date(e.start).getTime() > t);
  const chosen = current ?? next ?? null;
  const focus = chosen
    ? {
        event: chosen,
        live: chosen === current,
        minutes: Math.max(1, Math.round(((chosen === current ? new Date(chosen.end).getTime() : new Date(chosen.start).getTime()) - t) / MS_MIN)),
      }
    : null;
  return {
    count: today.length,
    allDay,
    focus,
    rest: timed.filter((e) => e !== chosen).map((event) => ({ event, past: new Date(event.end).getTime() <= t })),
    tomorrow: eventsOfDay(mine, addDays(now, 1)).find((e) => !isAllDayLike(e)) ?? eventsOfDay(mine, addDays(now, 1))[0] ?? null,
  };
}
