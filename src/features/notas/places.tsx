// The places of Notas (its views and lists): their icons, and the ones visited lately for the search.
import type { ComponentType } from 'react';
import { Archive, CalendarDays, Inbox, Layers, LayoutGrid, SquareCheck, Star } from 'lucide-react';
import type { NoteList } from '@/data/types';
import { TASK_VIEWS, type NotasView, type TaskView } from './tasks';

type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

export const VIEW_ICONS: Record<TaskView, { icon: Icon; tint: string }> = {
  entrada: { icon: Inbox, tint: 'var(--note-link)' },
  hoy: { icon: Star, tint: 'var(--note-hacer)' },
  proximo: { icon: CalendarDays, tint: 'var(--note-investigar)' },
  cuando: { icon: Layers, tint: 'var(--note-investigar)' },
  algun: { icon: Archive, tint: 'var(--note-inspiracion)' },
  registro: { icon: SquareCheck, tint: 'var(--note-link)' },
};
export const WALL_ICON: Icon = LayoutGrid;

export type Place = { key: string; label: string; to: string; kind: 'vista' | 'area' | 'proyecto' };

export const viewKey = (v: NotasView) => `vista:${v}`;
export const listKey = (id: string) => `lista:${id}`;

/** Every view, the wall and each list, keyed as they are remembered. */
export function notasPlaces(lists: NoteList[]): Place[] {
  return [
    ...TASK_VIEWS.map((v) => ({ key: viewKey(v.id), label: v.label, to: `/notas?vista=${v.id}`, kind: 'vista' as const })),
    { key: viewKey('muro'), label: 'Muro', to: '/notas?vista=muro', kind: 'vista' },
    ...lists.map((l) => ({ key: listKey(l.id), label: l.name, to: `/notas?lista=${l.id}`, kind: l.kind })),
  ];
}

const STORAGE = 'vena-os:notas-recientes';
const KEEP = 5;

/** Moves a place to the front of the recent ones, without repeating it. */
export const pushRecent = (recent: string[], key: string) => [key, ...recent.filter((k) => k !== key)].slice(0, KEEP);

export function recentPlaces(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberPlace(key: string) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(pushRecent(recentPlaces(), key)));
  } catch {
    // Private windows may refuse storage; the search just shows no recent places.
  }
}
