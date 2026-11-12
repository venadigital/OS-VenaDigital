import { describe, expect, it } from 'vitest';
import { arcPoint, sunState } from './sun';

const SUN = [
  { sunrise: '2026-11-12T05:50', sunset: '2026-11-12T17:41' },
  { sunrise: '2026-11-13T05:51', sunset: '2026-11-13T17:41' },
];
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);

describe('sunState', () => {
  it('puts the sun halfway across the arc at midday between sunrise and sunset', () => {
    const s = sunState(at(12, 11, 45), SUN);
    expect(s.isDay).toBe(true);
    expect(s.phase).toBe('day');
    expect(s.t).toBeCloseTo(0.5, 2);
    expect(s.next).toEqual({ kind: 'sunset', at: new Date('2026-11-12T17:41') });
  });

  it('warms the sky just after sunrise and just before sunset', () => {
    expect(sunState(at(12, 6, 10), SUN).phase).toBe('dawn');
    expect(sunState(at(12, 17, 0), SUN).phase).toBe('dusk');
  });

  it('shows the moon after sunset, heading to tomorrow’s sunrise', () => {
    const s = sunState(at(12, 23, 45), SUN);
    expect(s.isDay).toBe(false);
    expect(s.phase).toBe('night');
    expect(s.t).toBeCloseTo(0.5, 1);
    expect(s.next).toEqual({ kind: 'sunrise', at: new Date('2026-11-13T05:51') });
  });

  it('keeps twilight colors right after sunset and right before sunrise', () => {
    expect(sunState(at(12, 18, 0), SUN).phase).toBe('dusk');
    expect(sunState(at(12, 5, 30), SUN).phase).toBe('dawn');
  });

  it('uses today’s row after midnight even when the forecast was fetched yesterday', () => {
    const s = sunState(at(13, 3, 0), SUN);
    expect(s.isDay).toBe(false);
    expect(s.next).toEqual({ kind: 'sunrise', at: new Date('2026-11-13T05:51') });
  });

  it('falls back to 6:00 and 18:00, with no label, when the sun times are unknown', () => {
    const s = sunState(at(12, 12, 0));
    expect(s.isDay).toBe(true);
    expect(s.t).toBeCloseTo(0.5, 5);
    expect(s.next).toBeNull();
    expect(sunState(at(20, 9, 0), SUN).next).toBeNull();
  });
});

describe('arcPoint', () => {
  it('starts and ends on the horizon and peaks in the middle', () => {
    expect(arcPoint(0)).toEqual({ x: (8 / 232) * 100, y: (116 / 124) * 100 });
    expect(arcPoint(0.5).x).toBeCloseTo(50, 5);
    expect(arcPoint(0.5).y).toBeCloseTo((8 / 124) * 100, 5);
    expect(arcPoint(1).x).toBeCloseTo((224 / 232) * 100, 5);
  });
});
