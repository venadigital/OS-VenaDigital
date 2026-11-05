import { describe, expect, it } from 'vitest';
import type { Project, Task } from '@/data/types';
import { deliveriesFor } from './deliveries';

const iso = '2026-10-01T00:00:00.000Z';
const project = (id: string, archived = false): Project => ({ id, name: id, color: '#000', archived, sort: 0, created_at: iso });
const task = (id: string, due: string | null, patch: Partial<Task> = {}): Task => ({ id, project_id: 'p', name: id, archived: false, due_date: due, created_at: iso, ...patch });
const projects = new Map([['p', project('p')], ['viejo', project('viejo', true)]]);

describe('deliveriesFor', () => {
  it('splits open deliveries into today or late, and coming up, by date', () => {
    const { today, upcoming } = deliveriesFor(
      [
        task('mañana', '2026-11-06'),
        task('hoy', '2026-11-05'),
        task('atrasada', '2026-11-01'),
        task('sin fecha', null),
        task('hecha', '2026-11-05', { archived: true }),
        task('de un proyecto archivado', '2026-11-05', { project_id: 'viejo' }),
      ],
      projects,
      '2026-11-05',
    );
    expect(today.map((d) => d.task.id)).toEqual(['atrasada', 'hoy']);
    expect(upcoming.map((d) => [d.task.id, d.due, d.project?.id])).toEqual([['mañana', '2026-11-06', 'p']]);
  });
  it('keeps one just checked off while asked to', () => {
    const { today } = deliveriesFor([task('hecha', '2026-11-05', { archived: true })], projects, '2026-11-05', (id) => id === 'hecha');
    expect(today.map((d) => d.task.id)).toEqual(['hecha']);
  });
});
