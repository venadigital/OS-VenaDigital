import { describe, expect, it } from 'vitest';
import type { Note } from '@/data/types';
import {
  carriedLabel,
  cleanSteps,
  deadlineLabel,
  defaultWhen,
  joinTask,
  noteView,
  sortTasks,
  taskNotes,
  taskPatch,
  taskTitle,
  taskView,
  whenOf,
  upcomingGroups,
  viewCounts,
  weekend,
  whenBucket,
  whenDate,
  whenLabel,
} from './tasks';

const now = new Date(2026, 10, 5, 11, 0); // jueves 5 nov 2026
const today = '2026-11-05';
const iso = new Date(2026, 9, 1).toISOString();

const note = (patch: Partial<Note> = {}): Note => ({
  id: 'n',
  type: 'hacer',
  body: 'Tarea',
  url: null,
  link_title: null,
  link_description: null,
  link_image: null,
  link_site: null,
  image_path: null,
  pinned: false,
  done: false,
  due_date: null,
  bucket: 'entrada',
  deadline: null,
  checklist: [],
  completed_at: null,
  list_id: null,
  section_id: null,
  created_at: iso,
  updated_at: iso,
  ...patch,
});

describe('taskView', () => {
  it.each([
    ['sin fecha', {}, 'entrada'],
    ['hecha, aunque tenga fecha', { done: true, due_date: today }, 'registro'],
    ['planeada para hoy', { due_date: today }, 'hoy'],
    ['planeada para un día que ya pasó', { due_date: '2026-11-01' }, 'hoy'],
    ['con fecha límite vencida', { deadline: '2026-11-04' }, 'hoy'],
    ['con fecha límite hoy aunque esté en Algún día', { bucket: 'algun_dia', deadline: today }, 'hoy'],
    ['planeada para otro día', { due_date: '2026-11-06' }, 'proximo'],
    ['con fecha límite futura', { deadline: '2026-11-20' }, 'proximo'],
    ['en Cuando sea', { bucket: 'cuando_sea' }, 'cuando'],
    ['sin fecha pero dentro de una lista', { list_id: 'l' }, 'cuando'],
    ['dentro de una lista y en Algún día', { list_id: 'l', bucket: 'algun_dia' }, 'algun'],
    ['dentro de una lista y para hoy', { list_id: 'l', due_date: today }, 'hoy'],
    ['en Algún día', { bucket: 'algun_dia' }, 'algun'],
    ['en Algún día con fecha límite futura', { bucket: 'algun_dia', deadline: '2026-11-20' }, 'algun'],
  ] as const)('%s', (_, patch, view) => {
    expect(taskView(note(patch), today)).toBe(view);
  });

  it('sends links, notes and inspiration to the wall, done or not', () => {
    expect(noteView(note({ type: 'link' }), today)).toBe('muro');
    expect(noteView(note({ type: 'inspiracion', due_date: today }), today)).toBe('muro');
    expect(noteView(note({ type: 'investigar', due_date: today }), today)).toBe('hoy');
  });
});

describe('title and notes', () => {
  it('reads the first line as the title and the rest as notes', () => {
    expect(taskTitle('Llamar\nPreguntar por\nlas facturas')).toBe('Llamar');
    expect(taskNotes('Llamar\nPreguntar por\nlas facturas')).toBe('Preguntar por\nlas facturas');
  });
  it('keeps a body without line breaks as the title', () => {
    expect(taskTitle('Solo título')).toBe('Solo título');
    expect(taskNotes('Solo título')).toBe('');
  });
  it('joins them back without stray lines', () => {
    expect(joinTask('  Llamar ', '  ')).toBe('Llamar');
    expect(joinTask('Llamar', ' Preguntar ')).toBe('Llamar\nPreguntar');
  });
});

describe('cuándo', () => {
  it('starts a to-do where it was created', () => {
    expect(defaultWhen('hoy', today)).toEqual({ due_date: today, bucket: 'cuando_sea' });
    expect(defaultWhen('cuando', today)).toEqual({ due_date: null, bucket: 'cuando_sea' });
    expect(defaultWhen('algun', today)).toEqual({ due_date: null, bucket: 'algun_dia' });
    expect(defaultWhen('proximo', today)).toEqual({ due_date: null, bucket: 'entrada' });
    expect(defaultWhen('muro', today)).toEqual({ due_date: null, bucket: 'entrada' });
  });
  it('reads a to-do in a list as out of Entrada', () => {
    expect(whenOf(note({ list_id: 'l' }))).toEqual({ due_date: null, bucket: 'cuando_sea' });
    expect(whenOf(note({}))).toEqual({ due_date: null, bucket: 'entrada' });
    expect(whenOf(note({ list_id: 'l', bucket: 'algun_dia' })).bucket).toBe('algun_dia');
  });
  it('does not fall back to Entrada when its date is cleared', () => {
    expect(whenDate('2026-11-06').bucket).toBe('cuando_sea');
  });
  it('names each option', () => {
    expect(whenLabel(whenDate(today), now)).toBe('Hoy');
    expect(whenLabel(whenDate('2026-11-06'), now)).toBe('Mañana');
    expect(whenLabel(whenDate('2026-11-10'), now)).toBe('Mar 10 nov');
    expect(whenLabel(whenBucket('entrada'), now)).toBe('Entrada');
    expect(whenLabel(whenBucket('algun_dia'), now)).toBe('Algún día');
  });
  it('uses the coming Saturday, or today on a weekend', () => {
    expect(weekend(now)).toBe('2026-11-07');
    expect(weekend(new Date(2026, 10, 7))).toBe('2026-11-07');
    expect(weekend(new Date(2026, 10, 8))).toBe('2026-11-08');
  });
  it('tells how long a planned to-do has been waiting', () => {
    expect(carriedLabel({ due_date: '2026-11-04' }, now)).toBe('Desde ayer');
    expect(carriedLabel({ due_date: '2026-11-01' }, now)).toBe('Desde hace 4 días');
    expect(carriedLabel({ due_date: today }, now)).toBeNull();
    expect(carriedLabel({ due_date: null }, now)).toBeNull();
  });
});

