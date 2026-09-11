#!/usr/bin/env node
// Vena OS — colector local de consumo IA.
//
// Lee los registros de Claude Code (~/.claude/projects) y Codex (~/.codex),
// anota qué cuenta de Claude tiene la sesión activa, suma tokens por
// día/cuenta/modelo y sube los totales a Supabase (función ingest_usage).
// Solo sube conteos de tokens: nunca el contenido de las conversaciones.
//
// Uso:
//   node collector.mjs setup --url <SUPABASE_URL> --key <LLAVE_PUBLICABLE> --token <TOKEN> [--machine "MacBook"] [--history-account correo]
//   node collector.mjs sync [--dry-run]
//   node collector.mjs daemon
//   node collector.mjs install | uninstall | status
//
// Sin dependencias: Node 18+.

import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VERSION = '1.0.0';
const HOME = homedir();
const BASE_DIR = process.env.VENA_OS_DIR || join(HOME, '.os-vena');
const LABEL = 'com.venadigital.os-collector';
const ACCOUNT_POLL_MS = 30_000;
const SYNC_EVERY_MS = 5 * 60_000;
const CHUNK = 4 * 1024 * 1024;
const UPLOAD_BATCH = 2000;

// ---------------------------------------------------------------- helpers
const pad = (n) => String(n).padStart(2, '0');
/** Local calendar day of an ISO timestamp (the Mac's time zone). */
export function localDay(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const shortHash = (s) => createHash('sha1').update(s).digest('base64url').slice(0, 14);

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { mode });
  renameSync(tmp, path);
}

function walk(dir, predicate, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, predicate, out);
    else if (e.isFile() && predicate(e.name)) out.push(p);
  }
  return out;
}

/** Reads complete lines appended since `offset`; returns the new offset (after the last newline). */
export function readNewLines(path, offset, onLine) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return offset;
  }
  if (size < offset) offset = 0; // file rewritten: read again (dedup keeps totals right)
  if (size === offset) return offset;
  const fd = openSync(path, 'r');
  const buf = Buffer.alloc(CHUNK);
  let pos = offset;
  let carry = '';
  let consumed = offset;
  try {
    while (pos < size) {
      const n = readSync(fd, buf, 0, Math.min(CHUNK, size - pos), pos);
      if (n <= 0) break;
      pos += n;
      const text = carry + buf.toString('utf8', 0, n);
      const lines = text.split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) {
        consumed += Buffer.byteLength(line, 'utf8') + 1;
        if (line.trim()) onLine(line);
      }
    }
  } finally {
    closeSync(fd);
  }
  return consumed;
}

// ---------------------------------------------------------------- state
export function emptyState() {
  return { version: 1, files: {}, seen: {}, codex: {}, totals: {}, dirty: {}, timeline: [], lastSync: null, historyAccount: null };
}

export function loadState(path) {
  const s = readJson(path, null);
  return s && s.version === 1 ? { ...emptyState(), ...s } : emptyState();
}

const key = (day, source, account, model) => [day, source, account, model].join('|');

function addTotals(state, k, delta) {
  const t = (state.totals[k] ??= { input: 0, output: 0, cache_read: 0, cache_write: 0, cache_write_1h: 0, messages: 0 });
  for (const f of Object.keys(delta)) t[f] += delta[f];
  state.dirty[k] = 1;
}

// ---------------------------------------------------------------- accounts
export function currentClaudeAccount(claudeJsonPath = join(HOME, '.claude.json')) {
  const j = readJson(claudeJsonPath, null);
  const email = j?.oauthAccount?.emailAddress;
  return typeof email === 'string' && email ? email.toLowerCase() : null;
}

export function codexAccount(authPath = join(HOME, '.codex', 'auth.json')) {
  const j = readJson(authPath, null);
  const token = j?.tokens?.id_token;
  if (typeof token === 'string' && token.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      if (typeof payload.email === 'string') return payload.email.toLowerCase();
    } catch {
      // ignore
    }
  }
  return 'chatgpt';
}

/** Records a switch of the logged-in Claude account. Returns true when it changed. */
export function recordAccount(state, account, at = new Date().toISOString()) {
  const last = state.timeline[state.timeline.length - 1];
  if (!account || (last && last.account === account)) return false;
  state.timeline.push({ at, account });
  if (state.timeline.length > 5000) state.timeline.splice(0, state.timeline.length - 5000);
  return true;
}

