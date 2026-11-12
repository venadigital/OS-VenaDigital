import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { accountAt, dirtyRows, dirtySessions, emptyState, loadState, localDay, recordAccount, scan } from './collector.mjs';

const claudeRow = (id, ts, usage, extra = {}) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, requestId: `req_${id}`, message: { id: `msg_${id}`, model: 'claude-opus-5', usage }, ...extra });

const codexMeta = (id, extra = {}, ts) => JSON.stringify({ type: 'session_meta', timestamp: ts, payload: { id, ...extra } });
const codexModel = (model) => JSON.stringify({ type: 'turn_context', payload: { model } });
const codexTokens = (ts, input_tokens, cached_input_tokens, output_tokens) =>
  JSON.stringify({ type: 'event_msg', timestamp: ts, payload: { type: 'token_count', info: { total_token_usage: { input_tokens, cached_input_tokens, output_tokens } } } });

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

  it('does not count again the parent history a forked subagent copies', () => {
    const { root, codexDir } = fixture();
    const day = join(codexDir, 'sessions', '2026', '09', '11');
    writeFileSync(
      join(day, 'rollout-parent.jsonl'),
      [codexMeta('parent', { cwd: '/x/OS Vena Digital' }), codexModel('gpt-5.5'), codexTokens('2026-09-11T15:00:00.000Z', 1000, 800, 50), codexTokens('2026-09-11T15:01:00.000Z', 3000, 2400, 90)].join('\n') + '\n',
    );
    writeFileSync(
      join(day, 'rollout-fork.jsonl'),
      [
        codexMeta('fork', { forked_from_id: 'parent', cwd: '/x/OS Vena Digital' }, '2026-09-11T15:02:00.000Z'),
        codexMeta('parent', { cwd: '/x/OS Vena Digital' }, '2026-09-11T15:02:00.001Z'), // the parent's own meta, copied too
        // the parent's history, copied at the fork instant
        codexTokens('2026-09-11T15:02:00.001Z', 1000, 800, 50),
        codexTokens('2026-09-11T15:02:00.001Z', 3000, 2400, 90),
        codexModel('gpt-5.5'),
        // the subagent's own work
        codexTokens('2026-09-11T15:02:12.000Z', 3500, 2800, 100),
      ].join('\n') + '\n',
    );
    const state = emptyState();
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    expect(dirtyRows(state)).toEqual([expect.objectContaining({ model: 'gpt-5.5', input_tokens: 700, cache_read_tokens: 2800, output_tokens: 100 })]);
    const sessions = Object.fromEntries(dirtySessions(state).map((x) => [x.session_id, x.models['gpt-5.5']]));
    expect(sessions.parent).toMatchObject({ input: 600, cache_read: 2400, output: 90 });
    expect(sessions.fork).toMatchObject({ input: 100, cache_read: 400, output: 10 });
  });

  it('reads compressed Codex logs once, even next to the uncompressed copy', () => {
    const { root, codexDir } = fixture();
    const lines = [codexMeta('cx-z'), codexModel('gpt-6.1-sol'), codexTokens('2026-09-11T15:00:00.000Z', 1000, 600, 30)].join('\n') + '\n';
    writeFileSync(join(codexDir, 'sessions', '2026', '09', '11', 'rollout-z.jsonl.zst'), zstdCompressSync(Buffer.from(lines)));
    writeFileSync(join(codexDir, 'archived_sessions', 'rollout-z.jsonl'), lines);
    const only = [codexMeta('cx-y'), codexModel('gpt-6-sol'), codexTokens('2026-09-11T16:00:00.000Z', 200, 0, 10)].join('\n') + '\n';
    writeFileSync(join(codexDir, 'sessions', '2026', '09', '11', 'rollout-y.jsonl.zst'), zstdCompressSync(Buffer.from(only)));
    const state = emptyState();
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    expect(dirtyRows(state).sort((a, b) => a.model.localeCompare(b.model))).toEqual([
      expect.objectContaining({ model: 'gpt-6-sol', input_tokens: 200, output_tokens: 10 }),
      expect.objectContaining({ model: 'gpt-6.1-sol', input_tokens: 400, cache_read_tokens: 600, output_tokens: 30 }),
    ]);
  });

  it('rebuilds the Codex counts of an older state once and keeps Claude Code as it is', () => {
    const { root, codexDir } = fixture();
    const file = join(codexDir, 'sessions', '2026', '09', '11', 'rollout-r.jsonl');
    writeFileSync(file, [codexMeta('cx-r'), codexModel('gpt-5.5'), codexTokens('2026-09-11T15:00:00.000Z', 500, 100, 20)].join('\n') + '\n');
    const claudeKey = '2026-09-01|claude_code|a@x.com|claude-opus-5';
    const old = emptyState();
    delete old.codexVersion;
    old.files[file] = { offset: 99999, session: 'cx-r' };
    old.totals[claudeKey] = { input: 7, output: 0, cache_read: 0, cache_write: 0, cache_write_1h: 0, messages: 1 };
    old.totals['2026-08-16|codex|chatgpt|codex-unknown'] = { input: 5e6, output: 0, cache_read: 0, cache_write: 0, cache_write_1h: 0, messages: 9 };
    old.sessions['codex:cx-old'] = { source: 'codex', session_id: 'cx-old', models: {} };
    const dir = mkdtempSync(join(tmpdir(), 'vena-state-'));
    writeFileSync(join(dir, 'state.json'), JSON.stringify(old));
    const state = loadState(join(dir, 'state.json'));
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    expect(Object.keys(state.totals).sort()).toEqual([claudeKey, '2026-09-11|codex|chatgpt|gpt-5.5']);
    expect(state.totals[claudeKey].input).toBe(7);
    expect(dirtyRows(state)).toEqual([expect.objectContaining({ model: 'gpt-5.5', input_tokens: 400 })]);
    expect(Object.keys(state.sessions)).toEqual(['codex:cx-r']);
    // Only once: the next scan adds nothing.
    state.dirty = {};
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    expect(dirtyRows(state)).toEqual([]);
  });

  it('groups usage by session and project folder', () => {
    const { root, claudeDir, codexDir } = fixture();
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 };
    writeFileSync(
      join(claudeDir, 'sesion.jsonl'),
      [
        claudeRow('s1', '2026-09-11T11:46:00.000Z', usage, { sessionId: 'abc', cwd: '/Users/x/Documents/Áreas/OS Vena Digital/design' }),
        claudeRow('s2', '2026-09-11T14:26:00.000Z', usage, { sessionId: 'abc', cwd: '/Users/x/Documents/Áreas/OS Vena Digital' }),
        claudeRow('s2', '2026-09-11T14:26:01.000Z', usage, { sessionId: 'abc', cwd: '/Users/x/Documents/Áreas/OS Vena Digital' }),
      ].join('\n') + '\n',
    );
    writeFileSync(
      join(codexDir, 'sessions', '2026', '09', '11', 'rollout-b.jsonl'),
      [
        JSON.stringify({ type: 'session_meta', payload: { id: 'cx-1', cwd: '/Users/x/Documents/Áreas/Academia IA' } }),
        JSON.stringify({ type: 'turn_context', payload: { model: 'gpt-5.5' } }),
        JSON.stringify({ type: 'event_msg', timestamp: '2026-09-11T16:00:00.000Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 300, cached_input_tokens: 200, output_tokens: 40 } } } }),
      ].join('\n') + '\n',
    );
    const state = emptyState();
    scan(state, { claudeDir: join(root, 'claude', 'projects'), codexDir });
    const sessions = dirtySessions(state).sort((a, b) => a.source.localeCompare(b.source));
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      source: 'claude_code',
      session_id: 'abc',
      project: 'OS Vena Digital',
      started_at: '2026-09-11T11:46:00.000Z',
      ended_at: '2026-09-11T14:26:00.000Z',
      models: { 'claude-opus-5': { input: 20, output: 10, cache_read: 200, messages: 2 } },
    });
    expect(sessions[1]).toMatchObject({ source: 'codex', session_id: 'cx-1', project: 'Academia IA', models: { 'gpt-5.5': { input: 100, cache_read: 200, output: 40 } } });
  });

  it('keeps the account history when upgrading an old state file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vena-state-'));
    const path = join(dir, 'state.json');
    writeFileSync(path, JSON.stringify({ version: 1, timeline: [{ at: '2026-09-11T10:00:00.000Z', account: 'a@x.com' }], historyAccount: 'a@x.com', totals: { x: {} } }));
    const s = loadState(path);
    expect(s.version).toBe(2);
    expect(s.timeline).toHaveLength(1);
    expect(s.historyAccount).toBe('a@x.com');
    expect(s.totals).toEqual({});
  });

  it('uses the local calendar day', () => {
    expect(localDay('not a date')).toBeNull();
    const d = new Date(2026, 8, 11, 23, 30);
    expect(localDay(d.toISOString())).toBe('2026-09-11');
  });
});
