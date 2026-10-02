import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Router, parseRoutes, DEFAULT_ROUTES } from '../src/core/router.ts';
import { DownloadError, type DownloadProvider, type ErrorCode, type MediaInfo, type MediaKind } from '../src/core/types.ts';

const target = { url: 'https://x.com/a/status/1', platform: 'x' as const, label: 'X' };
const info = (title: string): MediaInfo => ({ platform: 'x', label: 'X', url: target.url, title, items: 1, options: { video: ['best'], audio: [], image: false } });

function fake(id: string, o: { kinds?: MediaKind[]; healthy?: boolean; fail?: ErrorCode; calls?: string[] } = {}): DownloadProvider {
  return {
    id,
    capabilities: () => o.kinds ?? ['video', 'audio'],
    healthCheck: async () => ({ ok: o.healthy ?? true }),
    inspect: async () => {
      o.calls?.push(`inspect:${id}`);
      if (o.fail) throw new DownloadError(o.fail);
      return info(id);
    },
    download: async (_req, ctx) => {
      o.calls?.push(`download:${id}`);
      await writeFile(path.join(ctx.dir, `${id}.part`), 'x');
      if (o.fail) throw new DownloadError(o.fail);
      await writeFile(path.join(ctx.dir, `${id}.mp4`), 'ok');
    },
  };
}
const ctx = async () => ({ dir: await mkdtemp(path.join(os.tmpdir(), 'router-test-')), signal: new AbortController().signal, maxBytes: 1e9, onProgress() {} });

test('usa el primer motor sano de la ruta', async () => {
  const calls: string[] = [];
  const r = new Router([fake('a', { calls, healthy: false }), fake('b', { calls }), fake('c', { calls })], { routes: { ...DEFAULT_ROUTES, x: ['a', 'b', 'c'] } });
  assert.equal((await r.inspect(target, new AbortController().signal)).title, 'b');
  assert.deepEqual(calls, ['inspect:b']);
});

test('si un motor falla pasa al siguiente y le deja la carpeta limpia', async () => {
  const calls: string[] = [];
  const r = new Router([fake('a', { calls, fail: 'engine_error' }), fake('b', { calls })], { routes: { ...DEFAULT_ROUTES, x: ['a', 'b'] } });
  const c = await ctx();
  assert.equal(await r.download({ url: target.url, platform: 'x', kind: 'video' }, c), 'b');
  assert.deepEqual(await readdir(c.dir).then((f) => f.sort()), ['b.mp4', 'b.part']);
});

test('filtra por capacidad: imágenes solo van a motores que las sirven', async () => {
  const calls: string[] = [];
  const r = new Router([fake('vid', { calls }), fake('img', { calls, kinds: ['image'] })], { routes: { ...DEFAULT_ROUTES, x: ['vid', 'img'] } });
  assert.equal(await r.download({ url: target.url, platform: 'x', kind: 'image' }, await ctx()), 'img');
  assert.deepEqual(calls, ['download:img']);
});

test('errores definitivos no prueban otro motor', async () => {
  const calls: string[] = [];
  const r = new Router([fake('a', { calls, fail: 'too_large' }), fake('b', { calls })], { routes: { ...DEFAULT_ROUTES, x: ['a', 'b'] } });
  await assert.rejects(r.download({ url: target.url, platform: 'x', kind: 'video' }, await ctx()), (e: DownloadError) => e.code === 'too_large');
  assert.deepEqual(calls, ['download:a']);
});

test('si todos fallan devuelve el error más informativo', async () => {
  const r = new Router([fake('a', { fail: 'engine_error' }), fake('b', { fail: 'login_required' })], { routes: { ...DEFAULT_ROUTES, x: ['a', 'b'] } });
  await assert.rejects(r.inspect(target, new AbortController().signal), (e: DownloadError) => e.code === 'login_required');
});

test('sin motores disponibles responde engine_unavailable', async () => {
  const r = new Router([fake('a', { healthy: false })], { routes: { ...DEFAULT_ROUTES, x: ['a'] } });
  await assert.rejects(r.inspect(target, new AbortController().signal), (e: DownloadError) => e.code === 'engine_unavailable');
});

test('las rutas se cambian por configuración', () => {
  const r = parseRoutes('youtube=cobalt,yt-dlp; nope=a; x=');
  assert.deepEqual(r.youtube, ['cobalt', 'yt-dlp']);
  assert.deepEqual(r.x, DEFAULT_ROUTES.x);
});