/** Claude account that was active at `ts` (by the recorded timeline). */
export function accountAt(state, ts) {
  const t = state.timeline;
  if (!t.length || ts < t[0].at) return state.historyAccount || 'unknown';
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid].at <= ts) lo = mid;
    else hi = mid - 1;
  }
  return t[lo].account;
}

// ---------------------------------------------------------------- Claude Code
export function ingestClaudeLine(state, line) {
  if (!line.includes('"usage"')) return;
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    return;
  }
  if (row?.type !== 'assistant') return;
  const msg = row.message;
  const u = msg?.usage;
  if (!u || !msg.model || msg.model === '<synthetic>' || typeof row.timestamp !== 'string') return;
  const day = localDay(row.timestamp);
  if (!day) return;

  const cc = u.cache_creation;
  const w1h = Number(cc?.ephemeral_1h_input_tokens ?? 0);
  const w5m = cc && typeof cc.ephemeral_5m_input_tokens === 'number' ? Number(cc.ephemeral_5m_input_tokens) : Math.max(0, Number(u.cache_creation_input_tokens ?? 0) - w1h);
  const snap = [Number(u.input_tokens ?? 0), Number(u.output_tokens ?? 0), Number(u.cache_read_input_tokens ?? 0), w5m, w1h];

  // The same API response is logged once per content block (and copied into
  // resumed sessions): count it once, keeping the largest usage seen.
  const id = shortHash(`${msg.id ?? row.uuid}:${row.requestId ?? ''}`);
  const prev = state.seen[id];
  if (prev === 1) return; // old message already counted (marker pruned to save space)
  const k = prev?.k ?? key(day, 'claude_code', accountAt(state, row.timestamp), msg.model);
  const old = Array.isArray(prev?.u) ? prev.u : [0, 0, 0, 0, 0];
  const delta = snap.map((v, i) => Math.max(0, v - old[i]));
  if (prev && delta.every((d) => d === 0)) return;
  addTotals(state, k, {
    input: delta[0],
    output: delta[1],
    cache_read: delta[2],
    cache_write: delta[3],
    cache_write_1h: delta[4],
    messages: prev ? 0 : 1,
  });
  state.seen[id] = { k, u: snap.map((v, i) => Math.max(v, old[i])), d: day };
}

// ---------------------------------------------------------------- Codex
export function ingestCodexLine(state, line, file, account) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    return;
  }
  const p = row?.payload ?? {};
  const f = (state.files[file] ??= { offset: 0 });
  if (row.type === 'session_meta' && typeof p.id === 'string') {
    f.session = p.id;
    return;
  }
  if (row.type === 'turn_context' && typeof p.model === 'string') {
    f.model = p.model;
    if (f.session) (state.codex[f.session] ??= {}).model = p.model;
    return;
  }
  if (row.type !== 'event_msg' || p.type !== 'token_count' || !p.info?.total_token_usage) return;
  const day = localDay(row.timestamp);
  if (!day) return;
  const sid = f.session ?? file;
  const s = (state.codex[sid] ??= {});
  const tot = p.info.total_token_usage;
  const cur = {
    in: Number(tot.input_tokens ?? 0),
    cached: Number(tot.cached_input_tokens ?? 0),
    out: Number(tot.output_tokens ?? 0),
    cw: Number(tot.cache_write_input_tokens ?? 0),
  };
  const last = s.max ?? { in: 0, cached: 0, out: 0, cw: 0 };
  // Totals are cumulative per session; archived copies replay the same numbers.
  const d = {
    in: Math.max(0, cur.in - last.in),
    cached: Math.max(0, cur.cached - last.cached),
    out: Math.max(0, cur.out - last.out),
    cw: Math.max(0, cur.cw - last.cw),
  };
  s.max = { in: Math.max(cur.in, last.in), cached: Math.max(cur.cached, last.cached), out: Math.max(cur.out, last.out), cw: Math.max(cur.cw, last.cw) };
  if (!d.in && !d.cached && !d.out && !d.cw) return;
  const model = f.model ?? s.model ?? 'codex-unknown';
  addTotals(state, key(day, 'codex', account, model), {
    input: Math.max(0, d.in - d.cached), // input_tokens already includes the cached part
    output: d.out, // includes reasoning tokens
    cache_read: d.cached,
    cache_write: d.cw,
    cache_write_1h: 0,
    messages: 1,
  });
}

