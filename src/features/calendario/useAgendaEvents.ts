import { useMemo } from 'react';
import { useAccount } from '@/data/ApiContext';
import { useCalendarEvents, useCalendars, useCalendarStatus } from '@/data/hooks';
import type { CalendarEvent } from '@/data/types';
import { eventColor } from '@/lib/googleCalendar';
import { isVisible, readPrefs } from './model';

/** Events in [from, to) of the same calendars the Calendario page shows, with their colors. */
export function useAgendaEvents(from: Date, to: Date) {
  const { user, mode } = useAccount();
  const statusQ = useCalendarStatus();
  const connected = Boolean(statusQ.data?.connected);
  const calendarsQ = useCalendars(connected);
  const shown = useMemo(() => {
    const visible = mode === 'demo' ? {} : readPrefs(`${mode}:${user.id}`).visible;
    return (calendarsQ.data ?? []).filter((c) => isVisible(c, visible));
  }, [calendarsQ.data, mode, user.id]);
  const eventsQ = useCalendarEvents(from, to, connected ? shown : undefined);
  const byId = useMemo(() => new Map((calendarsQ.data ?? []).map((c) => [c.id, c])), [calendarsQ.data]);
  return {
    statusQ,
    connected,
    calendarsQ,
    shown,
    eventsQ,
    colorOf: (e: CalendarEvent) => eventColor(e, byId.get(e.calendarId)),
  };
}

export const eventLink = (e: CalendarEvent) => `/calendario?evento=${encodeURIComponent(e.id)}`;
