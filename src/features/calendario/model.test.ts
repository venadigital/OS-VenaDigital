import { describe, expect, it } from 'vitest';
import { agendaDays, isAllDayLike, layoutDay, viewRange } from './model';
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
