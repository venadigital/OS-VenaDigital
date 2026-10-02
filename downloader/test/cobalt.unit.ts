import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { CobaltProvider } from '../src/providers/cobalt.ts';
import { DownloadError } from '../src/core/types.ts';

// Minimal stand-in for a self-hosted Cobalt instance, following its documented API.
let base = '';
const seen: Record<string, unknown>[] = [];
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') return res.end(JSON.stringify({ cobalt: { version: '11.0' } }));
  if (req.url?.startsWith('/tunnel')) {
    res.writeHead(200, { 'content-length': '10' });
    return res.end('0123456789');
  }
  let raw = '';
  for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  seen.push({ ...body, auth: req.headers.authorization });
  res.setHeader('content-type', 'application/json');
  if (body.url.includes('private')) return res.end(JSON.stringify({ status: 'error', error: { code: 'error.api.content.post.private' } }));
  if (body.url.includes('carousel'))
    return res.end(JSON.stringify({ status: 'picker', picker: [{ type: 'photo', url: `${base}tunnel/1.jpg` }, { type: 'photo', url: `${base}tunnel/2.jpg` }] }));
  res.end(JSON.stringify({ status: 'tunnel', url: `${base}tunnel?id=1`, filename: 'Mi video (720p).mp4' }));
});
before(() => new Promise<void>((r) => server.listen(0, '127.0.0.1', () => ((base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`), r()))));
after(() => { server.closeAllConnections(); server.close(); });

const provider = () => new CobaltProvider({ baseUrl: base, apiKey: 'k-1' });
const t = (url: string) => ({ url, platform: 'instagram' as const, label: 'Instagram' });
const ctx = async (maxBytes = 1e6) => ({ dir: await mkdtemp(path.join(os.tmpdir(), 'cobalt-')), signal: new AbortController().signal, maxBytes, onProgress() {} });

test('sin URL configurada no ofrece nada y se reporta no sano', async () => {
  const p = new CobaltProvider({});
  assert.deepEqual(p.capabilities('youtube'), []);
  assert.equal((await p.healthCheck()).ok, false);
});

test('salud e inspección contra la API', async () => {
  assert.deepEqual(await provider().healthCheck(), { ok: true, version: '11.0' });
  const info = await provider().inspect(t('https://instagram.com/reel/a'), new AbortController().signal);
  assert.equal(info.title, 'Mi video (720p)');
  assert.ok(info.options.video.includes('720'));
  const car = await provider().inspect(t('https://instagram.com/p/carousel'), new AbortController().signal);
  assert.equal(car.items, 2);
  assert.equal(car.options.image, true);
});

test('descarga traduciendo calidad y modo, con la llave de API', async () => {
  const c = await ctx();
  await provider().download({ url: 'https://youtu.be/a', platform: 'youtube', kind: 'audio', audioFormat: 'mp3' }, c);
  const last = seen.at(-1)!;
  assert.equal(last.downloadMode, 'audio');
  assert.equal(last.auth, 'Api-Key k-1');
  assert.deepEqual(await readdir(c.dir), ['Mi video (720p).mp4']);
  assert.equal(await readFile(path.join(c.dir, 'Mi video (720p).mp4'), 'utf8'), '0123456789');

  await provider().download({ url: 'https://youtu.be/a', platform: 'youtube', kind: 'video', quality: 'best' }, await ctx());
  assert.equal(seen.at(-1)!.videoQuality, 'max');
});

test('carrusel de imágenes baja cada foto', async () => {
  const c = await ctx();
  await provider().download({ url: 'https://instagram.com/p/carousel', platform: 'instagram', kind: 'image' }, c);
  assert.deepEqual((await readdir(c.dir)).sort(), ['01.jpg', '02.jpg']);
});

test('errores y límite de tamaño', async () => {
  await assert.rejects(provider().inspect(t('https://instagram.com/p/private'), new AbortController().signal), (e: DownloadError) => e.code === 'login_required');
  const c = await ctx(5);
  await assert.rejects(provider().download({ url: 'https://instagram.com/reel/a', platform: 'instagram', kind: 'video' }, c), (e: DownloadError) => e.code === 'too_large');
  assert.deepEqual(await readdir(c.dir), []);
});
