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

  it('prices the models released after September at their official rates', () => {
    const all = { ...counts, input: 1e6, output: 1e6, cache_read: 1e6, cache_write: 1e6, cache_write_1h: 1e6 };
    const cost = (model: string) => sessionCost(session({ [model]: all }), prices);
    // input + output + cache read + 5-min write + 1-h write
    expect(cost('claude-fable-5-2').cost).toBeCloseTo(8 + 40 + 0.2 + 10 + 16, 6);
    expect(cost('claude-sonnet-5-5').cost).toBeCloseTo(2 + 10 + 0.1 + 2.5 + 4, 6);
    expect(cost('claude-haiku-5-5').cost).toBeCloseTo(0.1 + 0.5 + 0.01 + 0.125 + 0.2, 6);
    expect(cost('gpt-6.1-sol').cost).toBeCloseTo(2 + 10 + 0.1 + 2.5, 6);
    expect(cost('codex-auto-review').unpriced).toBe(false);
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

describe('projectForFolder with emoji names', () => {
  it('matches a folder to a project whose name carries an emoji', async () => {
    const { projectForFolder } = await import('./pricing');
    const p = { id: 'x', name: '👩🏽 Diana Boldizar', color: '#000', archived: false, sort: 0, created_at: '' };
    expect(projectForFolder('Diana Boldizar', [p])?.id).toBe('x');
    expect(projectForFolder('diana_boldizar', [p])?.id).toBe('x');
    expect(projectForFolder('Diana', [p])).toBeUndefined();
  });
});
