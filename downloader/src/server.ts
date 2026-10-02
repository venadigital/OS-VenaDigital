import { createReadStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ensurePlayable } from './core/compat.ts';
import { loadConfig, type Config } from './core/config.ts';
import { JobManager, type JobView } from './core/jobs.ts';
import { detectUrl } from './core/platforms.ts';
import { Router } from './core/router.ts';
import { TempStore } from './core/storage.ts';
import { DownloadError, asDownloadError, type AudioFormat, type ErrorCode, type MediaInfo, type MediaKind, type VideoQuality } from './core/types.ts';
import { startEngineUpdates } from './core/updater.ts';
import { CobaltProvider } from './providers/cobalt.ts';
import { GalleryDlProvider } from './providers/gallerydl.ts';
import { YtDlpProvider } from './providers/ytdlp.ts';

/** What the person reads. Engine names and raw errors never leave the server. */
export const MESSAGES: Record<ErrorCode, string> = {
  invalid_url: 'Eso no parece un enlace.',
  unsupported: 'Ese enlace no es de YouTube, Instagram, TikTok o X, o no tiene nada descargable.',
  login_required: 'Este contenido pide iniciar sesión (privado, con restricción de edad o bloqueado sin cuenta).',
  not_found: 'No se encontró el contenido. Puede que se haya borrado.',
  blocked: 'La plataforma bloqueó el acceso desde esta conexión o país.',
  rate_limited: 'La plataforma está limitando las peticiones. Prueba en unos minutos.',
  too_large: 'El archivo supera el tamaño máximo permitido.',
  engine_unavailable: 'El servicio de descarga no está disponible ahora.',
  engine_error: 'No se pudo procesar este enlace.',
  cancelled: 'Descarga cancelada.',
  timeout: 'La descarga tardó demasiado y se detuvo.',
  busy: 'Hay demasiadas descargas en cola. Espera a que terminen.',
  storage_full: 'No hay espacio temporal libre. Espera a que se limpien las descargas anteriores.',
  gone: 'Este archivo ya se borró. Vuelve a descargarlo.',
};

const STATUS: Partial<Record<ErrorCode, number>> = {
  invalid_url: 400, unsupported: 422, login_required: 422, not_found: 404, blocked: 422, rate_limited: 429,
  too_large: 413, engine_unavailable: 503, busy: 429, storage_full: 507, gone: 410, timeout: 504,
};

const QUALITIES: VideoQuality[] = ['best', '2160', '1440', '1080', '720', '480', '360'];
const KINDS: MediaKind[] = ['video', 'audio', 'image'];
const AUDIO: AudioFormat[] = ['mp3', 'm4a'];
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.opus': 'audio/ogg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
};

/**
 * Thumbnails go through the server: platform CDNs often refuse hotlinking.
 * Only URLs that an engine returned are proxied (no open proxy).
 */
