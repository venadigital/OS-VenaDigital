import { describe, expect, it } from 'vitest';
import type { Task, TimeEntry } from '@/data/types';
import { exportFileName, exportRows } from './export';

const task = (id: string, name: string, extra: Partial<Task> = {}): Task => ({ id, project_id: 'p', name, archived: false, created_at: '2026-08-01T12:00:00', ...extra });
const entry = (task_id: string, start: string, end: string): TimeEntry => ({ id: `${task_id}-${start}`, task_id, started_at: start, ended_at: end });
const now = new Date('2026-10-18T12:00:00');

describe('exportRows', () => {
  const tasks = [
    task('a', 'Landing', { archived: true, completed_at: '2026-09-20T15:00:00', due_date: '2026-09-22' }),
    task('b', 'Campaña'),
    task('c', 'Vieja hecha', { archived: true }),
    task('d', 'Fuera del período'),
    task('e', 'Terminada sin horas en el período', { archived: true, completed_at: '2026-09-05T10:00:00' }),
  ];
  const entries = [
    entry('a', '2026-09-10T09:00:00', '2026-09-10T11:30:00'),
    entry('b', '2026-09-15T09:00:00', '2026-09-15T10:00:00'),
    entry('c', '2026-09-03T09:00:00', '2026-09-03T09:45:00'),
    entry('d', '2026-08-15T09:00:00', '2026-08-15T10:00:00'),
    entry('e', '2026-08-28T09:00:00', '2026-08-28T10:00:00'),
  ];

  it('keeps done and pending tasks with hours in the period, plus tasks finished in it', () => {
    const rows = exportRows(tasks, entries, '2026-09-01', '2026-09-30', now);
    expect(rows).toEqual([
      { name: 'Vieja hecha', completed: '2026-09-03', due: null, minutes: 45 },
      { name: 'Terminada sin horas en el período', completed: '2026-09-05', due: null, minutes: 0 },
      { name: 'Landing', completed: '2026-09-20', due: '2026-09-22', minutes: 150 },
      { name: 'Campaña', completed: null, due: null, minutes: 60 },
    ]);
  });

  it('counts both chosen days and clips sessions to the period', () => {
    const rows = exportRows(tasks, [entry('b', '2026-09-30T23:30:00', '2026-10-01T00:30:00')], '2026-09-30', '2026-09-30', now);
    expect(rows).toEqual([{ name: 'Campaña', completed: null, due: null, minutes: 30 }]);
  });
});

describe('exportFileName', () => {
  it('drops emoji and characters files cannot carry', () => {
    expect(exportFileName('👩🏽 Diana / Boldizar', '2026-09-01', '2026-09-30')).toBe('Tareas Diana Boldizar 2026-09-01 a 2026-09-30.xlsx');
  });
});
