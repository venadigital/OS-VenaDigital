// Validated categorical palette (fixed order) used for projects and accounts.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

/** Accent options. `dark` is the same accent tuned for the dark theme; `onDark` is its text color. */
export const ACCENTS = [
  { value: '#256abf', label: 'Azul', dark: '#4b8fe8', onDark: '#ffffff' },
  { value: '#1f1e1c', label: 'Grafito', dark: '#e6e4df', onDark: '#1f1e1c' },
  { value: '#c94a36', label: 'Coral', dark: '#e0664f', onDark: '#ffffff' },
  { value: '#1f7a55', label: 'Verde', dark: '#2f9e70', onDark: '#ffffff' },
];

export function nextColor(used: string[]): string {
  return SERIES.find((c) => !used.includes(c)) ?? SERIES[used.length % SERIES.length];
}