// ---------------------------------------------------------------- scan
export function scan(state, { claudeDir = join(HOME, '.claude', 'projects'), codexDir = join(HOME, '.codex') } = {}) {
  const claudeFiles = walk(claudeDir, (n) => n.endsWith('.jsonl'));
  for (const file of claudeFiles) {
    const f = (state.files[file] ??= { offset: 0 });
    f.offset = readNewLines(file, f.offset, (line) => ingestClaudeLine(state, line));
  }
  const codexFiles = [
    ...walk(join(codexDir, 'sessions'), (n) => n.endsWith('.jsonl')),
    ...walk(join(codexDir, 'archived_sessions'), (n) => n.endsWith('.jsonl')),
  ];
  const acct = codexAccount(join(codexDir, 'auth.json'));
  for (const file of codexFiles) {
    const f = (state.files[file] ??= { offset: 0 });
    f.offset = readNewLines(file, f.offset, (line) => ingestCodexLine(state, line, file, acct));
  }
  pruneSeen(state);
  return { claudeFiles: claudeFiles.length, codexFiles: codexFiles.length };
}

/** Keeps dedup markers small: after 45 days only the id is kept. */
function pruneSeen(state) {
  const cutoff = localDay(Date.now() - 45 * 86_400_000);
  for (const [id, v] of Object.entries(state.seen)) if (v && typeof v === 'object' && v.d < cutoff) state.seen[id] = 1;
}

export function dirtyRows(state) {
  return Object.keys(state.dirty)
    .filter((k) => state.totals[k])
    .map((k) => {
      const [day, source, account, model] = k.split('|');
      const t = state.totals[k];
      return {
        day,
        source,
        account,
        model,
        input_tokens: t.input,
        output_tokens: t.output,
        cache_read_tokens: t.cache_read,
        cache_write_tokens: t.cache_write,
        cache_write_1h_tokens: t.cache_write_1h,
        messages: t.messages,
      };
    });
}

// ---------------------------------------------------------------- upload
async function upload(config, rows, status) {
  const url = `${config.url.replace(/\/$/, '')}/rest/v1/rpc/ingest_usage`;
  const headers = { 'Content-Type': 'application/json', apikey: config.key };
  if (config.key.startsWith('eyJ')) headers.Authorization = `Bearer ${config.key}`;
  for (let i = 0; i < Math.max(rows.length, 1); i += UPLOAD_BATCH) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_token: config.token, p_rows: rows.slice(i, i + UPLOAD_BATCH), p_status: status }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Supabase respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

// ---------------------------------------------------------------- commands
const paths = () => ({ config: join(BASE_DIR, 'config.json'), state: join(BASE_DIR, 'state.json'), log: join(BASE_DIR, 'collector.log') });