describe('deadlineLabel', () => {
  it('flags late and same-day deadlines', () => {
    expect(deadlineLabel('2026-11-04', now)).toEqual({ text: 'Venció ayer', late: true });
    expect(deadlineLabel('2026-11-02', now)).toEqual({ text: 'Venció hace 3 días', late: true });
    expect(deadlineLabel(today, now)).toEqual({ text: 'Vence hoy', late: true });
  });
  it('counts the days left otherwise', () => {
    expect(deadlineLabel('2026-11-06', now)).toEqual({ text: 'Vence mañana', late: false });
    expect(deadlineLabel('2026-11-08', now)).toEqual({ text: 'Faltan 3 días', late: false });
  });
});

describe('sortTasks', () => {
  const titles = (list: Note[]) => list.map((n) => n.id);
  it('puts late deadlines first in Hoy, then pinned, then newest', () => {
    const list = [
      note({ id: 'vieja', created_at: '2026-10-01T00:00:00Z' }),
      note({ id: 'nueva', created_at: '2026-10-09T00:00:00Z' }),
      note({ id: 'fijada', pinned: true }),
      note({ id: 'vencida', deadline: '2026-11-04' }),
    ];
    expect(titles(sortTasks(list, 'hoy', today))).toEqual(['vencida', 'fijada', 'nueva', 'vieja']);
  });
  it('lists the latest done first in Registro, falling back to the last edit', () => {
    const list = [
      note({ id: 'antes', done: true, completed_at: '2026-11-01T00:00:00Z' }),
      note({ id: 'sin fecha', done: true, completed_at: null, updated_at: '2026-11-03T00:00:00Z' }),
      note({ id: 'ahora', done: true, completed_at: '2026-11-05T00:00:00Z' }),
    ];
    expect(titles(sortTasks(list, 'registro', today))).toEqual(['ahora', 'sin fecha', 'antes']);
  });
});

describe('upcomingGroups', () => {
  it('groups by day for a week and by month after that, in date order', () => {
    const groups = upcomingGroups(
      [
        note({ id: 'enero', due_date: '2027-01-15' }),
        note({ id: 'lunes', due_date: '2026-11-09' }),
        note({ id: 'limite', deadline: '2026-11-06' }),
        note({ id: 'viernes', due_date: '2026-11-06' }),
        note({ id: 'semana-justa', due_date: '2026-11-12' }),
        note({ id: 'mes', due_date: '2026-11-13' }),
      ],
      now,
    );
    expect(groups.map((g) => [g.title, g.day, g.tasks.length])).toEqual([
      ['Viernes', 6, 2],
      ['Lunes', 9, 1],
      ['Jueves', 12, 1],
      ['Noviembre', undefined, 1],
      ['Enero 2027', undefined, 1],
    ]);
  });
});

describe('viewCounts', () => {
  it('counts each view, the late ones and the wall', () => {
    const counts = viewCounts(
      [
        note({}),
        note({ due_date: today }),
        note({ deadline: '2026-11-04' }),
        note({ due_date: today, deadline: today, done: true }),
        note({ type: 'link' }),
        note({ type: 'nota' }),
      ],
      today,
    );
    expect(counts).toEqual({ entrada: 1, hoy: 2, proximo: 0, cuando: 0, algun: 0, registro: 1, late: 1, muro: 2 });
  });
});

describe('taskPatch', () => {
  it('builds what gets saved, leaving out empty steps', () => {
    expect(
      taskPatch({
        type: 'investigar',
        title: ' Comparar ',
        notes: 'Precios',
        when: whenDate(today),
        deadline: '',
        steps: [{ id: 'a', text: ' Uno ', done: true }, { id: 'b', text: '   ', done: false }],
        listId: 'l',
        sectionId: 's',
      }),
    ).toEqual({
      type: 'investigar',
      body: 'Comparar\nPrecios',
      due_date: today,
      bucket: 'cuando_sea',
      deadline: null,
      checklist: [{ id: 'a', text: 'Uno', done: true }],
      list_id: 'l',
      section_id: 's',
    });
  });
  it('drops the section when there is no list', () => {
    const patch = taskPatch({ type: 'hacer', title: 'x', notes: '', when: whenBucket('entrada'), deadline: '', steps: [], listId: null, sectionId: 's' });
    expect(patch.section_id).toBeNull();
  });
  it('cleanSteps keeps the order', () => {
    expect(cleanSteps([{ id: 'a', text: 'Uno', done: false }, { id: 'b', text: 'Dos', done: true }]).map((s) => s.id)).toEqual(['a', 'b']);
  });
});
