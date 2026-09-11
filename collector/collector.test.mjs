import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { accountAt, dirtyRows, emptyState, localDay, recordAccount, scan } from './collector.mjs';

const claudeRow = (id, ts, usage, extra = {}) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, requestId: `req_${id}`, message: { id: `msg_${id}`, model: 'claude-opus-5', usage }, ...extra });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vena-collector-'));
  const claudeDir = join(root, 'claude', 'projects', 'proj');
  const codexDir = join(root, 'codex');
  mkdirSync(claudeDir, { recursive: true });
  mkdirSync(join(codexDir, 'sessions', '2026', '09', '11'), { recursive: true });
  mkdirSync(join(codexDir, 'archived_sessions'), { recursive: true });
  return { root, claudeDir, codexDir };
}

describe('collector', () => {
  it('counts each Claude response once and splits cache writes', () => {
    const { root, claudeDir, codexDir } = fixture();
    const file = join(claudeDir, 's1.jsonl');
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 300, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 } };
    writeFileSync(
      file,
      [
        claudeRow('a', '2026-09-11T15:00:00.000Z', usage),
        claudeRow('a', '2026-09-11T15:00:01.000Z', usage), // same response, another content block
        claudeRow('b', '2026-09-11T15:05:00.000Z', { input_tokens: 1, output_tokens: 2 }),
        JSON.stringify({ type: 'user', timestamp: '2026-09-11T15:06:00.000Z', message: { role: 'user', content: 'hola' } }),
        claudeRow('c', '2026-09-11T15:07:00.000Z', { input_tokens: 9 }, { message: { id: 'x', model: '<synthetic>', usage: { input_tokens: 9 } } }),
      ].join('\n') + '\n',
    );
    const state = emptyState();
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    const rows = dirtyRows(state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'claude_code',
      account: 'unknown',
      model: 'claude-opus-5',
      input_tokens: 11,
      output_tokens: 7,
      cache_read_tokens: 1000,
      cache_write_tokens: 100,
      cache_write_1h_tokens: 200,
      messages: 2,
    });

    // Appending: only new lines are read; a copied (resumed) message is ignored.
    appendFileSync(file, claudeRow('a', '2026-09-11T16:00:00.000Z', usage) + '\n' + claudeRow('d', '2026-09-11T16:01:00.000Z', { input_tokens: 4, output_tokens: 1 }) + '\n');
    state.dirty = {};
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    const again = dirtyRows(state);
    expect(again[0]).toMatchObject({ input_tokens: 15, output_tokens: 8, messages: 3 });
  });

  it('attributes Claude usage to the account active at each moment', () => {
    const state = emptyState();
    recordAccount(state, 'personal@x.com', '2026-09-11T10:00:00.000Z');
    recordAccount(state, 'personal@x.com', '2026-09-11T11:00:00.000Z'); // no change
    recordAccount(state, 'vena@x.com', '2026-09-11T12:00:00.000Z');
    expect(state.timeline).toHaveLength(2);
    expect(accountAt(state, '2026-09-11T09:00:00.000Z')).toBe('unknown');
    expect(accountAt(state, '2026-09-11T11:30:00.000Z')).toBe('personal@x.com');
    expect(accountAt(state, '2026-09-11T12:00:00.000Z')).toBe('vena@x.com');
    state.historyAccount = 'personal@x.com';
    expect(accountAt(state, '2026-09-01T09:00:00.000Z')).toBe('personal@x.com');
  });

  it('turns cumulative Codex totals into deltas and ignores archived copies', () => {
    const { root, codexDir } = fixture();
    const lines = [
      JSON.stringify({ type: 'session_meta', payload: { id: 'sess-1' } }),
      JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.3-codex' } }),
      JSON.stringify({ type: 'event_msg', timestamp: '2026-09-11T15:00:00.000Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 } } } }),
      JSON.stringify({ type: 'event_msg', timestamp: '2026-09-11T15:00:05.000Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 } } } }),
      JSON.stringify({ type: 'event_msg', timestamp: '2026-09-11T15:01:00.000Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 2500, cached_input_tokens: 2000, output_tokens: 120 } } } }),
    ].join('\n');
    writeFileSync(join(codexDir, 'sessions', '2026', '09', '11', 'rollout-a.jsonl'), lines + '\n');
    writeFileSync(join(codexDir, 'archived_sessions', 'rollout-a.jsonl'), lines + '\n');
    const state = emptyState();
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    const rows = dirtyRows(state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'codex', account: 'chatgpt', model: 'gpt-5.3-codex', input_tokens: 500, cache_read_tokens: 2000, output_tokens: 120 });
  });

  it('uses the local calendar day', () => {
    expect(localDay('not a date')).toBeNull();
    const d = new Date(2026, 8, 11, 23, 30);
    expect(localDay(d.toISOString())).toBe('2026-09-11');
  });
});
