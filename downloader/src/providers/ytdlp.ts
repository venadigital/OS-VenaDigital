import { run } from '../core/exec.ts';
import { listOutputs } from '../core/files.ts';
import {
  DownloadError,
  VIDEO_LADDER,
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

export interface YtDlpOptions {
  bin: string;
  ffmpeg?: string;
  /** JS runtime for YouTube challenges. Node ≥22 works; yt-dlp only enables deno by default. */
  jsRuntime?: string;
  cookiesFile?: string;
  cookiesFromBrowser?: string;
}

/** Turns yt-dlp's error text into our codes. Order matters: most specific first. */
export function classifyYtDlp(stderr: string): ErrorCode {
  const text = stderr.split('\n').filter((l) => l.includes('ERROR')).join('\n') || stderr;
  if (/IP address is blocked|geo.?restrict|not available in your country/i.test(text)) return 'blocked';
  if (/HTTP Error 429|rate.?limit/i.test(text) && !/login required/i.test(text)) return 'rate_limited';
  if (/sign in|log ?in|login|cookies|private|members.only|age.?restrict|confirm your age/i.test(text)) return 'login_required';
  if (/no video formats|there(?:'s| is) no video|unsupported url|no media found|not a video/i.test(text)) return 'unsupported';
  if (/unavailable|not found|404|does not exist|has been removed|deleted/i.test(text)) return 'not_found';
  return 'engine_error';
}

interface YtFormat {
  vcodec?: string;
  acodec?: string;
  height?: number;
}
interface YtInfo {
  _type?: string;
  title?: string;
  description?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  formats?: YtFormat[];
  entries?: YtInfo[];
}

const GENERIC_TITLE = /^(video|post|reel) by |^tiktok video #|^instagram (video|post)/i;

export class YtDlpProvider implements DownloadProvider {
  readonly id = 'yt-dlp';
  private readonly opts: YtDlpOptions;

  constructor(opts: YtDlpOptions) {
    this.opts = opts;
  }

  capabilities(_platform: Platform): MediaKind[] {
    return ['video', 'audio'];
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const v = await run(this.opts.bin, ['--version'], { timeoutMs: 15_000 });
      if (v.code !== 0) return { ok: false, detail: v.stderr.trim().slice(0, 200) };
      const ff = await run(this.opts.ffmpeg ?? 'ffmpeg', ['-version'], { timeoutMs: 10_000 }).catch(() => null);
      if (!ff || ff.code !== 0) return { ok: false, version: v.stdout.trim(), detail: 'ffmpeg no está disponible' };
      return { ok: true, version: v.stdout.trim() };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Flags shared by every call: ignore stray user configs so behaviour is reproducible. */
  private base(platform: Platform): string[] {
    const args = ['--ignore-config', '--color', 'never', '--socket-timeout', '20', '--no-mtime'];
    if (this.opts.jsRuntime) args.push('--js-runtimes', this.opts.jsRuntime);
    if (this.opts.ffmpeg) args.push('--ffmpeg-location', this.opts.ffmpeg);
    if (this.opts.cookiesFile) args.push('--cookies', this.opts.cookiesFile);
    else if (this.opts.cookiesFromBrowser) args.push('--cookies-from-browser', this.opts.cookiesFromBrowser);
    // A YouTube link with &list= means "this video", never the whole playlist.
    // On Instagram/X/TikTok a "playlist" is the carousel of one post, which we do want.
    args.push(platform === 'youtube' ? '--no-playlist' : '--yes-playlist');
    return args;
  }

  async inspect(target: DetectedUrl, signal: AbortSignal): Promise<MediaInfo> {
    const res = await run(this.opts.bin, [...this.base(target.platform), '-J', '--', target.url], { signal, timeoutMs: 60_000 });
    if (res.code !== 0) throw new DownloadError(classifyYtDlp(res.stderr), undefined, res.stderr.slice(-2000));
    let info: YtInfo;
    try {
      info = JSON.parse(res.stdout) as YtInfo;
    } catch {
      throw new DownloadError('engine_error', 'Respuesta ilegible de yt-dlp');
    }
    const entries = info._type === 'playlist' ? (info.entries ?? []).filter(Boolean) : [info];
    const formats = entries.flatMap((e) => e.formats ?? []);
    const videos = formats.filter((f) => f.vcodec && f.vcodec !== 'none');
    if (!videos.length) throw new DownloadError('unsupported', 'Sin video en este enlace');
    // An unknown acodec (undefined) may still carry sound; only an explicit 'none' rules it out.
    const hasAudio = formats.some((f) => f.acodec !== 'none');

    const top = Math.max(0, ...videos.map((f) => f.height ?? 0));
    const ladder = top ? VIDEO_LADDER.filter((q) => Number(q) <= top) : [];
    const first = entries[0] ?? info;
    const rawTitle = info.title || first.title || '';
    const desc = (info.description || first.description || '').split('\n')[0].trim();
    const duration = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);

    return {
      platform: target.platform,
      label: target.label,
      url: target.url,
      title: (GENERIC_TITLE.test(rawTitle) && desc ? desc : rawTitle || desc || 'Sin título').slice(0, 140),
      author: info.uploader || info.channel || first.uploader || first.channel,
      durationSec: duration ? Math.round(duration) : undefined,
      thumbnail: info.thumbnail || first.thumbnail,
      items: entries.length || 1,
      options: { video: ['best', ...ladder], audio: hasAudio ? ['mp3', 'm4a'] : [], image: false },
    };
  }

  /** Format choice in yt-dlp terms. Kept here so nothing above knows about format ids. */
  static selectionArgs(req: DownloadRequest): string[] {
    if (req.kind === 'audio') {
      const fmt = req.audioFormat ?? 'mp3';
      return ['-f', fmt === 'm4a' ? 'ba[ext=m4a]/ba/b' : 'ba/b', '-x', '--audio-format', fmt, '--audio-quality', '0'];
    }
    // Highest resolution up to the cap first, then h264/aac so the mp4 plays on iPhone and QuickTime.
    const res = req.quality && req.quality !== 'best' ? `res:${req.quality}` : 'res';
    return ['-f', 'bv*+ba/b', '-S', `${res},vcodec:h264,acodec:aac`, '--merge-output-format', 'mp4', '--remux-video', 'mp4'];
  }

  async download(req: DownloadRequest, ctx: DownloadContext): Promise<void> {
    if (req.kind === 'image') throw new DownloadError('unsupported');
    const args = [
      ...this.base(req.platform),
      ...YtDlpProvider.selectionArgs(req),
      '--max-filesize', String(ctx.maxBytes),
      // -P keeps the temp path out of the name template (so long paths never truncate the name).
      '-P', ctx.dir,
      '-o', '%(title).80B [%(id)s].%(ext)s',
      '--newline', '--progress',
      '--progress-template', 'download:PROGRESS %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
      '--', req.url,
    ];
    const res = await run(this.opts.bin, args, {
      signal: ctx.signal,
      onLine: (line) => {
        const m = /^PROGRESS (\d+) (\S+) (\S+)/.exec(line);
        if (m) {
          const bytes = Number(m[1]);
          const total = Number(m[2]) || Number(m[3]) || undefined;
          ctx.onProgress({ stage: 'downloading', bytes, totalBytes: total, percent: total ? Math.min(99, (bytes / total) * 100) : undefined });
        } else if (/^\[(Merger|ExtractAudio|VideoRemuxer|FixupM3u8|VideoConvertor)\]/.test(line)) {
          ctx.onProgress({ stage: 'processing' });
        }
      },
    });
    const all = res.stdout + res.stderr;
    if (/larger than max-filesize|File is larger than/i.test(all)) throw new DownloadError('too_large');
    if (res.code !== 0) throw new DownloadError(classifyYtDlp(res.stderr), undefined, res.stderr.slice(-2000));
    if (!(await listOutputs(ctx.dir)).length) throw new DownloadError('engine_error', 'yt-dlp no produjo ningún archivo', all.slice(-2000));
  }
}
