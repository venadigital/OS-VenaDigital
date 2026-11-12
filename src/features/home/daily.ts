// What rotates on Inicio: one photo and one quote per day, and the quotes as editable text.
import type { HomeQuote } from '@/data/types';

/** Limits kept by the database (see the home_settings migration). */
export const MAX_PHOTOS = 60;
export const MAX_QUOTES = 500;
const MAX_QUOTE_LENGTH = 400;

/** Days since 1970 on the person's own calendar, so the pick changes at their midnight. */
export function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** One item per day, going around the list in order. */
export function pickDaily<T>(items: T[], date: Date): T | null {
  if (!items.length) return null;
  return items[dayNumber(date) % items.length];
}

const WRAPPING_MARKS = /^["“”«»']+|["“”«»']+$/g;
// A long dash anywhere, or a hyphen with a space on each side.
const AUTHOR_DASH = /\s*[—–]\s*|\s+--?\s+/g;

/** One quote per line; the author goes after the last dash: "La frase - Autor". */
export function parseQuotes(text: string): HomeQuote[] {
  const quotes: HomeQuote[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const dash = [...line.matchAll(AUTHOR_DASH)].pop();
    const author = dash ? line.slice(dash.index + dash[0].length).trim() : '';
    const body = (dash && author ? line.slice(0, dash.index) : line).trim().replace(WRAPPING_MARKS, '').trim();
    if (!body) continue;
    quotes.push({ text: body.slice(0, MAX_QUOTE_LENGTH), author: author ? author.slice(0, 120) : null });
    if (quotes.length === MAX_QUOTES) break;
  }
  return quotes;
}

export function formatQuotes(quotes: HomeQuote[]): string {
  return quotes.map((q) => (q.author ? `${q.text} — ${q.author}` : q.text)).join('\n');
}

/** Long quotes are set smaller so they fit the photo widget. */
export function quoteSize(text: string): 'xl' | 'lg' | 'md' | 'sm' {
  const n = text.length;
  if (n <= 44) return 'xl';
  if (n <= 96) return 'lg';
  if (n <= 170) return 'md';
  return 'sm';
}
