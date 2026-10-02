import { readdir, stat, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Leftovers engines write while working; never handed to the person. */
const PARTIAL = /\.(part|ytdl|temp|tmp)$|\.part-Frag\d+|\.f\d+\.\w+$/i;

export interface OutputFile {
  name: string;
  size: number;
}

/** Finished files in a job folder, biggest first (the main file comes first). */
export async function listOutputs(dir: string): Promise<OutputFile[]> {
  const out: OutputFile[] = [];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (name.startsWith('.') || PARTIAL.test(name)) continue;
    const info = await stat(path.join(dir, name)).catch(() => null);
    if (info?.isFile() && info.size > 0) out.push({ name, size: info.size });
  }
  return out.sort((a, b) => b.size - a.size);
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else total += (await stat(full).catch(() => null))?.size ?? 0;
  }
  return total;
}

/** Empties a folder without removing it (used between engine attempts). */
export async function emptyDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

/** Safe filename for any OS: no separators, control chars or reserved symbols. */
export function safeName(name: string, fallback = 'archivo'): string {
  const clean = path
    .basename(name)
    .replace(/[\/\\:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
  return clean && clean !== '.' && clean !== '..' ? clean : fallback;
}
