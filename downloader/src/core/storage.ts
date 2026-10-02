import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { dirSize } from './files.ts';

/**
 * The only place downloads touch the disk: one root folder in the system temp
 * dir (outside the project and outside iCloud), one sub-folder per job.
 * Anything in the root that no live job owns is garbage by definition.
 */
export class TempStore {
  readonly root: string;

  constructor(root: string) {
    // Refuse roots that could wipe something important if misconfigured.
    if (path.resolve(root).split(path.sep).filter(Boolean).length < 2 || !/downloader/i.test(root)) {
      throw new Error(`Carpeta temporal no segura: ${root}`);
    }
    this.root = path.resolve(root);
  }

  /** Startup: whatever survived a crash or restart is deleted. */
  async init(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
    await mkdir(this.root, { recursive: true });
  }

  dirFor(id: string): string {
    if (!/^[a-z0-9-]{8,64}$/i.test(id)) throw new Error('id de trabajo inválido');
    return path.join(this.root, id);
  }

  async create(id: string): Promise<string> {
    const dir = this.dirFor(id);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async remove(id: string): Promise<void> {
    await rm(this.dirFor(id), { recursive: true, force: true });
  }

  async usage(): Promise<number> {
    return dirSize(this.root);
  }

  /** Deletes folders no live job owns, once they are older than `graceMs`. */
  async sweepOrphans(live: Set<string>, graceMs: number, now = Date.now()): Promise<string[]> {
    const removed: string[] = [];
    for (const name of await readdir(this.root).catch(() => [] as string[])) {
      if (live.has(name)) continue;
      const full = path.join(this.root, name);
      const info = await stat(full).catch(() => null);
      if (info && now - info.mtimeMs > graceMs) {
        await rm(full, { recursive: true, force: true });
        removed.push(name);
      }
    }
    return removed;
  }

  async wipe(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}
