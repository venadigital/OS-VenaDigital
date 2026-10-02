import { emptyDir } from './files.ts';
import {
  DownloadError,
  FINAL_ERRORS,
  asDownloadError,
  type DetectedUrl,
  type DownloadContext,
  type DownloadProvider,
  type DownloadRequest,
  type MediaInfo,
  type MediaKind,
  type Platform,
  type ProviderHealth,
} from './types.ts';

/** Engine order per platform. Configurable (env ROUTES) so engines can be swapped without code changes. */
export type Routes = Record<Platform, string[]>;

export const DEFAULT_ROUTES: Routes = {
  youtube: ['yt-dlp', 'cobalt'],
  instagram: ['yt-dlp', 'gallery-dl', 'cobalt'],
  tiktok: ['yt-dlp', 'gallery-dl', 'cobalt'],
  x: ['yt-dlp', 'gallery-dl', 'cobalt'],
};

/** "youtube=yt-dlp,cobalt;x=cobalt,yt-dlp" → partial routes over the defaults. */
export function parseRoutes(spec: string | undefined, base: Routes = DEFAULT_ROUTES): Routes {
  const routes: Routes = { ...base };
  for (const part of (spec ?? '').split(';')) {
    const [platform, list] = part.split('=').map((s) => s.trim());
    if (platform && list && platform in routes) routes[platform as Platform] = list.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return routes;
}

/** Codes that say more than "the engine broke"; preferred when every engine fails. */
const RANK: Record<string, number> = { login_required: 6, blocked: 5, not_found: 4, rate_limited: 3, unsupported: 2, engine_unavailable: 1 };

export interface Attempt {
  engine: string;
  code: string;
  detail?: string;
}

/**
 * Picks the engine for each request: route order for the platform, filtered by
 * capability and health, with fallback to the next engine on failure.
 * Callers never learn which engine answered (only logs do).
 */
export class Router {
  private readonly providers: Map<string, DownloadProvider>;
  private readonly routes: Routes;
  private readonly healthTtlMs: number;
  private readonly health = new Map<string, { at: number; value: ProviderHealth }>();
  private readonly log: (msg: string) => void;

  constructor(providers: DownloadProvider[], opts: { routes?: Routes; healthTtlMs?: number; log?: (msg: string) => void } = {}) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
    this.routes = opts.routes ?? DEFAULT_ROUTES;
    this.healthTtlMs = opts.healthTtlMs ?? 5 * 60_000;
    this.log = opts.log ?? (() => {});
  }

  async healthOf(p: DownloadProvider, fresh = false): Promise<ProviderHealth> {
    const cached = this.health.get(p.id);
    if (!fresh && cached && Date.now() - cached.at < this.healthTtlMs) return cached.value;
    const value = await p.healthCheck().catch((err) => ({ ok: false, detail: String(err) }));
    this.health.set(p.id, { at: Date.now(), value });
    return value;
  }

  /** Forget cached health (after engines were updated). */
  resetHealth(): void {
    this.health.clear();
  }

  /** Cached per engine (5 min) unless `fresh`; checking spawns each engine, which takes a second or two. */
  async healthReport(fresh = false): Promise<({ id: string } & ProviderHealth)[]> {
    return Promise.all([...this.providers.values()].map(async (p) => ({ id: p.id, ...(await this.healthOf(p, fresh)) })));
  }

  /** Healthy engines that can serve this platform (and kind), in route order. */
  async candidates(platform: Platform, kind?: MediaKind): Promise<DownloadProvider[]> {
    const listed = this.routes[platform].map((id) => this.providers.get(id)).filter((p): p is DownloadProvider => Boolean(p));
    const able = listed.filter((p) => {
      const caps = p.capabilities(platform);
      return kind ? caps.includes(kind) : caps.length > 0;
    });
    const healthy: DownloadProvider[] = [];
    for (const p of able) if ((await this.healthOf(p)).ok) healthy.push(p);
    return healthy;
  }

  private fail(attempts: Attempt[]): never {
    if (!attempts.length) throw new DownloadError('engine_unavailable');
    const best = [...attempts].sort((a, b) => (RANK[b.code] ?? 0) - (RANK[a.code] ?? 0))[0];
    throw new DownloadError(best.code as DownloadError['code'], undefined, attempts.map((a) => `${a.engine}: ${a.code}`).join(' | '));
  }

  async inspect(target: DetectedUrl, signal: AbortSignal): Promise<MediaInfo> {
    const attempts: Attempt[] = [];
    for (const p of await this.candidates(target.platform)) {
      try {
        const info = await p.inspect(target, signal);
        this.log(`inspect ${target.platform} → ${p.id}`);
        return info;
      } catch (err) {
        const e = asDownloadError(err);
        attempts.push({ engine: p.id, code: e.code, detail: e.detail });
        this.log(`inspect ${target.platform} ✗ ${p.id}: ${e.code}`);
        if (FINAL_ERRORS.has(e.code)) throw e;
      }
    }
    return this.fail(attempts);
  }

  /** Returns the id of the engine that delivered (for logs). */
  async download(req: DownloadRequest, ctx: DownloadContext): Promise<string> {
    const attempts: Attempt[] = [];
    for (const p of await this.candidates(req.platform, req.kind)) {
      try {
        await p.download(req, ctx);
        this.log(`download ${req.platform}/${req.kind} → ${p.id}`);
        return p.id;
      } catch (err) {
        const e = asDownloadError(err);
        attempts.push({ engine: p.id, code: e.code, detail: e.detail });
        this.log(`download ${req.platform}/${req.kind} ✗ ${p.id}: ${e.code}`);
        if (FINAL_ERRORS.has(e.code) || ctx.signal.aborted) throw ctx.signal.aborted ? new DownloadError('cancelled') : e;
        await emptyDir(ctx.dir); // the next engine starts clean
      }
    }
    return this.fail(attempts);
  }
}
