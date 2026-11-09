import { describe, expect, it } from 'vitest';
import type { Note } from '@/data/types';
import { byOrder, placeAt } from './order';

const note = (id: string, sort: number | null, patch: Partial<Note> = {}) => ({ id, sort, today_sort: null, pinned: false, ...patch }) as Note;

describe('byOrder', () => {
  it('keeps the dragged order and puts the others first or last', () => {
    const items = [note('b', 2), note('nuevo', null), note('a', 1)];
    expect([...items].sort(byOrder('sort', 'first')).map((n) => n.id)).toEqual(['nuevo', 'a', 'b']);
    expect([...items].sort(byOrder('sort', 'last')).map((n) => n.id)).toEqual(['a', 'b', 'nuevo']);
  });
});

describe('placeAt', () => {
  it('numbers a group that was never dragged, in the order it will show', () => {
    const group = [note('a', null), note('b', null), note('c', null)];
    expect(placeAt(group, group[2], 0, 'sort')).toEqual([
      { id: 'c', patch: { sort: 0 } },
      { id: 'a', patch: { sort: 1 } },
      { id: 'b', patch: { sort: 2 } },
    ]);
  });

  it('only moves the dragged one when the group is already in order', () => {
    const group = [note('a', 0), note('b', 1), note('c', 2)];
    // The index counts the others: 1 is between b and c.
    expect(placeAt(group, group[0], 1, 'sort')).toEqual([{ id: 'a', patch: { sort: 1.5 } }]);
    expect(placeAt(group, group[2], 0, 'sort')).toEqual([{ id: 'c', patch: { sort: -1 } }]);
    expect(placeAt(group, group[0], 9, 'sort')).toEqual([{ id: 'a', patch: { sort: 3 } }]);
  });

  it('places one coming from another group, and into an empty one', () => {
    const outsider = note('x', 7);
    expect(placeAt([note('a', 0), note('b', 1)], outsider, 1, 'sort')).toEqual([{ id: 'x', patch: { sort: 0.5 } }]);
    expect(placeAt([], outsider, 0, 'today_sort')).toEqual([{ id: 'x', patch: { today_sort: 0 } }]);
  });

  it('pins it like the one it lands above, so pinned ones stay first', () => {
    const group = [note('fija', 0, { pinned: true }), note('a', 1), note('b', 2)];
    expect(placeAt(group, group[2], 0, 'sort')).toEqual([{ id: 'b', patch: { sort: -1, pinned: true } }]);
    expect(placeAt(group, group[0], 1, 'sort')).toEqual([{ id: 'fija', patch: { sort: 1.5, pinned: false } }]);
  });
});
