/**
 * The contract between the Downloader and the engines behind it.
 *
 * Everything above the router (API, UI, OS) speaks only these types. Engine
 * specifics (yt-dlp format ids, Cobalt statuses, gallery-dl messages) stay
 * inside each provider, so an engine can be swapped without touching the rest.
 */

export type Platform = 'youtube' | 'instagram' | 'tiktok' | 'x';

/** What the person wants to take away. */
export type MediaKind = 'video' | 'audio' | 'image';

/** Max height in pixels, or the best available. Never an engine format id. */
export type VideoQuality = 'best' | '2160' | '1440' | '1080' | '720' | '480' | '360';
export type AudioFormat = 'mp3' | 'm4a';

export const VIDEO_LADDER: VideoQuality[] = ['2160', '1440', '1080', '720', '480', '360'];

export interface DetectedUrl {
  /** Cleaned URL (tracking params removed). */
  url: string;
  platform: Platform;
  /** Human name of the source, e.g. "YouTube Shorts". */
  label: string;
}

/** Normalised description of what a URL holds. Same shape for every engine. */
export interface MediaInfo {
  platform: Platform;
  label: string;
  url: string;
  title: string;
  author?: string;
  durationSec?: number;
  thumbnail?: string;
  /** More than 1 for carousels and threads. */
  items: number;
  /** What can be asked for. Empty arrays mean that kind is not available. */
  options: { video: VideoQuality[]; audio: AudioFormat[]; image: boolean };
}

export interface DownloadRequest {
  url: string;
  platform: Platform;
  kind: MediaKind;
  quality?: VideoQuality;
  audioFormat?: AudioFormat;
}

export interface Progress {
  stage: 'downloading' | 'processing';
  percent?: number;
  bytes?: number;
  totalBytes?: number;
  /** Files finished so far (galleries). */
  items?: number;
}

export interface DownloadContext {
  /** Private temp folder for this job. The provider writes its files here and nowhere else. */
  dir: string;
  signal: AbortSignal;
  maxBytes: number;
  onProgress(p: Progress): void;
}

export interface ProviderHealth {
  ok: boolean;
  version?: string;
  detail?: string;
}

/**
 * One download engine. Providers are stateless: jobs, cancellation (via
 * AbortSignal), temp files and cleanup belong to the job manager.
 */
export interface DownloadProvider {
  readonly id: string;
  /** Kinds this engine can deliver for a platform ([] = not supported). */
  capabilities(platform: Platform): MediaKind[];
  healthCheck(): Promise<ProviderHealth>;
  /** Metadata + available options (getMetadata and getFormats in one call: engines resolve both at once). */
  inspect(target: DetectedUrl, signal: AbortSignal): Promise<MediaInfo>;
  /** Video, audio or images, depending on `req.kind`. Writes into `ctx.dir`. */
  download(req: DownloadRequest, ctx: DownloadContext): Promise<void>;
}

export type ErrorCode =
  | 'invalid_url'
  | 'unsupported'
  | 'login_required'
  | 'not_found'
  | 'blocked'
  | 'rate_limited'
  | 'too_large'
  | 'engine_unavailable'
  | 'engine_error'
  | 'cancelled'
  | 'timeout'
  | 'busy'
  | 'storage_full'
  | 'gone';

export class DownloadError extends Error {
  readonly code: ErrorCode;
  /** Raw engine output, for logs only. Never sent to the client. */
  readonly detail?: string;
  constructor(code: ErrorCode, message?: string, detail?: string) {
    super(message ?? code);
    this.name = 'DownloadError';
    this.code = code;
    this.detail = detail;
  }
}

/** Errors where trying another engine cannot help. */
export const FINAL_ERRORS: ReadonlySet<ErrorCode> = new Set(['cancelled', 'too_large', 'timeout', 'storage_full', 'invalid_url']);

export function asDownloadError(err: unknown): DownloadError {
  if (err instanceof DownloadError) return err;
  if (err instanceof Error && err.name === 'AbortError') return new DownloadError('cancelled');
  return new DownloadError('engine_error', err instanceof Error ? err.message : String(err));
}
