import { describe, expect, it } from 'vitest';
import type { NoteList } from '@/data/types';
import { notasPlaces, pushRecent } from './places';

describe('pushRecent', () => {
  it('puts the place first, once, and keeps five', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });
});

describe('notasPlaces', () => {
  it('lists the views, the wall and each list with where it goes', () => {
    const list: NoteList = { id: 'x', kind: 'area', area_id: null, name: 'Vena', description: '', sort: 0, created_at: '', updated_at: '' };
    const places = notasPlaces([list]);
    expect(places.map((p) => p.key)).toEqual(['vista:entrada', 'vista:hoy', 'vista:proximo', 'vista:cuando', 'vista:algun', 'vista:registro', 'vista:muro', 'lista:x']);
    expect(places.at(-1)).toEqual({ key: 'lista:x', label: 'Vena', to: '/notas?lista=x', kind: 'area' });
    expect(places[2]).toMatchObject({ label: 'Próximo', to: '/notas?vista=proximo' });
  });
});
