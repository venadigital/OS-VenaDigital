// Sample Google Calendar for the demo mode: a believable week around today.
import { addDays, addMinutes, setHours, setMinutes, startOfDay, startOfWeek } from 'date-fns';
import type { CalendarAttendee, CalendarEvent, CalendarInfo } from './types';

export const DEMO_CALENDARS: CalendarInfo[] = [
  { id: 'demo@vena.os', name: 'Vena Digital', color: '#9d87c0', primary: true, writable: true, selected: true },
  { id: 'personal', name: 'Personal', color: '#699775', primary: false, writable: true, selected: true },
  { id: 'festivos', name: 'Festivos en Colombia', color: '#c7ae94', primary: false, writable: false, selected: true },
];

const guest = (email: string, name: string, status: CalendarAttendee['status'] = 'accepted'): CalendarAttendee => ({ email, name, status, self: false, organizer: false });
const me = (organizer: boolean, status: CalendarAttendee['status'] = 'accepted'): CalendarAttendee => ({ email: 'demo@vena.os', name: 'Laura', status, self: true, organizer });

export function seedCalendar(now: Date): CalendarEvent[] {
  let n = 0;
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  const events: CalendarEvent[] = [];
  const at = (day: Date, h: number, m = 0) => setMinutes(setHours(startOfDay(day), h), m);
  const add = (e: Partial<Omit<CalendarEvent, 'start' | 'end'>> & { title: string; start: Date; minutes?: number; days?: number }) => {
    const { start, minutes, days, ...rest } = e;
    events.push({
      id: `demo-ev-${++n}`,
      calendarId: 'demo@vena.os',
      description: '',
      location: '',
      allDay: Boolean(days),
      seriesId: null,
      attendees: [],
      meetUrl: null,
      htmlLink: null,
      colorId: null,
      canEdit: true,
      ...rest,
      start: (days ? startOfDay(start) : start).toISOString(),
      end: (days ? addDays(startOfDay(start), days) : addMinutes(start, minutes ?? 60)).toISOString(),
    });
  };

  // Three weeks of the recurring rhythm, so moving between weeks is not empty.
  for (let w = -1; w <= 1; w++) {
    const week = addDays(monday, w * 7);
    for (let d = 0; d < 5; d++) add({ title: 'Planeación del día', start: at(addDays(week, d), 8, 30), minutes: 30, seriesId: 'demo-series-daily' });
    add({
      title: 'Seguimiento Academia IA',
      start: at(addDays(week, 1), 10),
      minutes: 60,
      seriesId: 'demo-series-academia',
      attendees: [me(true), guest('camila@academia.test', 'Camila Ríos'), guest('andres@academia.test', 'Andrés Mejía', 'tentative')],
      meetUrl: 'https://meet.google.com/demo-vena-os',
      description: 'Avance de la clase 5 y fechas de grabación.',
    });
    add({ title: 'Pilates', calendarId: 'personal', start: at(addDays(week, 1), 18), minutes: 60, seriesId: 'demo-series-pilates' });
    add({ title: 'Pilates', calendarId: 'personal', start: at(addDays(week, 3), 18), minutes: 60, seriesId: 'demo-series-pilates' });
  }

  add({
    title: 'Kickoff · sitio Pinares',
    start: at(monday, 11),
    minutes: 90,
    location: 'Oficina Pinares, Bogotá',
    attendees: [me(true), guest('gerencia@cliente.test', 'Marta Pinares', 'needsAction')],
    colorId: '6',
  });
  add({ title: 'Grabación podcast · ep. 13', start: at(addDays(monday, 2), 9), minutes: 120, colorId: '7' });
  add({
    title: 'Revisión de propuesta',
    start: at(addDays(monday, 2), 10, 30),
    minutes: 45,
    attendees: [{ ...guest('socio@aliado.test', 'Julián Ortiz'), organizer: true }, me(false, 'needsAction')],
    meetUrl: 'https://meet.google.com/demo-propuesta',
    canEdit: false,
  });
  add({ title: 'Almuerzo con Sofi', calendarId: 'personal', start: at(addDays(monday, 2), 12, 30), minutes: 75, location: 'Masa, Calle 70' });
  add({ title: 'Bloque profundo · OS Vena', start: at(addDays(monday, 3), 9), minutes: 180 });
  add({ title: 'Newsletter · cierre', start: at(addDays(monday, 4), 15), minutes: 60 });
  add({ title: 'Entrega carrusel Instagram', start: addDays(monday, 4), days: 1, colorId: '5' });
  add({ title: 'Viaje a Medellín', calendarId: 'personal', start: addDays(monday, 5), days: 2 });
  add({ title: 'Día festivo', calendarId: 'festivos', start: addDays(monday, 14), days: 1, canEdit: false });
  add({ title: 'Declaración de IVA', start: addDays(monday, 9), days: 1 });
  add({ title: 'Demo con cliente nuevo', start: at(addDays(monday, 8), 14), minutes: 60, meetUrl: 'https://meet.google.com/demo-cliente', attendees: [me(true), guest('hola@nuevo.test', 'Equipo Nuevo', 'needsAction')] });
  return events;
}
