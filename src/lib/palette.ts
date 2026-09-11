// Validated categorical palette (fixed order) used for projects and accounts.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const ACCENTS = [
  { value: '#256abf', label: 'Azul' },
  { value: '#1f1e1c', label: 'Grafito' },
  { value: '#c94a36', label: 'Coral' },
  { value: '#1f7a55', label: 'Verde' },
];

export function nextColor(used: string[]): string {
  return SERIES.find((c) => !used.includes(c)) ?? SERIES[used.length % SERIES.length];
}
