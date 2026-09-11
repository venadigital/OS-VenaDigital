import { ACCENTS } from './palette';

const KEY = 'vena-os-accent';

export function storedAccent(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^#[0-9a-f]{6}$/i.test(v)) return v;
  } catch {
    // storage unavailable
  }
  return ACCENTS[0].value;
}

export function applyAccent(color: string) {
  document.documentElement.style.setProperty('--accent', color);
}

export function saveAccent(color: string) {
  applyAccent(color);
  try {
    localStorage.setItem(KEY, color);
  } catch {
    // storage unavailable
  }
}