function machineName() {
  try {
    return execFileSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf8' }).trim() || hostname();
  } catch {
    return hostname();
  }
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

export async function syncOnce({ dryRun = false, statePath = paths().state, config = readJson(paths().config, null) } = {}) {
  const state = loadState(statePath);
  recordAccount(state, currentClaudeAccount());
  const t0 = Date.now();
  const counts = scan(state);
  const rows = dirtyRows(state);
  if (dryRun) {
    return { rows, counts, ms: Date.now() - t0, state };
  }
  if (!config?.url || !config?.key || !config?.token) throw new Error('Falta configurar: corre "node collector.mjs setup --url ... --key ... --token ..."');
  const status = { machine: config.machine || machineName(), current_account: currentClaudeAccount(), version: VERSION };
  await upload(config, rows, status);
  state.dirty = {};
  state.lastSync = new Date().toISOString();
  writeJsonAtomic(statePath, state);
  return { rows, counts, ms: Date.now() - t0, state };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true;
      else {
        out[k] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function summarize(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = `${r.source} · ${r.account} · ${r.model}`;
    const v = by.get(k) ?? { tokens: 0, days: new Set() };
    v.tokens += r.input_tokens + r.output_tokens + r.cache_read_tokens + r.cache_write_tokens + r.cache_write_1h_tokens;
    v.days.add(r.day);
    by.set(k, v);
  }
  return [...by.entries()].sort((a, b) => b[1].tokens - a[1].tokens).map(([k, v]) => `  ${k}: ${(v.tokens / 1e6).toFixed(1)} M tokens en ${v.days.size} días`);
}

function plist(nodePath, script, logPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${nodePath}</string><string>${script}</string><string>daemon</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>WorkingDirectory</key><string>${BASE_DIR}</string>
  <key>StandardOutPath</key><string>${logPath}</string>
  <key>StandardErrorPath</key><string>${logPath}</string>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
</dict>
</plist>
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] ?? 'help';
  const p = paths();

  if (cmd === 'setup') {
    if (!args.url || !args.key || !args.token) throw new Error('Uso: setup --url <SUPABASE_URL> --key <LLAVE_PUBLICABLE> --token <TOKEN>');
    const prev = readJson(p.config, {});
    const config = { ...prev, url: String(args.url), key: String(args.key), token: String(args.token), machine: String(args.machine ?? prev.machine ?? machineName()) };
    writeJsonAtomic(p.config, config);
    if (args['history-account']) {
      const state = loadState(p.state);
      state.historyAccount = String(args['history-account']).toLowerCase();
      writeJsonAtomic(p.state, state);
    }
    console.log(`Listo. Configuración guardada en ${p.config} (solo tu usuario puede leerla).`);
    console.log('Prueba con: node collector.mjs sync   ·   Instala el servicio con: node collector.mjs install');
    return;
  }

  if (cmd === 'sync') {
    const r = await syncOnce({ dryRun: Boolean(args['dry-run']) });
    console.log(`${args['dry-run'] ? '[prueba] ' : ''}${r.rows.length} filas ${args['dry-run'] ? 'por subir' : 'subidas'} · ${r.counts.claudeFiles} archivos de Claude Code · ${r.counts.codexFiles} de Codex · ${r.ms} ms`);
    for (const line of summarize(r.rows).slice(0, 25)) console.log(line);
    return;
  }

  if (cmd === 'daemon') {
    log(`colector ${VERSION} iniciado`);
    let lastSync = 0;
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const state = loadState(p.state);
        const changed = recordAccount(state, currentClaudeAccount());
        if (changed) {
          writeJsonAtomic(p.state, state);
          log(`cuenta de Claude activa: ${state.timeline[state.timeline.length - 1].account}`);
        }
        if (changed || Date.now() - lastSync > SYNC_EVERY_MS) {
          const r = await syncOnce();
          lastSync = Date.now();
          if (r.rows.length) log(`subidas ${r.rows.length} filas en ${r.ms} ms`);
        }
      } catch (err) {
        log('error:', err instanceof Error ? err.message : err);
        lastSync = Date.now(); // retry on the next interval, not every 30 s
      } finally {
        running = false;
      }
    };
    await tick();
    setInterval(() => void tick(), ACCOUNT_POLL_MS);
    return;
  }

  if (cmd === 'install') {
    if (process.platform !== 'darwin') throw new Error('install solo funciona en macOS (launchd). En otros sistemas usa "daemon" con tu gestor de servicios.');
    if (!existsSync(p.config)) throw new Error('Primero corre "setup".');
    mkdirSync(BASE_DIR, { recursive: true });
    const script = join(BASE_DIR, 'collector.mjs');
    copyFileSync(fileURLToPath(import.meta.url), script); // run from ~/.os-vena, outside protected folders
    const plistPath = join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
    mkdirSync(dirname(plistPath), { recursive: true });
    writeFileSync(plistPath, plist(process.execPath, script, p.log));
    const uid = process.getuid?.() ?? 501;
    try {
      execFileSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { stdio: 'ignore' });
    } catch {
      // not loaded yet
    }
    execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath]);
    console.log(`Servicio instalado: sincroniza cada 5 minutos y detecta cambios de cuenta de Claude cada 30 s.\nRegistro: ${p.log}`);
    return;
  }

  if (cmd === 'uninstall') {
    const uid = process.getuid?.() ?? 501;
    try {
      execFileSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { stdio: 'ignore' });
    } catch {
      // already stopped
    }
    const plistPath = join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
    if (existsSync(plistPath)) unlinkSync(plistPath);
    console.log('Servicio detenido y desinstalado. Tu configuración sigue en ~/.os-vena por si lo reinstalas.');
    return;
  }

  if (cmd === 'status') {
    const config = readJson(p.config, null);
    const state = loadState(p.state);
    console.log(`Configurado: ${config ? `sí (${config.url}, equipo "${config.machine}")` : 'no'}`);
    console.log(`Cuenta de Claude activa: ${currentClaudeAccount() ?? 'ninguna'}`);
    console.log(`Cuenta de Codex: ${codexAccount()}`);
    console.log(`Última subida: ${state.lastSync ?? 'nunca'}`);
    console.log(`Cambios de cuenta registrados: ${state.timeline.length}`);
    for (const t of state.timeline.slice(-5)) console.log(`  ${t.at}  ${t.account}`);
    return;
  }

  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n').replace(/^\/\/ ?/gm, ''));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
