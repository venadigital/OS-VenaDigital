import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { YtDlpProvider, classifyYtDlp } from '../src/providers/ytdlp.ts';

async function script(body: string): Promise<string> {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), 'ytdlp-test-')), 'bin');
  await writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

test('si ffmpeg tarda en contestar es falta de tiempo, no que falte', async () => {
  const p = new YtDlpProvider({ bin: await script('echo 1.0'), ffmpeg: await script('exec sleep 30'), checkTimeoutMs: 1500 });
  assert.equal((await p.healthCheck()).detail, 'timeout');
});

test('si ffmpeg no existe el motor sí está caído', async () => {
  const p = new YtDlpProvider({ bin: await script('echo 1.0'), ffmpeg: '/no/existe/ffmpeg' });
  const health = await p.healthCheck();
  assert.equal(health.ok, false);
  assert.notEqual(health.detail, 'timeout');
});

test('traduce calidad y formato a opciones de yt-dlp', () => {
  const v = YtDlpProvider.selectionArgs({ url: 'u', platform: 'youtube', kind: 'video', quality: '720' });
  assert.ok(v.includes('res:720,vcodec:h264,acodec:aac'));
  assert.ok(v.includes('mp4'));
  const best = YtDlpProvider.selectionArgs({ url: 'u', platform: 'youtube', kind: 'video', quality: 'best' });
  assert.ok(best.includes('res,vcodec:h264,acodec:aac'));
  const a = YtDlpProvider.selectionArgs({ url: 'u', platform: 'youtube', kind: 'audio', audioFormat: 'm4a' });
  assert.deepEqual(a.slice(0, 5), ['-f', 'ba[ext=m4a]/ba/b', '-x', '--audio-format', 'm4a']);
});

test('clasifica los errores de yt-dlp', () => {
  assert.equal(classifyYtDlp("ERROR: [youtube] x: Sign in to confirm you're not a bot"), 'login_required');
  assert.equal(classifyYtDlp('ERROR: [TikTok] 1: Your IP address is blocked from accessing this post'), 'blocked');
  assert.equal(classifyYtDlp('ERROR: [youtube] x: Video unavailable'), 'not_found');
  assert.equal(classifyYtDlp('ERROR: Unsupported URL: https://a'), 'unsupported');
  assert.equal(classifyYtDlp('ERROR: [instagram] x: There is no video in this post'), 'unsupported');
  assert.equal(classifyYtDlp('ERROR: HTTP Error 429: Too Many Requests'), 'rate_limited');
});
