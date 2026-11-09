// The order to-dos are dragged to. `sort` orders the views, areas and projects; `today_sort` only Hoy.
import type { Note, NoteInput } from '@/data/types';

export type OrderKey = 'sort' | 'today_sort';
export type Placement = { id: string; patch: NoteInput };

const setOrder = (key: OrderKey, value: number): NoteInput => (key === 'sort' ? { sort: value } : { today_sort: value });

/** Pinned ones first. */
export const byPinned = (a: Pick<Note, 'pinned'>, b: Pick<Note, 'pinned'>) => Number(b.pinned) - Number(a.pinned);

/** In the order they were dragged to; those never dragged go before them (`nulls: 'first'`) or after. */
export const byOrder =
  (key: OrderKey, nulls: 'first' | 'last') =>
  (a: Pick<Note, OrderKey>, b: Pick<Note, OrderKey>): number => {
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return 0;
    if (x === null) return nulls === 'first' ? -1 : 1;
    if (y === null) return nulls === 'first' ? 1 : -1;
    return x - y;
  };

/**
 * The writes that put `moved` at `index` of `group`, the group as it shows (`moved` may be in it or not).
 * When the group is already in dragged order only `moved` changes, to a value between its new neighbours;
 * otherwise the whole group is numbered in the order it will show.
 * It is pinned like the one it lands above (or below, at the end), so pinned ones stay first.
 */
export function placeAt(group: Note[], moved: Note, index: number, key: OrderKey): Placement[] {
  const rest = group.filter((n) => n.id !== moved.id);
  const at = Math.max(0, Math.min(index, rest.length));
  const prev = rest[at - 1];
  const next = rest[at];
  const pinned = (next ?? prev)?.pinned ?? moved.pinned;
  const pin: NoteInput = pinned === moved.pinned ? {} : { pinned };

  const values = rest.map((n) => n[key]);
  const inOrder = values.every((v, i) => v !== null && (i === 0 || v > (values[i - 1] as number)));
  if (inOrder) {
    const before = prev?.[key] ?? null;
    const after = next?.[key] ?? null;
    const value = before !== null && after !== null ? (before + after) / 2 : after !== null ? after - 1 : before !== null ? before + 1 : 0;
    return [{ id: moved.id, patch: { ...setOrder(key, value), ...pin } }];
  }

  const order = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return order.flatMap((n, i): Placement[] => {
    if (n.id === moved.id) return [{ id: n.id, patch: { ...setOrder(key, i), ...pin } }];
    return n[key] === i ? [] : [{ id: n.id, patch: setOrder(key, i) }];
  });
}

/** Where `moved` sits in `group` now, or -1. */
export const indexIn = (group: Note[], moved: Note) => group.findIndex((n) => n.id === moved.id);
