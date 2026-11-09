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
  grant usage on schema storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant execute on function storage.foldername(text) to authenticated;

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

  it('stores sessions per folder and keeps them idempotent', async () => {
    const session = (overrides: Record<string, unknown> = {}) => ({
      source: 'claude_code',
      session_id: 'sess-os-1',
      project: 'OS Vena Digital',
      account: 'personal@example.com',
      started_at: '2026-09-11T11:46:00Z',
      ended_at: '2026-09-11T14:26:00Z',
      models: { 'claude-opus-5': { input: 10, output: 20, cache_read: 1000, cache_write: 5, cache_write_1h: 0, messages: 3 } },
      ...overrides,
    });
    await as(null, 'anon', () =>
      db.query(`select public.ingest_usage($1, '[]'::jsonb, '{}'::jsonb, $2::jsonb)`, [token, JSON.stringify([session()])]),
    );
    await as(null, 'anon', () =>
      db.query(`select public.ingest_usage($1, '[]'::jsonb, '{}'::jsonb, $2::jsonb)`, [
        token,
        JSON.stringify([session({ started_at: '2026-09-11T12:00:00Z', ended_at: '2026-09-11T15:00:00Z' })]),
      ]),
    );
    const rows = await as(USER_A, 'authenticated', () =>
      db.query<{ project: string; started_at: Date; ended_at: Date }>(`select project, started_at, ended_at from public.usage_sessions`),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].project).toBe('OS Vena Digital');
    expect(new Date(rows.rows[0].started_at).toISOString()).toBe('2026-09-11T11:46:00.000Z');
    expect(new Date(rows.rows[0].ended_at).toISOString()).toBe('2026-09-11T15:00:00.000Z');
    const other = await as(USER_B, 'authenticated', () => db.query(`select * from public.usage_sessions`));
    expect(other.rows).toHaveLength(0);
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

describe('tableros', () => {
  it('keeps board images in a private bucket, one folder per user', async () => {
    const bucket = await db.query(`select public from storage.buckets where id = 'boards'`);
    expect(bucket.rows).toEqual([{ public: false }]);

    const path = `${USER_A}/board-1/3cebd7720911620a3938ce77243696149da03861`;
    await as(USER_A, 'authenticated', () => db.query(`insert into storage.objects (bucket_id, name) values ('boards', $1)`, [path]));
    const mine = await as(USER_A, 'authenticated', () => db.query(`select name from storage.objects where bucket_id = 'boards'`));
    expect(mine.rows).toEqual([{ name: path }]);

    const other = await as(USER_B, 'authenticated', () => db.query(`select name from storage.objects where bucket_id = 'boards'`));
    expect(other.rows).toHaveLength(0);
    await expect(
      as(USER_B, 'authenticated', () =>
        db.query(`insert into storage.objects (bucket_id, name) values ('boards', $1)`, [`${USER_A}/board-1/intruso`]),
      ),
    ).rejects.toThrow();
  });
});

describe('calendario', () => {
  it('keeps Google tokens out of reach of the browser roles', async () => {
    await db.exec(`insert into public.google_connections (user_id, email, refresh_token) values ('${USER_A}', 'a@x.test', 'secreto')`);
    for (const role of ['authenticated', 'anon'] as const) {
      await expect(as(USER_A, role, () => db.query(`select refresh_token from public.google_connections`))).rejects.toThrow(/permission denied/);
    }
    await expect(
      as(USER_A, 'authenticated', () => db.query(`update public.google_connections set refresh_token = 'otro'`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('clientes', () => {
  it('links one Tiempo project per client and keeps tasks with their delivery date', async () => {
    const ids = await as(USER_A, 'authenticated', async () => {
      const p = await db.query<{ id: string }>(`insert into public.projects (name) values ('Clínica Andina') returning id`);
      const c = await db.query<{ id: string; fee: string; status: string }>(
        `insert into public.clients (name, project_id, fee, included_hours) values ('Clínica Andina', $1, 4200000, 30) returning id, fee, status`,
        [p.rows[0].id],
      );
      expect(c.rows[0]).toMatchObject({ fee: '4200000.00', status: 'activo' });
      const t = await db.query<{ due_date: string }>(`insert into public.tasks (project_id, name, due_date) values ($1, 'Landing', '2026-10-02') returning due_date::text`, [p.rows[0].id]);
      expect(t.rows[0].due_date).toBe('2026-10-02');
      await expect(db.query(`insert into public.clients (name, project_id) values ('Otro', $1)`, [p.rows[0].id])).rejects.toThrow(/duplicate key/);
      return { project: p.rows[0].id, client: c.rows[0].id };
    });

    // Deleting the project leaves the client without one.
    await as(USER_A, 'authenticated', () => db.query(`delete from public.projects where id = $1`, [ids.project]));
    const after = await as(USER_A, 'authenticated', () => db.query<{ project_id: string | null }>(`select project_id from public.clients where id = $1`, [ids.client]));
    expect(after.rows[0].project_id).toBeNull();
  });

  it('keeps logs and invoices private and refuses links to rows of another user', async () => {
    const a = await as(USER_A, 'authenticated', async () => {
      const c = await db.query<{ id: string }>(`insert into public.clients (name) values ('Taller Norte') returning id`);
      await db.query(`insert into public.client_logs (client_id, kind, title) values ($1, 'reunion', 'Kickoff')`, [c.rows[0].id]);
      await db.query(`insert into public.client_invoices (client_id, number, amount, issued_on, due_on) values ($1, '2026-001', 100, '2026-09-01', '2026-09-16')`, [c.rows[0].id]);
      await expect(db.query(`insert into public.client_invoices (client_id, number) values ($1, '2026-001')`, [c.rows[0].id])).rejects.toThrow(/duplicate key/);
      await expect(
        db.query(`insert into public.client_invoices (client_id, number, issued_on, due_on) values ($1, '2026-002', '2026-09-10', '2026-09-01')`, [c.rows[0].id]),
      ).rejects.toThrow(/client_invoices_dates/);
      const p = await db.query<{ id: string }>(`insert into public.projects (name) values ('Privado') returning id`);
      return { client: c.rows[0].id, project: p.rows[0].id };
    });

    await as(USER_B, 'authenticated', async () => {
      for (const table of ['clients', 'client_logs', 'client_invoices']) {
        expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
      }
      // Another user's client or project can't be attached to B's rows.
      await expect(db.query(`insert into public.client_logs (client_id, title) values ($1, 'intruso')`, [a.client])).rejects.toThrow();
      await expect(db.query(`insert into public.client_invoices (client_id, number) values ($1, 'X-1')`, [a.client])).rejects.toThrow();
      await expect(db.query(`insert into public.clients (name, project_id) values ('Robo', $1)`, [a.project])).rejects.toThrow();
      // B can reuse A's invoice number: numbering is per user.
      const mine = await db.query<{ id: string }>(`insert into public.clients (name) values ('Mío') returning id`);
      await db.query(`insert into public.client_invoices (client_id, number) values ($1, '2026-001')`, [mine.rows[0].id]);
    });

    await as(USER_A, 'authenticated', () => db.query(`delete from public.clients where id = $1`, [a.client]));
    const left = await db.query(`select 1 from public.client_logs where client_id = $1 union all select 1 from public.client_invoices where client_id = $1`, [a.client]);
    expect(left.rows).toHaveLength(0);
  });
});

describe('clientes · logos y palabras clave', () => {
  it('keeps client logos in a private bucket, one folder per user, and defaults keywords to empty', async () => {
    const bucket = await db.query(`select public from storage.buckets where id = 'clients'`);
    expect(bucket.rows).toEqual([{ public: false }]);
    const path = `${USER_A}/logo.webp`;
    await as(USER_A, 'authenticated', () => db.query(`insert into storage.objects (bucket_id, name) values ('clients', $1)`, [path]));
    expect((await as(USER_B, 'authenticated', () => db.query(`select name from storage.objects where bucket_id = 'clients'`))).rows).toHaveLength(0);
    await expect(
      as(USER_B, 'authenticated', () => db.query(`insert into storage.objects (bucket_id, name) values ('clients', $1)`, [`${USER_A}/intruso.webp`])),
    ).rejects.toThrow();
    const c = await as(USER_A, 'authenticated', () =>
      db.query<{ ai_keywords: string[]; logo_path: string | null }>(`insert into public.clients (name, logo_path) values ('Con logo', $1) returning ai_keywords, logo_path`, [path]),
    );
    expect(c.rows[0]).toEqual({ ai_keywords: [], logo_path: path });
  });
});

describe('documentos', () => {
  it('keeps PDFs in a private bucket and annotations visible only to their owner', async () => {
    const bucket = await db.query(`select public, allowed_mime_types from storage.buckets where id = 'documents'`);
    expect(bucket.rows).toEqual([{ public: false, allowed_mime_types: ['application/pdf'] }]);
    const path = `${USER_A}/doc-1.pdf`;
    await as(USER_A, 'authenticated', () => db.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [path]));
    expect((await as(USER_B, 'authenticated', () => db.query(`select name from storage.objects where bucket_id = 'documents'`))).rows).toHaveLength(0);
    await expect(
      as(USER_B, 'authenticated', () => db.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [`${USER_A}/intruso.pdf`])),
    ).rejects.toThrow();

    const d = await as(USER_A, 'authenticated', () =>
      db.query<{ annotations: unknown; page_count: number }>(
        `insert into public.documents (name, file_path, page_count) values ('Contrato', $1, 3) returning annotations, page_count`,
        [path],
      ),
    );
    expect(d.rows[0]).toEqual({ annotations: {}, page_count: 3 });
    expect((await as(USER_B, 'authenticated', () => db.query(`select id from public.documents`))).rows).toHaveLength(0);
  });

  it('keeps captures private to their owner and alive after their document is deleted', async () => {
    const bucket = await db.query(`select public, allowed_mime_types from storage.buckets where id = 'captures'`);
    expect(bucket.rows).toEqual([{ public: false, allowed_mime_types: ['image/png', 'image/jpeg'] }]);
    const path = `${USER_A}/cap-1.png`;
    await as(USER_A, 'authenticated', () => db.query(`insert into storage.objects (bucket_id, name) values ('captures', $1)`, [path]));
    expect((await as(USER_B, 'authenticated', () => db.query(`select name from storage.objects where bucket_id = 'captures'`))).rows).toHaveLength(0);
    await expect(
      as(USER_B, 'authenticated', () => db.query(`insert into storage.objects (bucket_id, name) values ('captures', $1)`, [`${USER_A}/intruso.png`])),
    ).rejects.toThrow();

    await as(USER_A, 'authenticated', async () => {
      const doc = await db.query<{ id: string; source_url: string }>(
        `insert into public.documents (name, file_path, source_url) values ('Web', 'x/web.pdf', 'https://venadigital.com.co/') returning id, source_url`,
      );
      expect(doc.rows[0].source_url).toBe('https://venadigital.com.co/');
      await db.query(`insert into public.captures (document_id, name, file_path, width, height) values ($1, 'Portada', $2, 800, 600)`, [doc.rows[0].id, path]);
      await db.query(`delete from public.documents where id = $1`, [doc.rows[0].id]);
      expect((await db.query(`select name, document_id from public.captures where file_path = $1`, [path])).rows).toEqual([{ name: 'Portada', document_id: null }]);
    });
    expect((await as(USER_B, 'authenticated', () => db.query(`select id from public.captures`))).rows).toHaveLength(0);
  });
});

describe('noticias', () => {
  beforeAll(async () => {
    await db.exec(`
      insert into public.news_sources (slug, name, site) values ('xataka', 'Xataka', 'xataka.com');
      insert into public.news_items (source, url, title, published_at) values ('xataka', 'https://xataka.com/a', 'Una noticia', now());
    `);
  });

  it('lets anyone signed in read, and nobody write', async () => {
    const seen = await as(USER_A, 'authenticated', () => db.query(`select * from public.news_items`));
    expect(seen.rows).toHaveLength(1);
    await expect(
      as(USER_A, 'authenticated', () => db.query(`insert into public.news_items (source, url, title, published_at) values ('xataka', 'https://xataka.com/b', 'Intruso', now())`)),
    ).rejects.toThrow();
    await expect(as(USER_A, 'authenticated', () => db.query(`delete from public.news_items`))).rejects.toThrow();
    await expect(as(USER_A, 'authenticated', () => db.query(`update public.news_sources set name = 'Otro'`))).rejects.toThrow();
  });

  it('keeps the news away from people not signed in', async () => {
    await expect(as(null, 'anon', () => db.query(`select * from public.news_items`))).rejects.toThrow();
  });

  it('refuses addresses and images that are not web links', async () => {
    await expect(db.query(`insert into public.news_items (source, url, title, published_at) values ('xataka', 'javascript:alert(1)', 'Mal', now())`)).rejects.toThrow();
    await expect(
      db.query(`insert into public.news_items (source, url, title, image_url, published_at) values ('xataka', 'https://xataka.com/c', 'Mal', 'http://x.test/a.png', now())`),
    ).rejects.toThrow();
  });

  it('never lets the app ask about the sync secret', async () => {
    await expect(as(USER_A, 'authenticated', () => db.query(`select public.news_sync_authorized('x')`))).rejects.toThrow(/permission denied/);
    await expect(as(null, 'anon', () => db.query(`select public.news_sync_authorized('x')`))).rejects.toThrow(/permission denied/);
  });
});

describe('notas · capa de tareas', () => {
  it('starts in Entrada, stamps completed_at with done and clears it on reopen', async () => {
    await as(USER_A, 'authenticated', async () => {
      const n = await db.query<{ id: string; bucket: string; deadline: string | null; checklist: unknown[]; completed_at: string | null }>(
        `insert into public.notes (type, body) values ('hacer', 'Llamar') returning id, bucket, deadline, checklist, completed_at`,
      );
      expect(n.rows[0]).toMatchObject({ bucket: 'entrada', deadline: null, checklist: [], completed_at: null });
      const id = n.rows[0].id;
      const stamp = async () => (await db.query<{ completed_at: string | null }>(`select completed_at::text from public.notes where id = $1`, [id])).rows[0].completed_at;

      await db.query(`update public.notes set done = true where id = $1`, [id]);
      const done = await stamp();
      expect(done).not.toBeNull();
      await db.query(`update public.notes set done = true, body = 'Llamar ya' where id = $1`, [id]);
      expect(await stamp()).toBe(done);
      await db.query(`update public.notes set done = false where id = $1`, [id]);
      expect(await stamp()).toBeNull();
    });
  });

  it('refuses a bucket it does not know and a checklist that is not a list', async () => {
    await as(USER_A, 'authenticated', async () => {
      await expect(db.query(`insert into public.notes (bucket) values ('luego')`)).rejects.toThrow();
      await expect(db.query(`insert into public.notes (checklist) values ('{"a": 1}'::jsonb)`)).rejects.toThrow();
    });
  });

  it('starts with no order of its own and keeps the one it is dragged to', async () => {
    await as(USER_A, 'authenticated', async () => {
      const n = await db.query<{ id: string; sort: number | null; today_sort: number | null }>(`insert into public.notes (type, body) values ('hacer', 'Ordenar') returning id, sort, today_sort`);
      expect(n.rows[0]).toMatchObject({ sort: null, today_sort: null });
      const moved = await db.query<{ sort: number; today_sort: number }>(`update public.notes set sort = 1.5, today_sort = -1 where id = $1 returning sort, today_sort`, [n.rows[0].id]);
      expect(moved.rows[0]).toEqual({ sort: 1.5, today_sort: -1 });
    });
  });
});

describe('notas · áreas, proyectos y secciones', () => {
  it('keeps tasks when their section or list is deleted', async () => {
    await as(USER_A, 'authenticated', async () => {
      const list = (await db.query<{ id: string }>(`insert into public.note_lists (name) values ('Academia') returning id`)).rows[0].id;
      const section = (await db.query<{ id: string }>(`insert into public.note_sections (list_id, name) values ($1, 'Grabación') returning id`, [list])).rows[0].id;
      const task = (await db.query<{ id: string }>(`insert into public.notes (type, body, list_id, section_id) values ('hacer', 'Grabar', $1, $2) returning id`, [list, section])).rows[0].id;
      const links = async () => (await db.query<{ list_id: string | null; section_id: string | null }>(`select list_id, section_id from public.notes where id = $1`, [task])).rows[0];
      expect(await links()).toEqual({ list_id: list, section_id: section });

      await db.query(`delete from public.note_sections where id = $1`, [section]);
      expect(await links()).toEqual({ list_id: list, section_id: null });

      const again = (await db.query<{ id: string }>(`insert into public.note_sections (list_id, name) values ($1, 'Otra') returning id`, [list])).rows[0].id;
      await db.query(`update public.notes set section_id = $1 where id = $2`, [again, task]);
      await db.query(`delete from public.note_lists where id = $1`, [list]);
      expect(await links()).toEqual({ list_id: null, section_id: null });
      expect((await db.query(`select id from public.note_sections where id = $1`, [again])).rows).toHaveLength(0);
    });
  });

  it('drops a section that is not from the list of the task', async () => {
    await as(USER_A, 'authenticated', async () => {
      const one = (await db.query<{ id: string }>(`insert into public.note_lists (name) values ('Uno') returning id`)).rows[0].id;
      const two = (await db.query<{ id: string }>(`insert into public.note_lists (name) values ('Dos') returning id`)).rows[0].id;
      const section = (await db.query<{ id: string }>(`insert into public.note_sections (list_id, name) values ($1, 'De uno') returning id`, [one])).rows[0].id;
      const inserted = await db.query<{ section_id: string | null }>(`insert into public.notes (body, list_id, section_id) values ('Cruzada', $1, $2) returning section_id`, [two, section]);
      expect(inserted.rows[0].section_id).toBeNull();
      const moved = await db.query<{ id: string }>(`insert into public.notes (body, list_id, section_id) values ('Se mueve', $1, $2) returning id`, [one, section]);
      const after = await db.query<{ section_id: string | null }>(`update public.notes set list_id = $1 where id = $2 returning section_id`, [two, moved.rows[0].id]);
      expect(after.rows[0].section_id).toBeNull();
    });
  });

  it('only hangs projects from areas, and keeps the projects when the area goes', async () => {
    await as(USER_A, 'authenticated', async () => {
      const area = (await db.query<{ id: string }>(`insert into public.note_lists (kind, name) values ('area', 'Vena') returning id`)).rows[0].id;
      const project = (await db.query<{ id: string }>(`insert into public.note_lists (kind, area_id, name) values ('proyecto', $1, 'Podcast') returning id`, [area])).rows[0].id;
      await expect(db.query(`insert into public.note_lists (kind, area_id, name) values ('proyecto', $1, 'Dentro de un proyecto')`, [project])).rejects.toThrow(/área no es válida/);
      await expect(db.query(`insert into public.note_lists (kind, area_id, name) values ('area', $1, 'Área dentro de área')`, [area])).rejects.toThrow(/área no es válida/);
      await db.query(`delete from public.note_lists where id = $1`, [area]);
      const left = await db.query<{ area_id: string | null }>(`select area_id from public.note_lists where id = $1`, [project]);
      expect(left.rows[0].area_id).toBeNull();
    });
  });

  it('keeps lists and sections private and refuses links to rows of another user', async () => {
    const a = await as(USER_A, 'authenticated', async () => {
      const area = (await db.query<{ id: string }>(`insert into public.note_lists (kind, name) values ('area', 'Privada') returning id`)).rows[0].id;
      const list = (await db.query<{ id: string }>(`insert into public.note_lists (name) values ('Privado') returning id`)).rows[0].id;
      const section = (await db.query<{ id: string }>(`insert into public.note_sections (list_id, name) values ($1, 'Privada') returning id`, [list])).rows[0].id;
      return { area, list, section };
    });
    await as(USER_B, 'authenticated', async () => {
      expect((await db.query(`select * from public.note_lists`)).rows).toHaveLength(0);
      expect((await db.query(`select * from public.note_sections`)).rows).toHaveLength(0);
      await expect(db.query(`insert into public.note_sections (list_id, name) values ($1, 'Intrusa')`, [a.list])).rejects.toThrow();
      await expect(db.query(`insert into public.notes (body, list_id) values ('Intrusa', $1)`, [a.list])).rejects.toThrow();
      await expect(db.query(`insert into public.note_lists (kind, area_id, name) values ('proyecto', $1, 'Intruso')`, [a.area])).rejects.toThrow(/área no es válida/);
      const mine = await db.query<{ section_id: string | null }>(`insert into public.notes (body, section_id) values ('Sin lista', $1) returning section_id`, [a.section]);
      expect(mine.rows[0].section_id).toBeNull();
    });
  });
});

describe('tareas · fecha de terminado', () => {
  it('stamps completed_at when a task is marked done, keeps it on later edits and clears it on reopen', async () => {
    await as(USER_A, 'authenticated', async () => {
      const p = await db.query<{ id: string }>(`insert into public.projects (name) values ('Exportar') returning id`);
      const t = await db.query<{ id: string; completed_at: string | null }>(`insert into public.tasks (project_id, name) values ($1, 'Informe') returning id, completed_at`, [p.rows[0].id]);
      expect(t.rows[0].completed_at).toBeNull();
      const id = t.rows[0].id;
      const stamp = async () => (await db.query<{ completed_at: string | null }>(`select completed_at::text from public.tasks where id = $1`, [id])).rows[0].completed_at;

      await db.query(`update public.tasks set archived = true where id = $1`, [id]);
      const done = await stamp();
      expect(done).not.toBeNull();
      await db.query(`update public.tasks set archived = true, name = 'Informe final' where id = $1`, [id]);
      expect(await stamp()).toBe(done);
      await db.query(`update public.tasks set archived = false where id = $1`, [id]);
      expect(await stamp()).toBeNull();

      const born = await db.query<{ completed_at: string | null }>(`insert into public.tasks (project_id, name, archived) values ($1, 'Ya hecha', true) returning completed_at`, [p.rows[0].id]);
      expect(born.rows[0].completed_at).not.toBeNull();
    });
  });
});
