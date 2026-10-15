import { describe, expect, it } from 'vitest';
import type { Note, Project, Task } from '@/data/types';
import { dueLabel, pendingItems } from './pending';

const now = new Date(2026, 9, 15, 11, 0); // jueves 15 oct 2026
const iso = new Date(2026, 9, 1).toISOString();

const project = (id: string, archived = false): Project => ({ id, name: id, color: '#000', archived, sort: 0, created_at: iso });
const task = (id: string, due: string | null, patch: Partial<Task> = {}): Task => ({ id, project_id: 'p1', name: id, archived: false, due_date: due, created_at: iso, ...patch });
const note = (id: string, due: string | null, patch: Partial<Note> = {}): Note => ({
  id,
  type: 'hacer',
  body: id,
  url: null,
  link_title: null,
  link_description: null,
  link_image: null,
  link_site: null,
  image_path: null,
  pinned: false,
  done: false,
  due_date: due,
  created_at: iso,
  updated_at: iso,
  ...patch,
});
const projects = new Map([['p1', project('p1')], ['old', project('old', true)]]);

describe('pendingItems', () => {
  it('puts today first, then overdue, upcoming and undated', () => {
    const items = pendingItems(
      [note('sin fecha', null), note('fijada', null, { pinned: true }), note('nota hoy', '2026-10-15'), note('lejos', '2026-10-30')],
      [task('mañana', '2026-10-16'), task('ayer', '2026-10-14'), task('hace una semana', '2026-10-08'), task('tarea hoy', '2026-10-15')],
      projects,
      now,
    );
    expect(items.map((i) => i.title)).toEqual(['nota hoy', 'tarea hoy', 'ayer', 'hace una semana', 'mañana', 'lejos', 'fijada', 'sin fecha']);
  });

  it('skips finished items, undated tasks and archived projects', () => {
    const items = pendingItems(
      [note('hecha', '2026-10-15', { done: true }), note('idea', '2026-10-15', { type: 'nota' })],
      [task('archivada', '2026-10-15', { archived: true }), task('sin fecha', null), task('proyecto viejo', '2026-10-15', { project_id: 'old' })],
      projects,
      now,
    );
    expect(items).toEqual([]);
  });
});

describe('dueLabel', () => {
  it('reads relative to today', () => {
    expect(dueLabel('2026-10-15', now)).toBe('Hoy');
    expect(dueLabel('2026-10-16', now)).toBe('Mañana');
    expect(dueLabel('2026-10-14', now)).toBe('Vencido ayer');
    expect(dueLabel('2026-10-20', now)).toBe('Mar 20 oct');
    expect(dueLabel(null, now)).toBe('Sin fecha');
  });
});