class ThumbCache {
  private readonly map = new Map<string, { url: string; at: number }>();
  register(url?: string): string | undefined {
    if (!url || !/^https:\/\//.test(url)) return undefined;
    const id = randomUUID();
    this.map.set(id, { url, at: Date.now() });
    for (const [k, v] of this.map) if (Date.now() - v.at > 30 * 60_000) this.map.delete(k);
    return `/api/thumbnails/${id}`;
  }
  get(id: string): string | undefined {
    return this.map.get(id)?.url;
  }
}

export function buildApp(config: Config) {
  const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  const { engines } = config;
  const cookies = { cookiesFile: engines.cookiesFile, cookiesFromBrowser: engines.cookiesFromBrowser };
  const router = new Router(
    [
      new YtDlpProvider({ bin: engines.ytdlp, ffmpeg: engines.ffmpeg, jsRuntime: engines.jsRuntime, ...cookies }),
      new GalleryDlProvider({ bin: engines.gallerydl, ...cookies }),
      new CobaltProvider({ baseUrl: engines.cobaltUrl, apiKey: engines.cobaltKey }),
    ],
    { routes: config.routes, log },
  );
  const ffmpeg = engines.ffmpeg ?? 'ffmpeg';
  const ffprobe = engines.ffmpeg ? path.join(path.dirname(engines.ffmpeg), 'ffprobe') : 'ffprobe';
  const jobs = new JobManager(router, new TempStore(config.tmpRoot), config.policy, {
    log,
    postProcess: (req, dir, ctx) => (req.kind === 'video' ? ensurePlayable(dir, ctx, { ffmpeg, ffprobe }) : Promise.resolve()),
  });
  const thumbs = new ThumbCache();

  /** Jobs carry a code; the API adds the wording so every client shows the same text. */
  const withMessage = (job: JobView) => (job.error ? { ...job, message: MESSAGES[job.error] } : job);
  function send(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  function sendError(res: http.ServerResponse, err: unknown) {
    const e = asDownloadError(err);
    if (e.code === 'engine_error' && e.detail) log(`error: ${e.detail.slice(0, 300)}`);
    send(res, STATUS[e.code] ?? 500, { error: { code: e.code, message: MESSAGES[e.code] } });
  }
  async function body(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 16_384) throw new DownloadError('invalid_url');
    }
    try {
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      throw new DownloadError('invalid_url');
    }
  }
  function authorized(req: http.IncomingMessage): boolean {
    if (!config.token) return true;
    const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    const want = Buffer.from(config.token);
    return given.length === want.length && timingSafeEqual(given, want);
  }
  /** Aborts engine work if the client goes away. */
  function clientSignal(req: http.IncomingMessage, res: http.ServerResponse, ms: number): AbortSignal {
    const ctrl = new AbortController();
    res.on('close', () => !res.writableFinished && ctrl.abort());
    return AbortSignal.any([ctrl.signal, AbortSignal.timeout(ms)]);
  }

  const allowedHosts = new Set([`127.0.0.1:${config.port}`, `localhost:${config.port}`]);

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const origin = req.headers.origin;

