// Validated categorical palette (fixed order) used for projects and accounts.
export const SERIES = ['#9d87c0', '#bad780', '#91b6c8', '#c7ae94', '#c9a1b6', '#699775', '#756095', '#ba7879'];

/** Accent options. `dark` is the same accent tuned for the dark theme; `onDark` is its text color. */
export const ACCENTS = [
  { value: '#756095', label: 'Stay · Lila', dark: '#cbb9ed', onDark: '#25222b' },
  { value: '#256abf', label: 'Azul', dark: '#4b8fe8', onDark: '#ffffff' },
  { value: '#1f1e1c', label: 'Grafito', dark: '#e6e4df', onDark: '#1f1e1c' },
  { value: '#c94a36', label: 'Coral', dark: '#e0664f', onDark: '#ffffff' },
  { value: '#1f7a55', label: 'Verde', dark: '#2f9e70', onDark: '#ffffff' },
];

export function nextColor(used: string[]): string {
  return SERIES.find((c) => !used.includes(c)) ?? SERIES[used.length % SERIES.length];
}
