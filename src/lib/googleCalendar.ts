// Translation between Google Calendar API resources and the app's calendar types.
import { addDays, differenceInCalendarDays } from 'date-fns';
import type { AttendeeStatus, CalendarEvent, CalendarEventInput, CalendarInfo } from '@/data/types';
import { dayKey, fromDayKey } from './time';

export type GoogleDate = { date?: string; dateTime?: string; timeZone?: string };

export type GoogleCalendar = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string;
  selected?: boolean;
  hidden?: boolean;
};

export type GoogleEvent = {
  id: string;
  calendarId: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GoogleDate;
  end?: GoogleDate;
  recurringEventId?: string;
  colorId?: string;
  eventType?: string;
  guestsCanModify?: boolean;
  hangoutLink?: string;
  attendees?: { email?: string; displayName?: string; responseStatus?: string; self?: boolean; organizer?: boolean }[];
  organizer?: { email?: string; self?: boolean };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
};

/** Google's event colors ("Lavanda" … "Tomate"), by colorId. */
export const EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb',
  '2': '#33b679',
  '3': '#8e24aa',
  '4': '#e67c73',
  '5': '#f6c026',
  '6': '#f5511d',
  '7': '#039be5',
  '8': '#616161',
  '9': '#3f51b5',
  '10': '#0b8043',
  '11': '#d60000',
};

const FALLBACK_COLOR = '#9d87c0';

export function fromGoogleCalendar(c: GoogleCalendar): CalendarInfo {
  return {
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    color: /^#[0-9a-f]{6}$/i.test(c.backgroundColor ?? '') ? c.backgroundColor! : FALLBACK_COLOR,
    primary: Boolean(c.primary),
    writable: c.accessRole === 'owner' || c.accessRole === 'writer',
    selected: c.selected !== false,
  };
}

/** Primary first, then the ones the user can write to, then by name. */
export function sortCalendars(list: CalendarInfo[]): CalendarInfo[] {
  return [...list].sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.writable) - Number(a.writable) || a.name.localeCompare(b.name, 'es'));
}

const STATUSES: AttendeeStatus[] = ['needsAction', 'accepted', 'declined', 'tentative'];

/** Google descriptions may carry HTML (invitations, Meet notes): keep the text. */
export function plainText(html: string): string {
  if (!/[<&]/.test(html)) return html;
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Null for cancelled or malformed events. */
export function fromGoogleEvent(e: GoogleEvent, calendar?: CalendarInfo): CalendarEvent | null {
  if (e.status === 'cancelled' || !e.start || !e.end) return null;
  const allDay = Boolean(e.start.date);
  const start = allDay ? fromDayKey(e.start.date!) : new Date(e.start.dateTime ?? '');
  const end = allDay ? fromDayKey(e.end.date ?? e.start.date!) : new Date(e.end.dateTime ?? '');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri;
  const ownEvent = !e.organizer || Boolean(e.organizer.self) || Boolean(e.guestsCanModify);
  return {
    id: e.id,
    calendarId: e.calendarId,
    title: e.summary?.trim() || '(Sin título)',
    description: plainText(e.description ?? ''),
    location: e.location ?? '',
    allDay,
    start: start.toISOString(),
    end: (end > start ? end : allDay ? addDays(start, 1) : start).toISOString(),
    seriesId: e.recurringEventId ?? null,
    attendees: (e.attendees ?? [])
      .filter((a) => a.email)
      .map((a) => ({
        email: a.email!,
        name: a.displayName ?? null,
        status: STATUSES.includes(a.responseStatus as AttendeeStatus) ? (a.responseStatus as AttendeeStatus) : 'needsAction',
        self: Boolean(a.self),
        organizer: Boolean(a.organizer),
      })),
    meetUrl: e.hangoutLink ?? video ?? null,
    htmlLink: e.htmlLink ?? null,
    colorId: e.colorId ?? null,
    canEdit: (calendar?.writable ?? false) && ownEvent && (e.eventType ?? 'default') === 'default',
  };
}

export function googleDates(input: Pick<CalendarEventInput, 'allDay' | 'start' | 'end'>, timeZone: string): { start: GoogleDate; end: GoogleDate } {
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (input.allDay) {
    // Google's all-day end is exclusive: at least the day after the start.
    const days = Math.max(1, differenceInCalendarDays(end, start));
    return { start: { date: dayKey(start) }, end: { date: dayKey(addDays(start, days)) } };
  }
  return { start: { dateTime: start.toISOString(), timeZone }, end: { dateTime: end.toISOString(), timeZone } };
}

export function toGoogleEvent(input: CalendarEventInput, timeZone: string) {
  return {
    summary: input.title.trim(),
    description: input.description,
    location: input.location.trim(),
    ...googleDates(input, timeZone),
    attendees: input.attendees.map((a) => (a.status ? { email: a.email, responseStatus: a.status } : { email: a.email })),
  };
}

export function eventColor(event: Pick<CalendarEvent, 'colorId'>, calendar?: Pick<CalendarInfo, 'color'>): string {
  return (event.colorId && EVENT_COLORS[event.colorId]) || calendar?.color || FALLBACK_COLOR;
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;
export const isEmail = (s: string) => EMAIL.test(s.trim());
