import { describe, expect, it } from 'vitest';
import type { NewsItem, NewsSource } from '@/data/types';
import { ago, dayLabel, groupByDay, lastUpdate, staleSources } from './model';

const NOW = new Date(2026, 10, 5, 10, 0);

const item = (id: string, published: Date): NewsItem => ({
  id,
  source: 'xataka',
  url: 'https://x.test',
  title: id,
  summary: null,
  image_url: null,
  published_at: published.toISOString(),
});

const source = (patch: Partial<NewsSource>): NewsSource => ({
  slug: 's',
  name: 'S',
  site: 's.test',
  last_checked_at: null,
  last_ok_at: null,
  last_error: null,
  ...patch,
});

describe('groupByDay', () => {
  it('groups by local day and names the recent ones', () => {
    const days = groupByDay(
      [item('a', new Date(2026, 10, 5, 9)), item('b', new Date(2026, 10, 5, 0, 30)), item('c', new Date(2026, 10, 4, 23, 30)), item('d', new Date(2026, 10, 3, 12))],
      NOW,
    );
    expect(days.map((d) => [d.label, d.items.map((i) => i.id)])).toEqual([
      ['Hoy', ['a', 'b']],
      ['Ayer', ['c']],
      ['Martes, 3 de noviembre', ['d']],
    ]);
  });

  it('returns nothing for no news', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe('dayLabel', () => {
  it('writes older days in full', () => {
    expect(dayLabel(new Date(2026, 9, 28), NOW)).toBe('Miércoles, 28 de octubre');
  });
});

describe('ago', () => {
  it('uses the largest sensible unit', () => {
    expect(ago(new Date(2026, 10, 5, 9, 59, 40), NOW)).toBe('ahora');
    expect(ago(new Date(2026, 10, 5, 9, 48), NOW)).toBe('hace 12 min');
    expect(ago(new Date(2026, 10, 5, 7, 0), NOW)).toBe('hace 3 h');
    expect(ago(new Date(2026, 10, 4, 9, 0), NOW)).toBe('hace 1 día');
    expect(ago(new Date(2026, 10, 2, 9, 0), NOW)).toBe('hace 3 días');
  });
});

describe('lastUpdate', () => {
  it('takes the newest successful check', () => {
    const newest = new Date(2026, 10, 5, 9).toISOString();
    expect(lastUpdate([source({ last_ok_at: new Date(2026, 10, 5, 8).toISOString() }), source({ last_ok_at: newest }), source({})])).toEqual(new Date(newest));
    expect(lastUpdate([source({})])).toBeNull();
  });
});

describe('staleSources', () => {
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

  it('flags a source failing for over a day, not a passing hiccup', () => {
    const failing = source({ slug: 'mal', last_checked_at: hoursAgo(1), last_ok_at: hoursAgo(30), last_error: 'HTTP 403' });
    const hiccup = source({ slug: 'bache', last_checked_at: hoursAgo(1), last_ok_at: hoursAgo(2), last_error: 'HTTP 500' });
    const fine = source({ slug: 'bien', last_checked_at: hoursAgo(1), last_ok_at: hoursAgo(1) });
    const never = source({ slug: 'nunca', last_checked_at: hoursAgo(1), last_error: 'HTTP 403' });
    const notChecked = source({ slug: 'sin-revisar' });
    expect(staleSources([failing, hiccup, fine, never, notChecked], NOW).map((s) => s.slug)).toEqual(['mal', 'nunca']);
  });
});
