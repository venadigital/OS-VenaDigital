import { describe, expect, it } from 'vitest';
import { createWorkspacePreferences } from './workspacePreferences';
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
describe('workspace preferences', () => {
  it('persists favorites and view across reloads, isolated by account', () => {
    const storage = memoryStorage();
    const a = createWorkspacePreferences('supabase:a', storage);
    a.toggleBoardFavorite('board-1'); a.setBoardView('list');
    expect(createWorkspacePreferences('supabase:a', storage).snapshot()).toEqual({ favorites: ['board-1'], boardView: 'list' });
    expect(createWorkspacePreferences('supabase:b', storage).snapshot()).toEqual({ favorites: [], boardView: 'grid' });
    a.toggleBoardFavorite('board-1');
    expect(createWorkspacePreferences('supabase:a', storage).snapshot().favorites).toEqual([]);
  });
  it('survives corrupted, outdated and inaccessible storage', () => {
    const storage = memoryStorage();
    const a = createWorkspacePreferences('a', storage);
    for (const raw of ['invalid', '{"version":2}', '{"version":1,"favorites":[1,"b","b"],"boardView":"bad"}']) {
      storage.setItem(a.key, raw); a.refresh();
      expect(a.snapshot().boardView).toBe('grid');
    }
    expect(a.snapshot().favorites).toEqual(['b']);
    const blocked = createWorkspacePreferences('a', { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } });
    blocked.toggleBoardFavorite('b');
    expect(blocked.snapshot().favorites).toEqual(['b']);
  });
  it('notifies changes from another tab and removes subscriptions', () => {
    const storage = memoryStorage();
    const a = createWorkspacePreferences('a', storage), b = createWorkspacePreferences('a', storage);
    let calls = 0;
    const unsubscribe = a.subscribe(() => calls++);
    b.toggleBoardFavorite('b'); a.refresh();
    expect(a.snapshot().favorites).toEqual(['b']); expect(calls).toBe(1);
    unsubscribe(); a.setBoardView('list'); expect(calls).toBe(1);
  });
  it('keeps demo preferences ephemeral', () => {
    const demo = createWorkspacePreferences('demo'); demo.toggleBoardFavorite('b');
    expect(createWorkspacePreferences('demo').snapshot().favorites).toEqual([]);
  });
});
