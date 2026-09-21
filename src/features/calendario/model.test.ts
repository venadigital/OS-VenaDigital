import { describe, expect, it } from 'vitest';
import { agendaDays, isAllDayLike, layoutDay, todayAgenda, viewRange } from './model';
import { fromGoogleEvent, googleDates, plainText } from '@/lib/googleCalendar';

const day = new Date(2026, 8, 21); // lunes 21 sep 2026
const at = (h: number, m = 0, d = 21) => new Date(2026, 8, d, h, m).toISOString();
const ev = (title: string, start: string, end: string, allDay = false) => ({ title, start, end, allDay });

describe('calendario · layout', () => {
  it('puts overlapping events side by side and leaves the rest full width', () => {
    const placed = layoutDay([ev('A', at(9), at(11)), ev('B', at(10), at(10, 30)), ev('C', at(10, 30), at(12)), ev('D', at(14), at(15))], day);
    const by = Object.fromEntries(placed.map((p) => [p.event.title, p]));
    expect([by.A.col, by.B.col, by.C.col]).toEqual([0, 1, 1]);
    expect(by.A.cols).toBe(2);
    expect(by.D).toMatchObject({ col: 0, cols: 1, top: 14 * 60, height: 60 });
  });

  it('clips events that cross midnight and keeps long ones in the strip', () => {
    const night = ev('Noche', at(22), at(2, 0, 22));
    expect(layoutDay([night], day)[0]).toMatchObject({ top: 22 * 60, height: 120 });
    expect(layoutDay([night], new Date(2026, 8, 22))[0]).toMatchObject({ top: 0, height: 120 });
    const trip = ev('Viaje', at(8), at(8, 0, 23));
    expect(isAllDayLike(trip)).toBe(true);
    expect(layoutDay([trip], day)).toHaveLength(0);
  });

  it('lists an all-day event on each of its days, never on the exclusive end day', () => {
    const trip = ev('Viaje', at(0, 0, 22), at(0, 0, 24), true);
    const days = agendaDays([trip], day, new Date(2026, 8, 28));
    expect(days.map((d) => d.day.getDate())).toEqual([22, 23]);
  });

  it('month view always spans six full weeks starting on Monday', () => {
    const { from, to } = viewRange('month', day);
    expect(from.getDay()).toBe(1);
    expect((to.getTime() - from.getTime()) / 86_400_000).toBe(42);
  });
});

describe('calendario · agenda de hoy', () => {
  const me = (status: 'accepted' | 'declined') => [{ email: 'yo@x.test', name: null, status, self: true, organizer: false }];
  const item = (title: string, start: string, end: string, extra: { allDay?: boolean; declined?: boolean } = {}) => ({
    ...ev(title, start, end, extra.allDay),
    attendees: extra.declined ? me('declined') : [],
  });
  const events = [
    item('Entrega', at(0), at(0, 0, 22), { allDay: true }),
    item('Planeación', at(8, 30), at(9)),
    item('Seguimiento', at(10), at(11)),
    item('Rechazada', at(10), at(10, 30), { declined: true }),
    item('Newsletter', at(15), at(16)),
    item('Mañana temprano', at(8, 0, 22), at(9, 0, 22)),
  ];

  it('highlights the next event and counts down to it', () => {
    const a = todayAgenda(events, new Date(2026, 8, 21, 9, 40));
    expect(a.count).toBe(4);
    expect(a.focus).toMatchObject({ live: false, minutes: 20 });
    expect(a.focus?.event.title).toBe('Seguimiento');
    expect(a.rest.map((r) => [r.event.title, r.past])).toEqual([['Planeación', true], ['Newsletter', false]]);
    expect(a.allDay.map((e) => e.title)).toEqual(['Entrega']);
  });

  it('shows the running meeting with the time left, and tomorrow once the day is over', () => {
    const live = todayAgenda(events, new Date(2026, 8, 21, 10, 25));
    expect(live.focus).toMatchObject({ live: true, minutes: 35 });
    const late = todayAgenda(events, new Date(2026, 8, 21, 20, 0));
    expect(late.focus).toBeNull();
    expect(late.tomorrow?.title).toBe('Mañana temprano');
  });
});

describe('calendario · Google', () => {
  const cal = { id: 'c', name: 'C', color: '#112233', primary: true, writable: true, selected: true };

  it('reads all-day dates as local days and marks invitations as read-only', () => {
    const e = fromGoogleEvent(
      { id: '1', calendarId: 'c', summary: 'Festivo', start: { date: '2026-09-21' }, end: { date: '2026-09-22' }, organizer: { self: false } },
      cal,
    )!;
    expect(new Date(e.start).getDate()).toBe(21);
    expect(new Date(e.start).getHours()).toBe(0);
    expect(e.allDay).toBe(true);
    expect(e.canEdit).toBe(false);
    expect(fromGoogleEvent({ id: '2', calendarId: 'c', status: 'cancelled' }, cal)).toBeNull();
  });

  it('writes all-day events with an exclusive end of at least one day', () => {
    const same = googleDates({ allDay: true, start: at(0), end: at(0) }, 'America/Bogota');
    expect(same).toEqual({ start: { date: '2026-09-21' }, end: { date: '2026-09-22' } });
    const timed = googleDates({ allDay: false, start: at(9), end: at(10) }, 'America/Bogota');
    expect(timed.start).toEqual({ dateTime: at(9), timeZone: 'America/Bogota' });
  });

  it('turns HTML descriptions into plain text', () => {
    expect(plainText('Hola<br>equipo &amp; <b>amigos</b>')).toBe('Hola\nequipo & amigos');
  });
});
