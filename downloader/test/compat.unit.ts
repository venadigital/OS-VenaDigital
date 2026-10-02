import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planFor } from '../src/core/compat.ts';

const probe = (v: string, a: string | null, tag?: string) => ({
  streams: [{ codec_type: 'video', codec_name: v, codec_tag_string: tag }, ...(a ? [{ codec_type: 'audio', codec_name: a }] : [])],
  format: {},
});

test('deja intacto lo que ya se ve en iPhone', () => {
  assert.equal(planFor(probe('h264', 'aac'), 'a.mp4'), 'keep');
  assert.equal(planFor(probe('h264', null), 'a.mp4'), 'keep');
  assert.equal(planFor(probe('hevc', 'aac', 'hvc1'), 'a.mp4'), 'keep');
});

test('VP9, AV1 u Opus se convierten; HEVC mal etiquetado solo se re-etiqueta', () => {
  assert.equal(planFor(probe('vp9', 'aac'), 'reel.mp4'), 'encode');
  assert.equal(planFor(probe('av1', 'opus'), 'a.mp4'), 'encode');
  assert.equal(planFor(probe('h264', 'opus'), 'a.mp4'), 'encode');
  assert.equal(planFor(probe('h264', 'aac'), 'a.webm'), 'encode');
  assert.equal(planFor(probe('hevc', 'aac', 'hev1'), 'a.mp4'), 'retag');
});
