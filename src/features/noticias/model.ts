import { differenceInCalendarDays, differenceInHours, differenceInMinutes, isSameDay, startOfDay, subDays } from 'date-fns';
import { longDate } from '@/lib/format';
import { dayKey } from '@/lib/time';
import type { NewsItem, NewsSource } from '@/data/types';

export type NewsDay = { key: string; label: string; items: NewsItem[] };

/** Consecutive days, newest first. Expects the news already sorted that way. */
export function groupByDay(items: NewsItem[], now = new Date()): NewsDay[] {
  const days: NewsDay[] = [];
  for (const item of items) {
    const when = new Date(item.published_at);
    const key = dayKey(when);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(when, now), items: [item] });
  }
  return days;
}

export function dayLabel(d: Date, now = new Date()): string {
  if (isSameDay(d, now)) return 'Hoy';
  if (isSameDay(d, subDays(now, 1))) return 'Ayer';
  return longDate(d);
}

/** "ahora", "hace 12 min", "hace 3 h", "hace 2 días". */
export function ago(from: Date, now = new Date()): string {
  const minutes = differenceInMinutes(now, from);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = differenceInHours(now, from);
  if (hours < 24) return `hace ${hours} h`;
  const days = differenceInCalendarDays(startOfDay(now), startOfDay(from));
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** The most recent time any source answered. */
export function lastUpdate(sources: NewsSource[]): Date | null {
  const newest = sources.reduce<string | null>((best, s) => (s.last_ok_at && (!best || s.last_ok_at > best) ? s.last_ok_at : best), null);
  return newest ? new Date(newest) : null;
}

const STALE_MS = 24 * 3_600_000;

/** Sources that have failed for over a day: a site may have changed or started blocking. */
export function staleSources(sources: NewsSource[], now = new Date()): NewsSource[] {
  return sources.filter((s) => s.last_checked_at && s.last_error && (!s.last_ok_at || now.getTime() - new Date(s.last_ok_at).getTime() > STALE_MS));
}
