import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectUrl } from '../src/core/platforms.ts';
import { DownloadError } from '../src/core/types.ts';

test('detecta cada plataforma y variante', () => {
  assert.equal(detectUrl('https://www.youtube.com/watch?v=abc').platform, 'youtube');
  assert.equal(detectUrl('https://youtu.be/abc').platform, 'youtube');
  assert.equal(detectUrl('https://youtube.com/shorts/abc').label, 'YouTube Shorts');
  assert.equal(detectUrl('https://www.instagram.com/reel/xyz/').platform, 'instagram');
  assert.equal(detectUrl('https://vm.tiktok.com/ZM123/').platform, 'tiktok');
  assert.equal(detectUrl('https://twitter.com/a/status/1').platform, 'x');
  assert.equal(detectUrl('https://x.com/a/status/1').label, 'X');
});

test('encuentra el enlace dentro de un texto compartido y lo limpia', () => {
  const d = detectUrl('Mira esto 👉 https://www.instagram.com/reel/xyz/?igsh=abc&utm_source=ig_web.');
  assert.equal(d.url, 'https://www.instagram.com/reel/xyz/');
  assert.equal(detectUrl('https://youtu.be/abc?si=track&t=42').url, 'https://youtu.be/abc?t=42');
});

test('rechaza lo que no es un enlace o no es de una plataforma soportada', () => {
  assert.throws(() => detectUrl('hola'), (e: DownloadError) => e.code === 'invalid_url');
  assert.throws(() => detectUrl('https://vimeo.com/123'), (e: DownloadError) => e.code === 'unsupported');
  assert.throws(() => detectUrl('https://youtube.com.evil.co/watch?v=1'), (e: DownloadError) => e.code === 'unsupported');
  assert.throws(() => detectUrl('http://127.0.0.1:8080/x'), (e: DownloadError) => e.code === 'unsupported');
});
