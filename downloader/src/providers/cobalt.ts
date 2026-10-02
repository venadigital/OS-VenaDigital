import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { safeName } from '../core/files.ts';
import {
  DownloadError,
  type DetectedUrl,
  type DownloadContext,
  type DownloadProvider,
  type DownloadRequest,
  type ErrorCode,
  type MediaInfo,
  type MediaKind,
  type Platform,
  type ProviderHealth,
} from '../core/types.ts';

export interface CobaltOptions {
  /** Base URL of a self-hosted instance, e.g. http://localhost:9000/. There is no public API to use. */
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

type CobaltResponse =
  | { status: 'tunnel' | 'redirect'; url: string; filename: string }
  | { status: 'picker'; picker: { type: 'photo' | 'video' | 'gif'; url: string; thumb?: string }[]; audio?: string; audioFilename?: string }
  | { status: 'local-processing'; [k: string]: unknown }
  | { status: 'error'; error: { code: string; context?: unknown } };

export function classifyCobalt(code: string): ErrorCode {
  if (/link\.(invalid|unsupported)|service\.unsupported/.test(code)) return 'unsupported';
  if (/rate_exceeded|fetch\.rate/.test(code)) return 'rate_limited';
  if (/private|age|login|auth\.(jwt|key)\.missing/.test(code)) return 'login_required';
  if (/content\.(video|post)\.(unavailable|deleted)|empty|not_found/.test(code)) return 'not_found';
  if (/region|geo/.test(code)) return 'blocked';
  if (/too_long|file_size/.test(code)) return 'too_large';
  if (/auth\./.test(code)) return 'engine_unavailable';
  return 'engine_error';
}

/**
 * Talks to a self-hosted Cobalt instance over its HTTP API. Running Cobalt as
 * a separate container keeps its AGPL code out of this codebase.
 */
export class CobaltProvider implements DownloadProvider {
  readonly id = 'cobalt';
  private readonly opts: CobaltOptions;
  private readonly fetch: typeof fetch;

  constructor(opts: CobaltOptions) {
    this.opts = opts;
    this.fetch = opts.fetch ?? fetch;
  }

  capabilities(_platform: Platform): MediaKind[] {
    return this.opts.baseUrl ? ['video', 'audio', 'image'] : [];
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.opts.baseUrl) return { ok: false, detail: 'Sin configurar (COBALT_URL)' };
    try {
      const res = await this.fetch(this.opts.baseUrl, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
      const body = (await res.json()) as { cobalt?: { version?: string } };
      return res.ok ? { ok: true, version: body.cobalt?.version } : { ok: false, detail: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  private async ask(body: Record<string, unknown>, signal: AbortSignal): Promise<CobaltResponse> {
    if (!this.opts.baseUrl) throw new DownloadError('engine_unavailable');
    const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
    if (this.opts.apiKey) headers.authorization = `Api-Key ${this.opts.apiKey}`;
    let res: Response;
    try {
      res = await this.fetch(this.opts.baseUrl, { method: 'POST', headers, body: JSON.stringify({ localProcessing: 'disabled', ...body }), signal });
    } catch (err) {
      if (signal.aborted) throw new DownloadError('cancelled');
      throw new DownloadError('engine_unavailable', 'Cobalt no responde', String(err));
    }
    const data = (await res.json().catch(() => null)) as CobaltResponse | null;
    if (!data) throw new DownloadError('engine_error', `Cobalt respondió HTTP ${res.status}`);
    if (data.status === 'error') throw new DownloadError(classifyCobalt(data.error.code), undefined, data.error.code);
    if (data.status === 'local-processing') throw new DownloadError('engine_error', 'Cobalt pidió procesamiento local');
    return data;
  }

  async inspect(target: DetectedUrl, signal: AbortSignal): Promise<MediaInfo> {
    const data = await this.ask({ url: target.url, downloadMode: 'auto' }, signal);
    // Cobalt does not expose metadata, only a filename or a list of items.
    const base: Omit<MediaInfo, 'title' | 'items' | 'options'> = { platform: target.platform, label: target.label, url: target.url };
    if (data.status === 'picker') {
      const photos = data.picker.filter((p) => p.type === 'photo');
      const videos = data.picker.filter((p) => p.type !== 'photo');
      return {
        ...base,
        title: 'Publicación',
        thumbnail: data.picker[0]?.thumb ?? photos[0]?.url,
        items: data.picker.length,
        options: { video: videos.length ? ['best'] : [], audio: data.audio ? ['mp3'] : [], image: photos.length > 0 },
      };
    }
    if (data.status !== 'tunnel' && data.status !== 'redirect') throw new DownloadError('engine_error');
    const isImage = /\.(jpe?g|png|webp|gif)$/i.test(data.filename);
    return {
      ...base,
      title: data.filename.replace(/\.[a-z0-9]+$/i, ''),
      items: 1,
      options: isImage
        ? { video: [], audio: [], image: true }
        : { video: ['best', '1080', '720', '480', '360'], audio: ['mp3'], image: false },
    };
  }

  async download(req: DownloadRequest, ctx: DownloadContext): Promise<void> {
    const data = await this.ask(
      {
        url: req.url,
        downloadMode: req.kind === 'audio' ? 'audio' : 'auto',
        videoQuality: !req.quality || req.quality === 'best' ? 'max' : req.quality,
        audioFormat: req.audioFormat === 'm4a' ? 'best' : 'mp3',
        filenameStyle: 'pretty',
      },
      ctx.signal,
    );
    if (data.status === 'tunnel' || data.status === 'redirect') {
      await this.save(data.url, safeName(data.filename), ctx);
      return;
    }
    if (data.status !== 'picker') throw new DownloadError('engine_error');
    const wanted = data.picker.filter((p) => (req.kind === 'image' ? p.type === 'photo' : p.type !== 'photo'));
    if (!wanted.length) throw new DownloadError('unsupported');
    for (const [i, item] of wanted.entries()) {
      const ext = path.extname(new URL(item.url).pathname) || (item.type === 'photo' ? '.jpg' : '.mp4');
      await this.save(item.url, `${String(i + 1).padStart(2, '0')}${ext}`, ctx);
    }
  }

  /** Streams one file to disk with a hard size cap. */
  private async save(url: string, name: string, ctx: DownloadContext): Promise<void> {
    const res = await this.fetch(url, { signal: ctx.signal }).catch((err) => {
      throw ctx.signal.aborted ? new DownloadError('cancelled') : new DownloadError('engine_error', 'Descarga interrumpida', String(err));
    });
    if (!res.ok || !res.body) throw new DownloadError('engine_error', `HTTP ${res.status} al bajar el archivo`);
    const total = Number(res.headers.get('content-length') ?? res.headers.get('estimated-content-length')) || undefined;
    if (total && total > ctx.maxBytes) throw new DownloadError('too_large');
    const file = path.join(ctx.dir, name);
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, done) {
        bytes += chunk.length;
        if (bytes > ctx.maxBytes) return done(new DownloadError('too_large'));
        ctx.onProgress({ stage: 'downloading', bytes, totalBytes: total, percent: total ? Math.min(99, (bytes / total) * 100) : undefined });
        done(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), meter, createWriteStream(file), { signal: ctx.signal });
    } catch (err) {
      await unlink(file).catch(() => {});
      if (err instanceof DownloadError) throw err;
      throw ctx.signal.aborted ? new DownloadError('cancelled') : new DownloadError('engine_error', 'Descarga interrumpida', String(err));
    }
  }
}
