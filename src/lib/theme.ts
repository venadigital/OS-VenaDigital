// Light / dark theme. The preference is per device (localStorage); "system" follows the OS.
// index.html applies the stored theme before the app loads so there is no flash.
import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'vena-os-theme';
const BAR_COLOR: Record<Theme, string> = { light: '#f9f9f7', dark: '#191918' };
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // storage unavailable
  }
  return 'system';
}

let pref: ThemePref = readPref();

const resolve = (p: ThemePref): Theme => (p === 'system' ? (media?.matches ? 'dark' : 'light') : p);

function apply() {
  const theme = resolve(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
  listeners.forEach((l) => l());
}

export function initTheme() {
  apply();
  media?.addEventListener('change', () => pref === 'system' && apply());
}

export function setThemePref(p: ThemePref) {
  pref = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // storage unavailable
  }
  apply();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Current preference and the theme actually shown. */
export function useTheme(): { pref: ThemePref; theme: Theme } {
  const snapshot = useSyncExternalStore(subscribe, () => `${pref}|${resolve(pref)}`);
  const [p, t] = snapshot.split('|') as [ThemePref, Theme];
  return { pref: p, theme: t };
}

/** Switches to the opposite of what is shown now. */
export const toggleTheme = () => setThemePref(resolve(pref) === 'dark' ? 'light' : 'dark');
