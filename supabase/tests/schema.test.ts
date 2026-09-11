// Runs the real migrations against an in-process Postgres (PGlite) with small
// stand-ins for the Supabase pieces (auth.uid(), storage, http) and checks
// RLS, the timer RPCs and the collector ingest.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS = join(__dirname, '..', 'migrations');
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;

  create schema extensions;
  create type extensions.http_response as (status integer, content_type varchar, headers text[], content varchar);
  create function extensions.http_set_curlopt(curlopt varchar, value varchar) returns boolean language sql as $$ select true $$;
  create function extensions.http_get(uri varchar) returns extensions.http_response language sql as $$
    select row(200, 'text/html', null,
      '<html><head><title>Fallback</title><meta property="og:title" content="Row Level Security &amp; Policies">' ||
      '<meta name="description" content="Protege cada fila."><meta property="og:image" content="https://x.test/og.png"></head></html>'
    )::extensions.http_response
  $$;
  grant usage on schema public, extensions to anon, authenticated;
`;

let db: PGlite;

async function as<T>(user: string | null, role: 'authenticated' | 'anon', fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(
      /create extension if not exists http with schema extensions;/i,
      '-- http extension stubbed in tests',
    );
    await db.exec(sql);
  }
  await db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');`);
}, 60_000);

describe('tiempo', () => {
  it('keeps a single running timer and stops the previous one', async () => {
    await as(USER_A, 'authenticated', async () => {
      const p = await db.query<{ id: string }>(`insert into public.projects (name) values ('OS Vena Digital') returning id`);
      const projectId = p.rows[0].id;
      const t = await db.query<{ id: string }>(
        `insert into public.tasks (project_id, name) values ($1, 'Diseño'), ($1, 'Colector') returning id`,
        [projectId],
      );
      const [t1, t2] = t.rows.map((r) => r.id);

      await db.query(`select public.start_timer($1)`, [t1]);
      await db.query(`select public.start_timer($1)`, [t2]);
      const running = await db.query<{ task_id: string }>(`select task_id from public.time_entries where ended_at is null`);
      expect(running.rows).toEqual([{ task_id: t2 }]);
      const all = await db.query(`select * from public.time_entries`);
      expect(all.rows).toHaveLength(2);

      await db.query(`select public.stop_timer()`);
      const stillRunning = await db.query(`select * from public.time_entries where ended_at is null`);
      expect(stillRunning.rows).toHaveLength(0);
    });
  });

  it('isolates data between users (RLS)', async () => {
    const seen = await as(USER_B, 'authenticated', () => db.query(`select * from public.projects`));
    expect(seen.rows).toHaveLength(0);
    await expect(
      as(USER_B, 'authenticated', () =>
        db.query(`insert into public.projects (user_id, name) values ('${USER_A}', 'intruso')`),
      ),
    ).rejects.toThrow();
  });

  it('refuses to start a timer on a task of another user', async () => {
    const taskA = await as(USER_A, 'authenticated', () => db.query<{ id: string }>(`select id from public.tasks limit 1`));
    await expect(
      as(USER_B, 'authenticated', () => db.query(`select public.start_timer($1)`, [taskA.rows[0].id])),
    ).rejects.toThrow(/task not found/);
  });
});

describe('consumo IA ingest', () => {
  const token = 'tok_' + 'a'.repeat(40);
  const hash = createHash('sha256').update(token).digest('hex');
  const row = (overrides: Record<string, unknown> = {}) => ({
    day: '2026-09-11',
    source: 'claude_code',
    account: 'personal@example.com',
    model: 'claude-opus-5',
    input_tokens: 100,
    output_tokens: 200,
    cache_read_tokens: 3000,
    cache_write_tokens: 40,
    cache_write_1h_tokens: 0,
    messages: 5,
    ...overrides,
  });

  it('accepts a valid token and upserts absolute totals', async () => {
    await as(USER_A, 'authenticated', () =>
      db.query(`insert into public.collector_tokens (label, token_hash) values ('Mac', $1)`, [hash]),
    );
    const n = await as(null, 'anon', () =>
      db.query<{ ingest_usage: number }>(`select public.ingest_usage($1, $2::jsonb, $3::jsonb)`, [
        token,
        JSON.stringify([row(), row({ model: 'claude-sonnet-5', input_tokens: 7 })]),
        JSON.stringify({ machine: 'MacBook', current_account: 'personal@example.com', version: '1.0.0' }),
      ]),
    );
    expect(n.rows[0].ingest_usage).toBe(2);

    await as(null, 'anon', () =>
      db.query(`select public.ingest_usage($1, $2::jsonb)`, [token, JSON.stringify([row({ input_tokens: 999 })])]),
    );
    const usage = await as(USER_A, 'authenticated', () =>
      db.query<{ model: string; input_tokens: string }>(`select model, input_tokens from public.usage_daily order by model`),
    );
    expect(usage.rows.map((r) => [r.model, Number(r.input_tokens)])).toEqual([
      ['claude-opus-5', 999],
      ['claude-sonnet-5', 7],
    ]);
    const status = await as(USER_A, 'authenticated', () => db.query(`select machine, current_account from public.collector_status`));
    expect(status.rows).toEqual([{ machine: 'MacBook', current_account: 'personal@example.com' }]);
  });

  it('rejects unknown or revoked tokens and keeps usage private', async () => {
    await expect(
      as(null, 'anon', () => db.query(`select public.ingest_usage($1, '[]'::jsonb)`, ['x'.repeat(40)])),
    ).rejects.toThrow(/invalid token/);
    await as(USER_A, 'authenticated', () => db.query(`update public.collector_tokens set revoked_at = now()`));
    await expect(
      as(null, 'anon', () => db.query(`select public.ingest_usage($1, '[]'::jsonb)`, [token])),
    ).rejects.toThrow(/invalid token/);
    const other = await as(USER_B, 'authenticated', () => db.query(`select * from public.usage_daily`));
    expect(other.rows).toHaveLength(0);
    await expect(as(null, 'anon', () => db.query(`select * from public.usage_daily`))).rejects.toThrow();
  });
});

describe('notas', () => {
  it('builds a link preview for authenticated users only', async () => {
    const res = await as(USER_A, 'authenticated', () =>
      db.query<{ link_preview: Record<string, string> }>(`select public.link_preview('https://supabase.com/docs/guides/rls')`),
    );
    expect(res.rows[0].link_preview).toMatchObject({
      site: 'supabase.com',
      title: 'Row Level Security & Policies',
      description: 'Protege cada fila.',
      image: 'https://x.test/og.png',
    });
    const internal = await as(USER_A, 'authenticated', () =>
      db.query<{ link_preview: Record<string, string> }>(`select public.link_preview('http://localhost:5432/')`),
    );
    expect(internal.rows[0].link_preview).toEqual({ site: 'localhost' });
    await expect(
      as(null, 'anon', () => db.query(`select public.link_preview('https://supabase.com')`)),
    ).rejects.toThrow();
  });
});
