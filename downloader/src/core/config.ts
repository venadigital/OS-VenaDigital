import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JobPolicy } from './jobs.ts';
import { parseRoutes, type Routes } from './router.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(here, '../..');
const env = process.env;
const num = (key: string, fallback: number) => (env[key] && Number.isFinite(Number(env[key])) ? Number(env[key]) : fallback);
const MB = 1024 * 1024;
const MIN = 60_000;

export interface Config {
  host: string;
  port: number;
  /** When set, every /api call needs `Authorization: Bearer <token>`. */
  token?: string;
  /** Origins allowed to call the API from a browser (the OS, later). */
  corsOrigins: string[];
  tmpRoot: string;
  sweepEveryMs: number;
  policy: JobPolicy;
  routes: Routes;
  engines: {
    ytdlp: string;
    gallerydl: string;
    /** Virtualenv with the engines; enables automatic upgrades when uv is set. */
    enginesDir: string;
    uv?: string;
    autoUpdateDays: number;
    ffmpeg?: string;
    jsRuntime: string;
    cobaltUrl?: string;
    cobaltKey?: string;
    cookiesFile?: string;
    cookiesFromBrowser?: string;
  };
}

export function loadConfig(): Config {
  const enginesDir = env.ENGINES_DIR ?? path.join(serviceRoot, '.engines');
  return {
    // Local only: nothing outside this Mac can reach it.
    host: env.HOST ?? '127.0.0.1',
    port: num('PORT', 4318),
    token: env.DOWNLOADER_TOKEN || undefined,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5183,https://os.venadigital.com.co').split(',').map((s) => s.trim()).filter(Boolean),
    tmpRoot: env.TMP_ROOT ?? path.join(os.tmpdir(), 'vena-downloader'),
    sweepEveryMs: num('SWEEP_SEC', 60) * 1000,
    policy: {
      maxConcurrent: num('MAX_CONCURRENT', 2),
      maxQueued: num('MAX_QUEUED', 6),
      maxFileBytes: num('MAX_FILE_MB', 2048) * MB,
      quotaBytes: num('QUOTA_MB', 5120) * MB,
      jobTimeoutMs: num('JOB_TIMEOUT_MIN', 20) * MIN,
      readyTtlMs: num('READY_TTL_MIN', 15) * MIN,
      deliveredGraceMs: num('DELIVERED_GRACE_SEC', 60) * 1000,
      forgetAfterMs: num('FORGET_AFTER_MIN', 60) * MIN,
      orphanGraceMs: num('ORPHAN_GRACE_MIN', 5) * MIN,
    },
    routes: parseRoutes(env.ROUTES),
    engines: {
      enginesDir,
      ytdlp: env.YTDLP_BIN ?? path.join(enginesDir, 'bin/yt-dlp'),
      gallerydl: env.GALLERYDL_BIN ?? path.join(enginesDir, 'bin/gallery-dl'),
      uv: env.UV_BIN || undefined,
      autoUpdateDays: num('AUTO_UPDATE_DAYS', 7),
      ffmpeg: env.FFMPEG_BIN || undefined,
      jsRuntime: env.YTDLP_JS_RUNTIME ?? `node:${process.execPath}`,
      cobaltUrl: env.COBALT_URL || undefined,
      cobaltKey: env.COBALT_API_KEY || undefined,
      cookiesFile: env.COOKIES_FILE || undefined,
      cookiesFromBrowser: env.COOKIES_FROM_BROWSER || undefined,
    },
  };
}
