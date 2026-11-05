// Areas, projects and their sections.
import type { Note, NoteList, NoteSection } from '@/data/types';
import { isTask } from './tasks';

const bySort = <T extends { sort: number; created_at: string }>(a: T, b: T) => a.sort - b.sort || a.created_at.localeCompare(b.created_at);

export type ListTree = { loose: NoteList[]; areas: { area: NoteList; projects: NoteList[] }[] };

/** Projects without an area first, then each area with its projects. */
export function listTree(lists: NoteList[]): ListTree {
  const sorted = [...lists].sort(bySort);
  const areas = sorted.filter((l) => l.kind === 'area');
  const areaIds = new Set(areas.map((a) => a.id));
  return {
    loose: sorted.filter((l) => l.kind === 'proyecto' && !(l.area_id && areaIds.has(l.area_id))),
    areas: areas.map((area) => ({ area, projects: sorted.filter((l) => l.kind === 'proyecto' && l.area_id === area.id) })),
  };
}

export type Progress = { done: number; total: number };

export function progressByList(notes: Note[]): Map<string, Progress> {
  const progress = new Map<string, Progress>();
  for (const n of notes) {
    if (!n.list_id || !isTask(n)) continue;
    const p = progress.get(n.list_id) ?? { done: 0, total: 0 };
    p.total += 1;
    if (n.done) p.done += 1;
    progress.set(n.list_id, p);
  }
  return progress;
}

/** The order they were planned in: pinned first, then oldest. */
const byPinThenOldest = (a: Note, b: Note) => Number(b.pinned) - Number(a.pinned) || a.created_at.localeCompare(b.created_at);

export type SectionGroup = { section: NoteSection | null; tasks: Note[] };

/** What has no section goes first, without a heading; every section shows up, even empty. */
export function groupBySection(tasks: Note[], sections: NoteSection[]): SectionGroup[] {
  const own = [...sections].sort(bySort);
  const known = new Set(own.map((s) => s.id));
  const loose = tasks.filter((t) => !t.section_id || !known.has(t.section_id)).sort(byPinThenOldest);
  return [
    ...(loose.length ? [{ section: null, tasks: loose }] : []),
    ...own.map((section) => ({ section, tasks: tasks.filter((t) => t.section_id === section.id).sort(byPinThenOldest) })),
  ];
}

/** Places a new item after the others. */
export const nextSort = (items: { sort: number }[]) => items.reduce((max, i) => Math.max(max, i.sort), -1) + 1;

export type SortPatch = { id: string; sort: number };

/**
 * The writes that move an item one place up or down among its siblings, or nothing at its end.
 * Every sibling gets its position, so items that still share a `sort` also end up in order.
 */
export function moveSort<T extends { id: string; sort: number; created_at: string }>(items: T[], id: string, delta: -1 | 1): SortPatch[] {
  const sorted = [...items].sort(bySort);
  const from = sorted.findIndex((i) => i.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sorted.length) return [];
  [sorted[from], sorted[to]] = [sorted[to], sorted[from]];
  return sorted.flatMap((item, sort) => (item.sort === sort ? [] : [{ id: item.id, sort }]));
}

/** The lists a project's siblings are, to move it among them. */
export function siblings(list: NoteList, lists: NoteList[]): NoteList[] {
  if (list.kind === 'area') return lists.filter((l) => l.kind === 'area');
  const tree = listTree(lists);
  return tree.areas.find((a) => a.area.id === list.area_id)?.projects ?? tree.loose;
}
