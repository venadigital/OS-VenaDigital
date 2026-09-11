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

/** Sets the accent for both themes; index.css picks the one for the active theme. */
export function applyAccent(color: string) {
  const a = ACCENTS.find((x) => x.value.toLowerCase() === color.toLowerCase());
  const root = document.documentElement.style;
  root.setProperty('--accent-l', color);
  root.setProperty('--on-accent-l', '#ffffff');
  root.setProperty('--accent-d', a?.dark ?? `color-mix(in srgb, ${color} 75%, white)`);
  root.setProperty('--on-accent-d', a?.onDark ?? '#ffffff');
}

export function saveAccent(color: string) {
  applyAccent(color);
  try {
    localStorage.setItem(KEY, color);
  } catch {
    // storage unavailable
  }
}
