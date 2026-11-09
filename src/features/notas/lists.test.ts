import { describe, expect, it } from 'vitest';
import type { Note, NoteList, NoteSection } from '@/data/types';
import { groupBySection, listTree, moveSort, nextSort, progressByList, siblings } from './lists';

const iso = '2026-10-01T00:00:00.000Z';
const list = (id: string, patch: Partial<NoteList> = {}): NoteList => ({ id, kind: 'proyecto', area_id: null, name: id, description: '', sort: 0, created_at: iso, updated_at: iso, ...patch });
const section = (id: string, patch: Partial<NoteSection> = {}): NoteSection => ({ id, list_id: 'l', name: id, sort: 0, created_at: iso, updated_at: iso, ...patch });
const note = (id: string, patch: Partial<Note> = {}): Note => ({
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
  due_date: null,
  bucket: 'entrada',
  deadline: null,
  checklist: [],
  completed_at: null,
  list_id: 'l',
  section_id: null,
  sort: null,
  today_sort: null,
  created_at: iso,
  updated_at: iso,
  ...patch,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('listTree', () => {
  it('splits projects by area, in their order, keeping loose ones apart', () => {
    const tree = listTree([
      list('b', { area_id: 'vena', sort: 1 }),
      list('a', { area_id: 'vena', sort: 0 }),
      list('suelto'),
      list('vena', { kind: 'area', sort: 1 }),
      list('casa', { kind: 'area', sort: 0 }),
    ]);
    expect(ids(tree.loose)).toEqual(['suelto']);
    expect(tree.areas.map((a) => [a.area.id, ids(a.projects)])).toEqual([['casa', []], ['vena', ['a', 'b']]]);
  });
  it('shows a project whose area is gone as loose', () => {
    expect(ids(listTree([list('huerfano', { area_id: 'no-existe' })]).loose)).toEqual(['huerfano']);
  });
});

describe('progressByList', () => {
  it('counts only the to-dos of each list', () => {
    const progress = progressByList([
      note('a'),
      note('b', { done: true }),
      note('c', { type: 'investigar', done: true }),
      note('nota', { type: 'nota' }),
      note('otra', { list_id: 'otra' }),
      note('sin', { list_id: null }),
    ]);
    expect(progress.get('l')).toEqual({ done: 2, total: 3 });
    expect(progress.get('otra')).toEqual({ done: 0, total: 1 });
    expect(progress.size).toBe(2);
  });
});

describe('groupBySection', () => {
  it('puts what has no section first and keeps empty sections', () => {
    const groups = groupBySection(
      [note('suelta'), note('en-b', { section_id: 'b' }), note('borrada', { section_id: 'ya-no-existe' })],
      [section('b', { sort: 1 }), section('a', { sort: 0 })],
    );
    expect(groups.map((g) => [g.section?.id ?? null, ids(g.tasks)])).toEqual([
      [null, ['suelta', 'borrada']],
      ['a', []],
      ['b', ['en-b']],
    ]);
  });
  it('keeps the order they were dragged to inside a section, with new ones last', () => {
    const [group] = groupBySection([note('nueva'), note('segunda', { sort: 5 }), note('primera', { sort: 1 })], []);
    expect(ids(group.tasks)).toEqual(['primera', 'segunda', 'nueva']);
  });
  it('has no loose group when everything is in a section', () => {
    expect(groupBySection([note('x', { section_id: 'a' })], [section('a')]).map((g) => g.section?.id)).toEqual(['a']);
  });
  it('lists pinned first, then in the order they were written', () => {
    const groups = groupBySection(
      [note('nueva', { created_at: '2026-10-09T00:00:00Z' }), note('vieja', { created_at: '2026-10-01T00:00:00Z' }), note('fija', { pinned: true, created_at: '2026-10-05T00:00:00Z' })],
      [],
    );
    expect(ids(groups[0].tasks)).toEqual(['fija', 'vieja', 'nueva']);
  });
});

describe('nextSort', () => {
  it('goes after the last one and starts at zero', () => {
    expect(nextSort([])).toBe(0);
    expect(nextSort([{ sort: 3 }, { sort: 1 }])).toBe(4);
  });
});

describe('moveSort', () => {
  const items = [section('a', { sort: 0 }), section('b', { sort: 1 }), section('c', { sort: 2 })];
  it('swaps with the neighbor', () => {
    expect(moveSort(items, 'b', -1)).toEqual([{ id: 'b', sort: 0 }, { id: 'a', sort: 1 }]);
    expect(moveSort(items, 'b', 1)).toEqual([{ id: 'c', sort: 1 }, { id: 'b', sort: 2 }]);
  });
  it('does nothing at the ends', () => {
    expect(moveSort(items, 'a', -1)).toEqual([]);
    expect(moveSort(items, 'c', 1)).toEqual([]);
    expect(moveSort(items, 'nada', 1)).toEqual([]);
  });
  it('still reorders items that share a position', () => {
    const tied = [section('a', { sort: 0, created_at: '2026-10-01T00:00:00Z' }), section('b', { sort: 0, created_at: '2026-10-02T00:00:00Z' })];
    expect(moveSort(tied, 'b', -1)).toEqual([{ id: 'a', sort: 1 }]);
  });
});

describe('siblings', () => {
  const area = list('vena', { kind: 'area' });
  const inArea = list('a', { area_id: 'vena' });
  const loose = list('suelto');
  it('finds who a list moves among', () => {
    expect(ids(siblings(inArea, [area, inArea, loose]))).toEqual(['a']);
    expect(ids(siblings(loose, [area, inArea, loose]))).toEqual(['suelto']);
    expect(ids(siblings(area, [area, inArea, loose]))).toEqual(['vena']);
  });
});
