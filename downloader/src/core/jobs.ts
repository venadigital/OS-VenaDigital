import { randomUUID } from 'node:crypto';
import { listOutputs, type OutputFile } from './files.ts';
import type { Router } from './router.ts';
import type { TempStore } from './storage.ts';
import { DownloadError, asDownloadError, type DownloadRequest, type ErrorCode, type Progress } from './types.ts';

/** Runs after any engine finished, on the job folder. */
export type PostProcess = (req: DownloadRequest, dir: string, ctx: { signal: AbortSignal; onProgress(p: Progress): void }) => Promise<void>;

export type JobStatus = 'queued' | 'running' | 'ready' | 'failed' | 'cancelled' | 'expired';

/** Cleanup policy. Every number is a config value; defaults live in config.ts. */
export interface JobPolicy {
  maxConcurrent: number;
  maxQueued: number;
  maxFileBytes: number;
  /** Total bytes allowed in the temp root; new jobs are refused above it. */
  quotaBytes: number;
  /** Hard limit for one job, queue time excluded. */
  jobTimeoutMs: number;
  /** A finished file waits this long to be fetched, then it is deleted. */
  readyTtlMs: number;
  /** After every file was fetched once, delete after this short grace (allows a retry). */
  deliveredGraceMs: number;
  /** Finished jobs are forgotten (status no longer queryable) after this. */
  forgetAfterMs: number;
  /** Orphan folders (no live job) older than this are deleted by the sweeper. */
  orphanGraceMs: number;
}

interface Job {
  id: string;
  request: DownloadRequest;
  status: JobStatus;
  progress?: Progress;
  files: OutputFile[];
  delivered: Set<number>;
  error?: ErrorCode;
  engine?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  expiresAt?: number;
  abort: AbortController;
  abortReason?: 'cancelled' | 'timeout';
}

/** What the API may show. No engine, no paths. */
export interface JobView {
  id: string;
  status: JobStatus;
  kind: DownloadRequest['kind'];
  progress?: Progress;
  files: OutputFile[];
  error?: ErrorCode;
  expiresAt?: number;
}

export class JobManager {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: string[] = [];
  private running = 0;
  private readonly inFlight = new Set<Promise<void>>();
  private readonly router: Router;
  private readonly store: TempStore;
  private readonly policy: JobPolicy;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private readonly postProcess?: PostProcess;
  private sweeper?: NodeJS.Timeout;