    // Only the OS may drive this service from a browser. Other sites open in
    // Chrome could otherwise send requests to 127.0.0.1 behind your back.
    if (!allowedHosts.has(req.headers.host ?? '')) return send(res, 403, { error: { code: 'forbidden', message: 'Host no permitido' } });
    if (origin && !config.corsOrigins.includes(origin)) return send(res, 403, { error: { code: 'forbidden', message: 'Origen no permitido' } });
    if (origin) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('access-control-expose-headers', 'content-disposition');
      res.setHeader('vary', 'origin');
    }
    if (req.method === 'OPTIONS') {
      // Chrome asks before a public site (os.venadigital.com.co) talks to this Mac.
      if (req.headers['access-control-request-private-network']) res.setHeader('access-control-allow-private-network', 'true');
      return void res.writeHead(204).end();
    }
    // JSON only: forces a CORS preflight, so a foreign page can't fire jobs with a plain form post.
    if (req.method === 'POST' && !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      return send(res, 415, { error: { code: 'unsupported_media', message: 'Se espera JSON' } });
    }

    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, { service: 'vena-downloader', ok: true });
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: { code: 'not_found', message: 'Ruta desconocida' } });
    if (!authorized(req)) return send(res, 401, { error: { code: 'unauthorized', message: 'Falta el token del servicio' } });

    const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
    const [, resource, id, sub, index] = parts;

    try {
      if (req.method === 'GET' && resource === 'health') {
        // Engine detail is for whoever runs the service, not for the UI.
        const engines = await router.healthReport(url.searchParams.has('fresh'));
        return send(res, 200, { ok: engines.some((e) => e.ok), engines });
      }

      if (req.method === 'POST' && resource === 'detect') {
        const { url: input } = await body(req);
        const d = detectUrl(String(input ?? ''));
        return send(res, 200, { platform: d.platform, label: d.label, url: d.url });
      }

      if (req.method === 'POST' && resource === 'inspect') {
        const { url: input } = await body(req);
        const target = detectUrl(String(input ?? ''));
        const info: MediaInfo = await router.inspect(target, clientSignal(req, res, 75_000));
        return send(res, 200, { ...info, thumbnail: thumbs.register(info.thumbnail) });
      }

      if (resource === 'thumbnails' && req.method === 'GET' && id) {
        const target = thumbs.get(id);
        if (!target) return send(res, 404, { error: { code: 'gone', message: MESSAGES.gone } });
        const up = await fetch(target, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Mozilla/5.0' } });
        const type = up.headers.get('content-type') ?? '';
        if (!up.ok || !type.startsWith('image/')) return send(res, 502, { error: { code: 'engine_error', message: 'Sin miniatura' } });
        const buf = Buffer.from(await up.arrayBuffer());
        if (buf.length > 5 * 1024 * 1024) return send(res, 502, { error: { code: 'too_large', message: 'Miniatura demasiado grande' } });
        res.writeHead(200, { 'content-type': type, 'cache-control': 'private, max-age=1800' });
        return void res.end(buf);
      }

      if (resource === 'jobs') {
        if (req.method === 'POST' && !id) {
          const b = await body(req);
          const target = detectUrl(String(b.url ?? ''));
          const kind = KINDS.includes(b.kind as MediaKind) ? (b.kind as MediaKind) : 'video';
          const quality = QUALITIES.includes(b.quality as VideoQuality) ? (b.quality as VideoQuality) : 'best';
          const audioFormat = AUDIO.includes(b.audioFormat as AudioFormat) ? (b.audioFormat as AudioFormat) : 'mp3';
          const job = await jobs.create({ url: target.url, platform: target.platform, kind, quality, audioFormat });
          return send(res, 202, withMessage(job));
        }
        if (!id) return send(res, 404, { error: { code: 'not_found', message: 'Ruta desconocida' } });

        if (req.method === 'GET' && !sub) {
          const job = jobs.get(id);
          return job ? send(res, 200, withMessage(job)) : send(res, 410, { error: { code: 'gone', message: MESSAGES.gone } });
        }
        if (req.method === 'DELETE' && !sub) {
          const job = await jobs.cancel(id);
          return job ? send(res, 200, withMessage(job)) : send(res, 410, { error: { code: 'gone', message: MESSAGES.gone } });
        }
        if (req.method === 'GET' && sub === 'files') {
          const n = Number(index ?? 0);
          const found = jobs.fileFor(id, Number.isInteger(n) ? n : -1);
          if (typeof found === 'string') return send(res, STATUS[found] ?? 404, { error: { code: found, message: MESSAGES[found] ?? 'No disponible' } });
          const { dir, file } = found;
          const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
          res.writeHead(200, {
            'content-type': MIME[path.extname(file.name).toLowerCase()] ?? 'application/octet-stream',
            'content-length': file.size,
            'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            'cache-control': 'no-store',
          });
          const stream = createReadStream(path.join(dir, file.name));
          stream.pipe(res);
          // 'finish' = every byte handed to the OS socket → the cleanup grace starts.
          res.on('finish', () => jobs.markDelivered(id, n));
          stream.on('error', () => res.destroy());
          return;
        }
      }
      send(res, 404, { error: { code: 'not_found', message: 'Ruta desconocida' } });
    } catch (err) {
      if (!res.headersSent) sendError(res, err);
      else res.destroy();
    }
  }

  return { handle, jobs, router };
}

async function main() {
  const config = loadConfig();
  const app = buildApp(config);
  await app.jobs.start(config.sweepEveryMs);
  void app.router.healthReport(); // warm the cache so the OS gets an instant answer
  if (config.engines.uv) {
    startEngineUpdates({
      uvBin: config.engines.uv,
      enginesDir: config.engines.enginesDir,
      everyDays: config.engines.autoUpdateDays,
      isIdle: () => app.jobs.isIdle(),
      onUpdated: () => app.router.resetHealth(),
      log: (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`),
    });
  }
  const server = http.createServer((req, res) => void app.handle(req, res));
  server.listen(config.port, config.host, () => {
    console.log(`Vena Downloader en http://${config.host}:${config.port}  ·  temporales en ${config.tmpRoot}`);
  });
  const shutdown = async () => {
    server.close();
    await app.jobs.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
