import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { JobManager, type JobPolicy } from '../src/core/jobs.ts';
import type { Router } from '../src/core/router.ts';
import { TempStore } from '../src/core/storage.ts';
import { DownloadError, type DownloadContext } from '../src/core/types.ts';

const MIN = 60_000;
const policy: JobPolicy = {
  maxConcurrent: 1, maxQueued: 2, maxFileBytes: 1e9, quotaBytes: 1e9, jobTimeoutMs: 5 * MIN,
  readyTtlMs: 15 * MIN, deliveredGraceMs: MIN, forgetAfterMs: 60 * MIN, orphanGraceMs: 5 * MIN,
};
const req = { url: 'https://youtu.be/a', platform: 'youtube' as const, kind: 'video' as const };

type Behaviour = (ctx: DownloadContext) => Promise<void>;
const writes: Behaviour = async (ctx) => void (await writeFile(path.join(ctx.dir, 'video.mp4'), 'data'));
const fakeRouter = (b: Behaviour) => ({ download: async (_r: unknown, ctx: DownloadContext) => (await b(ctx), 'fake') }) as unknown as Router;

async function setup(b: Behaviour, p: Partial<JobPolicy> = {}) {
  const root = path.join(await mkdtemp(path.join(os.tmpdir(), 'lab-')), 'vena-downloader');
  const store = new TempStore(root);
  let now = 1_000_000;
  const jobs = new JobManager(fakeRouter(b), store, { ...policy, ...p }, { now: () => now });
  await jobs.start(10 * MIN);
  return { jobs, store, root, advance: (ms: number) => (now += ms), now: () => now };
}
const settle = async (jobs: JobManager, id: string) => {
  for (let i = 0; i < 100; i++) {
    const s = jobs.get(id)?.status;
    if (s && s !== 'queued' && s !== 'running') return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('no terminó');
};

test('al arrancar borra lo que quedó de una ejecución anterior', async () => {
  const root = path.join(await mkdtemp(path.join(os.tmpdir(), 'lab-')), 'vena-downloader');
  await mkdir(path.join(root, 'viejo'), { recursive: true });
  await writeFile(path.join(root, 'viejo', 'x.mp4'), 'x');
  await new TempStore(root).init();
  assert.deepEqual(await readdir(root), []);
});

test('archivo listo sin descargar se borra al vencer el plazo', async () => {
  const t = await setup(writes);
  const job = await t.jobs.create(req);
  assert.equal(await settle(t.jobs, job.id), 'ready');
  assert.deepEqual(await readdir(path.join(t.root, job.id)), ['video.mp4']);
  t.advance(14 * MIN);
  await t.jobs.sweep();
  assert.equal(t.jobs.get(job.id)?.status, 'ready');
  t.advance(2 * MIN);
  await t.jobs.sweep();
  assert.equal(t.jobs.get(job.id)?.status, 'expired');
  assert.deepEqual(await readdir(t.root), []);
  assert.equal(t.jobs.fileFor(job.id, 0), 'gone');
});

test('después de entregarlo se borra tras la gracia corta', async () => {
  const t = await setup(writes);
  const job = await t.jobs.create(req);
  await settle(t.jobs, job.id);
  t.jobs.markDelivered(job.id, 0);
  t.advance(MIN + 1);
  await t.jobs.sweep();
  assert.equal(t.jobs.get(job.id)?.status, 'expired');
  assert.deepEqual(await readdir(t.root), []);
});

test('si falla, la carpeta se borra al momento', async () => {
  const t = await setup(async (ctx) => {
    await writeFile(path.join(ctx.dir, 'video.mp4.part'), 'x');
    throw new DownloadError('login_required');
  });
  const job = await t.jobs.create(req);
  assert.equal(await settle(t.jobs, job.id), 'failed');
  assert.equal(t.jobs.get(job.id)?.error, 'login_required');
  assert.deepEqual(await readdir(t.root), []);
});

test('cancelar detiene el motor y borra la carpeta', async () => {
  const t = await setup(
    (ctx) =>
      new Promise((_, reject) => {
        void writeFile(path.join(ctx.dir, 'a.part'), 'x');
        ctx.signal.addEventListener('abort', () => reject(new DownloadError('cancelled')));
      }),
  );
  const job = await t.jobs.create(req);
  await new Promise((r) => setTimeout(r, 20));
  await t.jobs.cancel(job.id);
  assert.equal(await settle(t.jobs, job.id), 'cancelled');
  assert.deepEqual(await readdir(t.root), []);
});

test('un trabajo que excede el tiempo máximo se corta', async () => {
  const t = await setup(
    (ctx) => new Promise((_, reject) => ctx.signal.addEventListener('abort', () => reject(new DownloadError('cancelled')))),
    { jobTimeoutMs: 30 },
  );
  const job = await t.jobs.create(req);
  assert.equal(await settle(t.jobs, job.id), 'failed');
  assert.equal(t.jobs.get(job.id)?.error, 'timeout');
});

test('la cola tiene límite y la cuota de disco se respeta', async () => {
  const hang: Behaviour = (ctx) => new Promise((_, reject) => ctx.signal.addEventListener('abort', () => reject(new DownloadError('cancelled'))));
  const t = await setup(hang);
  await t.jobs.create(req); // running
  await t.jobs.create(req); // queued 1
  await t.jobs.create(req); // queued 2
  await assert.rejects(t.jobs.create(req), (e: DownloadError) => e.code === 'busy');
  await t.jobs.stop();

  const q = await setup(writes, { quotaBytes: 3 });
  const first = await q.jobs.create(req);
  await settle(q.jobs, first.id);
  await assert.rejects(q.jobs.create(req), (e: DownloadError) => e.code === 'storage_full');
});

test('el barrido elimina carpetas huérfanas viejas', async () => {
  const t = await setup(writes);
  const orphan = path.join(t.root, 'huerfana');
  await mkdir(orphan);
  const old = new Date(t.now() - 10 * MIN);
  await utimes(orphan, old, old);
  await t.jobs.sweep();
  assert.deepEqual(await readdir(t.root), []);
});

test('apagar no deja nada en disco', async () => {
  const t = await setup(writes);
  const job = await t.jobs.create(req);
  await settle(t.jobs, job.id);
  await t.jobs.stop();
  await assert.rejects(readdir(t.root));
});

test('no acepta carpetas raíz peligrosas', () => {
  assert.throws(() => new TempStore('/'));
  assert.throws(() => new TempStore(os.homedir()));
});