  constructor(
    router: Router,
    store: TempStore,
    policy: JobPolicy,
    opts: { now?: () => number; log?: (msg: string) => void; postProcess?: PostProcess } = {},
  ) {
    this.router = router;
    this.store = store;
    this.policy = policy;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => {});
    this.postProcess = opts.postProcess;
  }

  async start(sweepEveryMs: number): Promise<void> {
    await this.store.init();
    this.sweeper = setInterval(() => void this.sweep().catch((e) => this.log(`sweep: ${e}`)), sweepEveryMs);
    this.sweeper.unref();
  }

  async create(request: DownloadRequest): Promise<JobView> {
    const waiting = this.queue.length;
    if (waiting >= this.policy.maxQueued) throw new DownloadError('busy');
    if ((await this.store.usage()) >= this.policy.quotaBytes) {
      await this.sweep(); // free what can be freed before refusing
      if ((await this.store.usage()) >= this.policy.quotaBytes) throw new DownloadError('storage_full');
    }
    const job: Job = { id: randomUUID(), request, status: 'queued', files: [], delivered: new Set(), createdAt: this.now(), abort: new AbortController() };
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.pump();
    return this.view(job);
  }

  /** True when nothing is downloading or waiting. */
  isIdle(): boolean {
    return this.running === 0 && this.queue.length === 0;
  }

  get(id: string): JobView | undefined {
    const job = this.jobs.get(id);
    return job && this.view(job);
  }

  /** Path of a ready file, or why it can't be served. */
  fileFor(id: string, index: number): { dir: string; file: OutputFile } | ErrorCode {
    const job = this.jobs.get(id);
    if (!job) return 'gone';
    if (job.status !== 'ready') return job.status === 'expired' ? 'gone' : 'not_found';
    const file = job.files[index];
    if (!file) return 'not_found';
    return { dir: this.store.dirFor(id), file };
  }

  /** Called when a file was streamed completely to the client. */
  markDelivered(id: string, index: number): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'ready') return;
    job.delivered.add(index);
    if (job.delivered.size >= job.files.length) {
      job.expiresAt = Math.min(job.expiresAt ?? Infinity, this.now() + this.policy.deliveredGraceMs);
    }
  }

  async cancel(id: string): Promise<JobView | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status === 'queued') {
      this.queue.splice(this.queue.indexOf(id), 1);
      await this.finish(job, 'cancelled', 'cancelled');
    } else if (job.status === 'running') {
      job.abortReason = 'cancelled';
      job.abort.abort();
    } else if (job.status === 'ready') {
      await this.finish(job, 'cancelled');
    }
    return this.view(job);
  }

  private pump(): void {
    while (this.running < this.policy.maxConcurrent && this.queue.length) {
      const job = this.jobs.get(this.queue.shift()!);
      if (!job) continue;
      const p = this.run(job).finally(() => this.inFlight.delete(p));
      this.inFlight.add(p);
    }
  }

  private async run(job: Job): Promise<void> {
    this.running++;
    job.status = 'running';
    job.startedAt = this.now();
    const timer = setTimeout(() => {
      job.abortReason = 'timeout';
      job.abort.abort();
    }, this.policy.jobTimeoutMs);
    try {
      const dir = await this.store.create(job.id);
      job.engine = await this.router.download(job.request, {
        dir,
        signal: job.abort.signal,
        maxBytes: this.policy.maxFileBytes,
        onProgress: (p) => (job.progress = p),
      });
      // Engine-agnostic finishing step (e.g. making videos playable on iPhone).
      await this.postProcess?.(job.request, dir, { signal: job.abort.signal, onProgress: (p) => (job.progress = p) });
      job.files = await listOutputs(dir);
      job.status = 'ready';
      job.finishedAt = this.now();
      job.expiresAt = this.now() + this.policy.readyTtlMs;
      job.progress = { stage: 'downloading', percent: 100 };
      this.log(`job ${job.id.slice(0, 8)} listo via ${job.engine}: ${job.files.map((f) => f.name).join(', ')}`);
    } catch (err) {
      const e = asDownloadError(err);
      const code: ErrorCode = job.abortReason ?? e.code;
      this.log(`job ${job.id.slice(0, 8)} ${code}${e.detail ? ` — ${e.detail.slice(0, 300)}` : ''}`);
      await this.finish(job, code === 'cancelled' ? 'cancelled' : 'failed', code);
    } finally {
      clearTimeout(timer);
      this.running--;
      this.pump();
    }
  }

  /** Terminal states always delete the files right away. */
  private async finish(job: Job, status: JobStatus, error?: ErrorCode): Promise<void> {
    job.status = status;
    job.error = error;
    job.files = [];
    job.finishedAt ??= this.now();
    job.expiresAt = undefined;
    await this.store.remove(job.id).catch(() => {});
  }

  /** Runs every minute: expire unfetched files, forget old jobs, remove orphans. */
  async sweep(): Promise<void> {
    const now = this.now();
    for (const job of this.jobs.values()) {
      if (job.status === 'ready' && job.expiresAt !== undefined && now >= job.expiresAt) {
        await this.finish(job, 'expired');
        this.log(`job ${job.id.slice(0, 8)} archivos borrados`);
      }
      if (job.finishedAt && job.status !== 'ready' && now - job.finishedAt > this.policy.forgetAfterMs) this.jobs.delete(job.id);
    }
    const live = new Set([...this.jobs.values()].filter((j) => j.status === 'running' || j.status === 'ready').map((j) => j.id));
    await this.store.sweepOrphans(live, this.policy.orphanGraceMs, now);
  }

  /** Shutdown: stop everything and leave nothing on disk. */
  async stop(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    this.queue.length = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'queued') job.status = 'cancelled';
      if (job.status === 'running') {
        job.abortReason = 'cancelled';
        job.abort.abort();
      }
    }
    // Wait for engines to exit so nothing writes into the folder while it is removed.
    await Promise.allSettled([...this.inFlight]);
    await this.store.wipe();
  }

  private view(job: Job): JobView {
    return { id: job.id, status: job.status, kind: job.request.kind, progress: job.progress, files: job.files, error: job.error, expiresAt: job.expiresAt };
  }
}
