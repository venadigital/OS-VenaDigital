import { describe, expect, it } from 'vitest';
import type { ModelPrice, Project, UsageSession } from '@/data/types';
import { DEFAULT_PRICES, projectForFolder, sessionCost } from './pricing';

const prices: ModelPrice[] = DEFAULT_PRICES.map((p, i) => ({ ...p, id: String(i), updated_at: '' }));
const counts = { input: 0, output: 0, cache_read: 0, cache_write: 0, cache_write_1h: 0, messages: 1 };
const session = (models: UsageSession['models']): UsageSession => ({
  source: 'claude_code',
  session_id: 's',
  project: 'OS Vena Digital',
  account: 'a@x.com',
  started_at: '2026-09-11T11:00:00Z',
  ended_at: '2026-09-11T12:00:00Z',
  models,
});
const project = (name: string, folder: string | null = null): Project => ({
  id: name,
  name,
  color: '#000',
  archived: false,
  sort: 0,
  folder,
  created_at: '',
});

describe('sessionCost', () => {
  it('prices every model of the session at API rates', () => {
    const r = sessionCost(
      session({
        'claude-opus-5': { ...counts, input: 1e6, output: 1e6, cache_read: 1e6, cache_write: 1e6, cache_write_1h: 1e6 },
        'gpt-5.5': { ...counts, input: 1e6, cache_read: 1e6 },
      }),
      prices,
    );
    // Opus 5: 5 + 25 + 0.5 + 6.25 + 10 = 46.75; gpt-5.5: 5 + 0.5
    expect(r.cost).toBeCloseTo(52.25, 6);
    expect(r.tokens).toBe(7e6);
    expect(r.unpriced).toBe(false);
  });

  it('flags models without a price instead of counting them as $0', () => {
    const r = sessionCost(session({ 'modelo-nuevo': { ...counts, input: 10 } }), prices);
    expect(r).toEqual({ cost: 0, tokens: 10, unpriced: true });
  });
});

describe('projectForFolder', () => {
  it('prefers an explicit link, then a project with the same name', () => {
    const projects = [project('OS Vena Digital'), project('Contenidos', 'Guiones')];
    expect(projectForFolder('Guiones', projects)?.name).toBe('Contenidos');
    expect(projectForFolder('os vena digital', projects)?.name).toBe('OS Vena Digital');
    expect(projectForFolder('Newsletter', projects)).toBeUndefined();
    expect(projectForFolder('', projects)).toBeUndefined();
  });

  it('does not match by name a project linked to another folder', () => {
    expect(projectForFolder('Contenidos', [project('Contenidos', 'Guiones')])).toBeUndefined();
  });
});
