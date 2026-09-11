// Date ranges for the Día / Semana / Mes filters (local time, weeks start Monday).
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimeEntry } from '@/data/types';

export type RangeMode = 'day' | 'week' | 'month';

export const RANGE_LABELS: Record<RangeMode, string> = { day: 'Día', week: 'Semana', month: 'Mes' };

const WEEK = { weekStartsOn: 1 as const };

/** Half-open range [from, to). */
export function rangeFor(mode: RangeMode, anchor: Date): { from: Date; to: Date } {
  if (mode === 'day') {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (mode === 'week') {
    const from = startOfWeek(anchor, WEEK);
    return { from, to: addDays(from, 7) };
  }
  const from = startOfMonth(anchor);
  return { from, to: addDays(endOfMonth(anchor), 1) };
}

export function shiftAnchor(mode: RangeMode, anchor: Date, delta: number): Date {
  if (mode === 'day') return addDays(anchor, delta);
  if (mode === 'week') return addWeeks(anchor, delta);
  return addMonths(anchor, delta);
}

export function isCurrent(mode: RangeMode, anchor: Date, now = new Date()): boolean {
  if (mode === 'day') return isSameDay(anchor, now);
  if (mode === 'week') return isSameWeek(anchor, now, WEEK);
  return isSameMonth(anchor, now);
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function rangeLabel(mode: RangeMode, anchor: Date, now = new Date()): string {
  if (mode === 'day') {
    if (isSameDay(anchor, now)) return 'Hoy';
    if (isSameDay(anchor, subDays(now, 1))) return 'Ayer';
    return format(anchor, "EEE d 'de' MMM", { locale: es }).replace('.', '');
  }
  if (mode === 'week') {
    if (isSameWeek(anchor, now, WEEK)) return 'Esta semana';
    const { from, to } = rangeFor('week', anchor);
    const last = subDays(to, 1);
    const sameMonth = from.getMonth() === last.getMonth();
    const start = format(from, sameMonth ? 'd' : 'd MMM', { locale: es }).replace('.', '');
    return `${start} – ${format(last, 'd MMM', { locale: es }).replace('.', '')}`;
  }
  return cap(format(anchor, 'MMMM yyyy', { locale: es }));
}

export function dayKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Parse a yyyy-mm-dd key as a local date. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daysIn(from: Date, to: Date): Date[] {
  return eachDayOfInterval({ start: from, end: subDays(to, 1) });
}

/** Minutes of an entry that fall inside [from, to), counting a running entry up to now. */
export function overlapMinutes(e: Pick<TimeEntry, 'started_at' | 'ended_at'>, from: Date, to: Date, now: Date): number {
  const start = Math.max(new Date(e.started_at).getTime(), from.getTime());
  const end = Math.min(e.ended_at ? new Date(e.ended_at).getTime() : now.getTime(), to.getTime());
  return end > start ? (end - start) / 60000 : 0;
}

export function entryMinutes(e: Pick<TimeEntry, 'started_at' | 'ended_at'>, now: Date): number {
  const end = e.ended_at ? new Date(e.ended_at).getTime() : now.getTime();
  return Math.max(0, (end - new Date(e.started_at).getTime()) / 60000);
}
