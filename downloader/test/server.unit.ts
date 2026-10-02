import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { loadConfig } from '../src/core/config.ts';
import { buildApp } from '../src/server.ts';

const PORT = 43991;
let server: http.Server;
let stop: () => Promise<void>;
before(async () => {
  const config = { ...loadConfig(), port: PORT, tmpRoot: path.join(await mkdtemp(path.join(os.tmpdir(), 't-')), 'vena-downloader') };
  config.engines = { ...config.engines, ytdlp: '/nonexistent/yt-dlp', gallerydl: '/nonexistent/gallery-dl', cobaltUrl: undefined };
  const app = buildApp(config);
  await app.jobs.start(60_000);
  stop = () => app.jobs.stop();
  server = http.createServer((req, res) => void app.handle(req, res));
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
});
after(async () => {
  server.closeAllConnections();
  server.close();
  await stop();
});

function call(pathname: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method: init.method ?? 'GET', headers: init.headers }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

test('el OS puede llamar y recibe CORS', async () => {
  const r = await call('/api/detect', { method: 'POST', headers: { origin: 'https://os.venadigital.com.co', 'content-type': 'application/json' }, body: '{"url":"https://youtu.be/abc"}' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['access-control-allow-origin'], 'https://os.venadigital.com.co');
});

test('otro sitio abierto en el navegador queda bloqueado', async () => {
  const r = await call('/api/jobs', { method: 'POST', headers: { origin: 'https://sitio-cualquiera.com', 'content-type': 'application/json' }, body: '{"url":"https://youtu.be/abc"}' });
  assert.equal(r.status, 403);
});

test('sin JSON no se aceptan POST (evita formularios de otros sitios)', async () => {
  const r = await call('/api/jobs', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"url":"https://youtu.be/abc"}' });
  assert.equal(r.status, 415);
});

test('rechaza hosts ajenos (DNS rebinding)', async () => {
  const r = await call('/api/health', { headers: { host: 'evil.example:43991' } });
  assert.equal(r.status, 403);
});

test('responde la consulta previa de red privada de Chrome', async () => {
  const r = await call('/api/inspect', {
    method: 'OPTIONS',
    headers: { origin: 'https://os.venadigital.com.co', 'access-control-request-method': 'POST', 'access-control-request-private-network': 'true' },
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-private-network'], 'true');
});

test('sin motores responde con un error legible', async () => {
  const r = await call('/api/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"url":"https://youtu.be/abc"}' });
  assert.equal(r.status, 503);
  assert.match(JSON.parse(r.body).error.message, /no está disponible/);
});
