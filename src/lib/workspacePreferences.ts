export type WorkspaceView = { favorites: readonly string[]; boardView: 'grid' | 'list' };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const empty = (): WorkspaceView => ({ favorites: [], boardView: 'grid' });

// Only view preferences live here. Board content remains in the existing API.
export function createWorkspacePreferences(scope: string, storage?: StorageLike) {
  const key = `vena-os-workspace-v1:${scope}`;
  function read(): WorkspaceView {
    try {
      const value = JSON.parse(storage?.getItem(key) ?? 'null');
      if (!value || value.version !== 1) return empty();
      return {
        favorites: Array.isArray(value.favorites) ? [...new Set<string>(value.favorites.filter((id: unknown): id is string => typeof id === 'string'))] : [],
        boardView: value.boardView === 'list' ? 'list' : 'grid',
      };
    } catch { return empty(); }
  }
  let state = read();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  function update(patch: Partial<WorkspaceView>) {
    state = { ...state, ...patch };
    try { storage?.setItem(key, JSON.stringify({ version: 1, ...state })); } catch { /* Keep usable when browser storage is unavailable. */ }
    notify();
  }
  return {
    key,
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh: () => { state = read(); notify(); },
    toggleBoardFavorite: (id: string) => update({ favorites: state.favorites.includes(id) ? state.favorites.filter(x => x !== id) : [...state.favorites, id] }),
    setBoardView: (boardView: WorkspaceView['boardView']) => update({ boardView }),
  };
}
