import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { DownloadError } from './types.ts';

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs an engine CLI with an argument array (never a shell string, so a URL
 * can't inject commands). Aborting kills the whole process group, which also
 * stops the ffmpeg children an engine may have spawned.
 */
export function run(
  cmd: string,
  args: string[],
  opts: { signal?: AbortSignal; timeoutMs?: number; onLine?: (line: string) => void; maxOutput?: number } = {},
): Promise<RunResult> {
  const maxOutput = opts.maxOutput ?? 20 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new DownloadError('cancelled'));
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    } catch (err) {
      return reject(new DownloadError('engine_unavailable', `No se pudo ejecutar ${cmd}`, String(err)));
    }
    let stdout = '';
    let stderr = '';
    let pending = '';
    let reason: 'cancelled' | 'timeout' | null = null;

    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        try {
          if (child.pid && child.exitCode === null) process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }, 3000).unref();
    };
    const onAbort = () => {
      reason ??= 'cancelled';
      kill();
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          reason = 'timeout';
          kill();
        }, opts.timeoutMs)
      : null;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < maxOutput) stdout += chunk;
      if (opts.onLine) {
        pending += chunk;
        const lines = pending.split(/\r?\n|\r/);
        pending = lines.pop() ?? '';
        for (const line of lines) if (line) opts.onLine(line);
      }
    });
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 256 * 1024) stderr += chunk;
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      cleanup();
      reject(new DownloadError('engine_unavailable', `No se encontró ${cmd}`, err.message));
    });
    child.on('close', (code) => {
      cleanup();
      if (reason) return reject(new DownloadError(reason));
      resolve({ code, stdout, stderr });
    });
    function cleanup() {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  });
}
