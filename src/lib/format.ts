// es-CO formatting helpers (decimal comma, dot thousands).
import { format, isSameDay, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

const money = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** 275 → "4 h 35 min", 55 → "55 min". */
export function dur(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** 275 → "4 h 35", 540 → "9 h". */
export function durShort(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Seconds → "00:42:18". */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

export function usd(n: number): string {
  return `$${money.format(n)}`;
}

/** Whole dollars when round ("$100"), cents otherwise. */
export function price(n: number): string {
  return Number.isInteger(n) ? `$${integer.format(n)}` : usd(n);
}

export function num(n: number): string {
  return oneDecimal.format(n);
}

/** 467_800_000 → "468 M", 13_600_000 → "13,6 M", 950_000 → "950 K". */
export function tokens(n: number): string {
  if (n >= 1e9) return `${oneDecimal.format(n / 1e9)} B`;
  if (n >= 1e6) {
    const v = n / 1e6;
    return `${v >= 100 ? integer.format(v) : oneDecimal.format(v)} M`;
  }
  if (n >= 1e3) return `${integer.format(n / 1e3)} K`;
  return integer.format(n);
}

export function ratio(n: number): string {
  return `${oneDecimal.format(n)}×`;
}

export function hhmm(d: Date): string {
  return format(d, 'HH:mm');
}

export function longDate(d: Date): string {
  return cap(format(d, "EEEE, d 'de' MMMM", { locale: es }));
}

export function shortDate(d: Date): string {
  return format(d, 'd MMM', { locale: es }).replace('.', '');
}

/** "Hoy", "Ayer" or "8 sep". */
export function relativeDay(d: Date, now = new Date()): string {
  if (isSameDay(d, now)) return 'Hoy';
  if (isSameDay(d, subDays(now, 1))) return 'Ayer';
  return shortDate(d);
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function monthName(d: Date): string {
  return format(d, 'MMMM', { locale: es });
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
