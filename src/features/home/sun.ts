// Where the sun (or the moon) sits on the clock's arc, from the city's sunrise and sunset.
import { isSameDay } from 'date-fns';
import type { Weather } from './weather';

export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';

export type SunState = {
  /** 0 at the left end of the arc, 1 at the right end. */
  t: number;
  isDay: boolean;
  phase: SkyPhase;
  /** The next sunrise or sunset; null without real sun times. */
  next: { kind: 'sunrise' | 'sunset'; at: Date } | null;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** How long the warm colors last around sunrise and sunset. */
const GOLDEN = 70 * 60_000;
const TWILIGHT = 40 * 60_000;

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Today's sun times, or 6:00 and 18:00 when the city's are not known. */
function today(now: Date, sun: Weather['sun'] | undefined) {
  const days = (sun ?? []).map((d) => ({ rise: new Date(d.sunrise), set: new Date(d.sunset) })).filter((d) => !Number.isNaN(d.rise.getTime()) && !Number.isNaN(d.set.getTime()) && d.set > d.rise);
  const i = days.findIndex((d) => isSameDay(d.rise, now));
  if (i >= 0) return { rise: days[i].rise, set: days[i].set, nextRise: days[i + 1]?.rise ?? new Date(days[i].rise.getTime() + DAY), known: true };
  const rise = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6);
  const set = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18);
  return { rise, set, nextRise: new Date(rise.getTime() + DAY), known: false };
}

export function sunState(now: Date, sun?: Weather['sun']): SunState {
  const { rise, set, nextRise, known } = today(now, sun);
  const ms = now.getTime();

  if (ms >= rise.getTime() && ms < set.getTime()) {
    const phase: SkyPhase = ms - rise.getTime() < GOLDEN ? 'dawn' : set.getTime() - ms < GOLDEN ? 'dusk' : 'day';
    return { t: clamp((ms - rise.getTime()) / (set.getTime() - rise.getTime())), isDay: true, phase, next: known ? { kind: 'sunset', at: set } : null };
  }

  // Night: from the last sunset to the next sunrise.
  const before = ms < rise.getTime();
  const from = before ? set.getTime() - DAY : set.getTime();
  const to = before ? rise : nextRise;
  const phase: SkyPhase = ms - from < TWILIGHT ? 'dusk' : to.getTime() - ms < TWILIGHT ? 'dawn' : 'night';
  return { t: clamp((ms - from) / (to.getTime() - from)), isDay: false, phase, next: known ? { kind: 'sunrise', at: to } : null };
}

/** The orb's place on a half circle, as percentages of a 232 × 124 box (radius 108, base at 116). */
export function arcPoint(t: number): { x: number; y: number } {
  const angle = Math.PI * clamp(t);
  return { x: ((116 - 108 * Math.cos(angle)) / 232) * 100, y: ((116 - 108 * Math.sin(angle)) / 124) * 100 };
}
