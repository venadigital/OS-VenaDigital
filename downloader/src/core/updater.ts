import { stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { run } from './exec.ts';

/**
 * Platforms change often and engines follow within days. A stale yt-dlp is
 * the most likely reason for downloads to stop working, so the service
 * refreshes its own engines: checked every hour, upgraded when the last
 * upgrade is older than `everyDays` and no download is running.
 */
export interface UpdaterOptions {
  uvBin: string;
  /** Python virtualenv holding the engines (…/engines). */
  enginesDir: string;
  everyDays: number;
  isIdle: () => boolean;
  onUpdated: () => void;
  log: (msg: string) => void;
}

const PACKAGES = ['yt-dlp[default]', 'gallery-dl'];

export function startEngineUpdates(opts: UpdaterOptions): () => void {
  if (opts.everyDays <= 0) return () => {};
  const stamp = path.join(opts.enginesDir, '.last-update');
  let running = false;

  const check = async () => {
    if (running || !opts.isIdle()) return;
    const last = await stat(stamp).then((s) => s.mtimeMs).catch(() => 0);
    if (Date.now() - last < opts.everyDays * 86_400_000) return;
    running = true;
    try {
      const res = await run(opts.uvBin, ['pip', 'install', '--upgrade', '--python', path.join(opts.enginesDir, 'bin', 'python'), ...PACKAGES], {
        timeoutMs: 10 * 60_000,
      });
      if (res.code === 0) {
        const now = new Date();
        await writeFile(stamp, now.toISOString()).then(() => utimes(stamp, now, now));
        opts.log(`motores actualizados${res.stderr.match(/\+ \S+/g) ? `: ${res.stderr.match(/\+ \S+/g)!.join(' ')}` : ' (ya estaban al día)'}`);
        opts.onUpdated();
      } else {
        opts.log(`no se pudieron actualizar los motores: ${res.stderr.slice(-300)}`);
      }
    } catch (err) {
      opts.log(`no se pudieron actualizar los motores: ${err instanceof Error ? err.message : err}`);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => void check(), 30_000);
  const timer = setInterval(() => void check(), 60 * 60_000);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
