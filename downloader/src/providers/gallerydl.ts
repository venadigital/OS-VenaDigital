import { run } from '../core/exec.ts';
import { listOutputs } from '../core/files.ts';
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

export interface GalleryDlOptions {
  bin: string;
  cookiesFile?: string;
  cookiesFromBrowser?: string;
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'];

export function classifyGalleryDl(text: string): ErrorCode {
  if (/login|log in|authenticat|cookies|private/i.test(text)) return 'login_required';
  if (/429|rate.?limit/i.test(text)) return 'rate_limited';
  if (/unsupported url|no suitable extractor/i.test(text)) return 'unsupported';
  if (/404|not found|does not exist|unavailable|deleted|suspended/i.test(text)) return 'not_found';
  return 'engine_error';
}

/** gallery-dl `-j` emits [type, ...] messages: 2 = directory metadata, 3 = file url + metadata, -1 = error. */
type Message = [number, ...unknown[]];
type Meta = Record<string, unknown>;

/**
 * Images from posts and carousels (Instagram, X, TikTok photo posts), which
 * yt-dlp does not handle. Video stays with yt-dlp/Cobalt.
 */
export class GalleryDlProvider implements DownloadProvider {
  readonly id = 'gallery-dl';
  private readonly opts: GalleryDlOptions;

  constructor(opts: GalleryDlOptions) {
    this.opts = opts;
  }

  capabilities(platform: Platform): MediaKind[] {
    return platform === 'youtube' ? [] : ['image'];
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const v = await run(this.opts.bin, ['--version'], { timeoutMs: 15_000 });
      return v.code === 0 ? { ok: true, version: v.stdout.trim() } : { ok: false, detail: v.stderr.trim().slice(0, 200) };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  private base(): string[] {
    const args = ['--config-ignore', '--no-colors'];
    if (this.opts.cookiesFile) args.push('--cookies', this.opts.cookiesFile);
    else if (this.opts.cookiesFromBrowser) args.push('--cookies-from-browser', this.opts.cookiesFromBrowser);
    return args;
  }

  async inspect(target: DetectedUrl, signal: AbortSignal): Promise<MediaInfo> {
    const res = await run(this.opts.bin, [...this.base(), '-j', '--', target.url], { signal, timeoutMs: 60_000 });
    let messages: Message[] = [];
    try {
      messages = JSON.parse(res.stdout) as Message[];
    } catch {
      throw new DownloadError(classifyGalleryDl(res.stderr), undefined, res.stderr.slice(-2000));
    }
    const failure = messages.find((m) => m[0] === -1)?.[1] as { message?: string } | undefined;
    if (failure) throw new DownloadError(classifyGalleryDl(failure.message ?? ''), undefined, failure.message);

    const files = messages.filter((m) => m[0] === 3).map((m) => ({ url: String(m[1]), meta: (m[2] ?? {}) as Meta }));
    const images = files.filter((f) => IMAGE_EXT.includes(String(f.meta.extension ?? '').toLowerCase()));
    if (!images.length) throw new DownloadError('unsupported', 'Sin imágenes en este enlace');

    const meta = images[0].meta;
    const author = (meta.author as Meta | undefined)?.name ?? meta.username ?? meta.fullname ?? meta.uploader;
    const text = String(meta.description ?? meta.content ?? meta.title ?? '').split('\n')[0].trim();
    return {
      platform: target.platform,
      label: target.label,
      url: target.url,
      title: (text || 'Publicación con imágenes').slice(0, 140),
      author: author ? String(author) : undefined,
      thumbnail: images[0].url,
      items: images.length,
      options: { video: [], audio: [], image: true },
    };
  }

  async download(req: DownloadRequest, ctx: DownloadContext): Promise<void> {
    if (req.kind !== 'image') throw new DownloadError('unsupported');
    let count = 0;
    const res = await run(
      this.opts.bin,
      [
        ...this.base(),
        '-D', ctx.dir,
        '--filesize-max', `${Math.floor(ctx.maxBytes / 1024 / 1024)}M`,
        '--filter', `extension in (${IMAGE_EXT.map((e) => `'${e}'`).join(', ')})`,
        '--', req.url,
      ],
      {
        signal: ctx.signal,
        // gallery-dl prints one path per finished file.
        onLine: (line) => {
          if (line.startsWith(ctx.dir) || line.startsWith('# ')) ctx.onProgress({ stage: 'downloading', items: ++count });
        },
      },
    );
    if (res.code !== 0 && !(await listOutputs(ctx.dir)).length) {
      throw new DownloadError(classifyGalleryDl(res.stderr), undefined, res.stderr.slice(-2000));
    }
    if (!(await listOutputs(ctx.dir)).length) throw new DownloadError('engine_error', 'gallery-dl no produjo ningún archivo', res.stderr.slice(-2000));
  }
}
