import { useEffect, useSyncExternalStore } from 'react';
import { useAccount } from '@/data/ApiContext';
import { createWorkspacePreferences } from './workspacePreferences';

const stores = new Map<string, ReturnType<typeof createWorkspacePreferences>>();
export function useWorkspaceView() {
  const { user, mode } = useAccount();
  const scope = `${mode}:${user.id}`;
  let store = stores.get(scope);
  if (!store) {
    let storage: Storage | undefined;
    try { if (mode !== 'demo') storage = window.localStorage; } catch { /* Browser may block storage. */ }
    store = createWorkspacePreferences(scope, storage);
    stores.set(scope, store);
  }
  const preferences = store;
  useEffect(() => {
    if (mode === 'demo') return;
    const sync = (event: StorageEvent) => {
      if (event.key === preferences.key || event.key === null) preferences.refresh();
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [preferences, mode]);
  const state = useSyncExternalStore(preferences.subscribe, preferences.snapshot, preferences.snapshot);
  return { ...state, toggleBoardFavorite: preferences.toggleBoardFavorite, setBoardView: preferences.setBoardView };
}
