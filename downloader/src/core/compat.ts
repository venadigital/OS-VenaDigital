import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { run } from './exec.ts';
import { listOutputs } from './files.ts';
import { DownloadError, type Progress } from './types.ts';

/**
 * Makes every video play on iPhone, QuickTime and Photos, whatever engine
 * produced it. Platforms increasingly serve VP9/AV1 (Instagram reels, YouTube
 * above 1080p), which Apple players refuse inside an .mp4.
 *
 * - h264 / hevc(hvc1) + aac/mp3 in mp4/mov → untouched
 * - hevc tagged hev1                       → remux only, tag fixed (seconds)
 * - anything else                          → re-encode to h264 + aac
 */

const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm)$/i;
const OK_AUDIO = new Set(['aac', 'mp3', 'alac']);

interface Stream {
  codec_type: string;
  codec_name: string;
  codec_tag_string?: string;
  bit_rate?: string;
}
interface Probe {
  streams: Stream[];
  format: { duration?: string; bit_rate?: string; format_name?: string };
}

export interface CompatOptions {
  ffmpeg?: string;
  ffprobe?: string;
}

let encoderCache: Promise<string> | undefined;
/** Hardware encoder on a Mac (2–3× faster), libx264 anywhere else. */
function pickEncoder(ffmpeg: string): Promise<string> {
  encoderCache ??= run(ffmpeg, ['-hide_banner', '-encoders'], { timeoutMs: 10_000 })
    .then((r) => (/h264_videotoolbox/.test(r.stdout) ? 'h264_videotoolbox' : 'libx264'))
    .catch(() => 'libx264');
  return encoderCache;
}

async function probe(ffprobe: string, file: string, signal: AbortSignal): Promise<Probe | null> {
  const r = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { signal, timeoutMs: 30_000 });
  if (r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout) as Probe;
  } catch {
    return null;
  }
}

type Plan = 'keep' | 'retag' | 'encode';

export function planFor(p: Probe, file: string): Plan {
  const video = p.streams.find((s) => s.codec_type === 'video');
  if (!video) return 'keep';
  const audio = p.streams.find((s) => s.codec_type === 'audio');
  const audioOk = !audio || OK_AUDIO.has(audio.codec_name);
  const mp4 = /\.(mp4|m4v|mov)$/i.test(file);
  if (video.codec_name === 'h264' && audioOk && mp4) return 'keep';
  if (video.codec_name === 'hevc' && audioOk && mp4) return video.codec_tag_string === 'hvc1' ? 'keep' : 'retag';
  return 'encode';
}

export async function ensurePlayable(
  dir: string,
  ctx: { signal: AbortSignal; onProgress(p: Progress): void },
  opts: CompatOptions = {},
): Promise<void> {
  const ffmpeg = opts.ffmpeg ?? 'ffmpeg';
  const ffprobe = opts.ffprobe ?? 'ffprobe';
  for (const { name } of await listOutputs(dir)) {
    if (!VIDEO_EXT.test(name)) continue;
    const file = path.join(dir, name);
    const info = await probe(ffprobe, file, ctx.signal);
    if (!info) continue;
    const plan = planFor(info, file);
    if (plan === 'keep') continue;

    ctx.onProgress({ stage: 'processing', percent: 0 });
    const out = path.join(dir, `${path.parse(name).name}.compat.mp4`);
    const audio = info.streams.find((s) => s.codec_type === 'audio');
    const args = ['-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-map', '0:a:0?'];

    if (plan === 'retag') {
      args.push('-c', 'copy', '-tag:v', 'hvc1');
    } else {
      const encoder = await pickEncoder(ffmpeg);
      // H.264 needs ~1.6× the bitrate of VP9/AV1 for the same look; bounded so files don't balloon.
      const video = info.streams.find((s) => s.codec_type === 'video');
      const src = Number(video?.bit_rate) || Number(info.format.bit_rate) || 3_000_000;
      const target = Math.round(Math.min(12_000_000, Math.max(1_500_000, src * 1.6)));
      args.push(
        ...(encoder === 'h264_videotoolbox'
          ? ['-c:v', 'h264_videotoolbox', '-b:v', String(target), '-maxrate', String(Math.round(target * 1.5)), '-bufsize', String(target * 2), '-profile:v', 'high']
          : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-maxrate', String(Math.round(target * 1.5)), '-bufsize', String(target * 2)]),
        '-pix_fmt', 'yuv420p', '-tag:v', 'avc1',
      );
      args.push(...(audio && OK_AUDIO.has(audio.codec_name) ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '160k']));
    }
    args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', out);

    const duration = Number(info.format.duration) || 0;
    const res = await run(ffmpeg, args, {
      signal: ctx.signal,
      onLine: (line) => {
        const m = /^out_time_us=(\d+)/.exec(line);
        if (m && duration) ctx.onProgress({ stage: 'processing', percent: Math.min(99, Number(m[1]) / 1e6 / duration * 100) });
      },
    });
    if (res.code !== 0) {
      await rm(out, { force: true });
      throw new DownloadError('engine_error', 'No se pudo convertir el video a un formato compatible', res.stderr.slice(-1500));
    }
    await rm(file, { force: true });
    await rename(out, path.join(dir, `${path.parse(name).name}.mp4`));
  }
}
