import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CaptureError, navigationError, parseCaptureUrl, scaleFor, WebCapture } from '../src/core/webCapture.ts';
import { buildWebPdf, jpegSize, pdfString } from '../src/core/webPdf.ts';

test('la dirección escrita se completa y se limpia', () => {
  assert.equal(parseCaptureUrl(' venadigital.com.co '), 'https://venadigital.com.co/');
  assert.equal(parseCaptureUrl('http://ejemplo.com/a?b=1#c'), 'http://ejemplo.com/a?b=1#c');
  assert.equal(parseCaptureUrl('https://es.wikipedia.org/wiki/Medellín'), 'https://es.wikipedia.org/wiki/Medell%C3%ADn');
});

test('no abre archivos, otras redes ni cosas que no son direcciones', () => {
  const bad = [
    '',
    'hola mundo',
    'palabra',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'ftp://ejemplo.com',
    'http://localhost:3000',
    'http://127.0.0.1:4318/api/health',
    'http://10.0.0.8',
    'http://192.168.1.1',
    'http://172.20.0.1',
    'http://169.254.169.254/latest',
    'http://[::1]/',
    'http://impresora.local',
    'https://usuario:clave@ejemplo.com',
  ];
  for (const url of bad) assert.throws(() => parseCaptureUrl(url), (e: CaptureError) => e.code === 'invalid_url', url);
  assert.equal(parseCaptureUrl('http://172.32.0.1.nip.io'), 'http://172.32.0.1.nip.io/');
});

test('los fallos de carga se traducen a algo que se pueda explicar', () => {
  assert.equal(navigationError('net::ERR_NAME_NOT_RESOLVED')?.code, 'not_found');
  assert.equal(navigationError('net::ERR_ABORTED')?.code, 'not_page');
  assert.equal(navigationError(undefined, 403)?.code, 'blocked');
  assert.equal(navigationError(undefined, 503)?.code, 'blocked');
  assert.equal(navigationError(undefined, 404)?.code, 'not_found');
  assert.equal(navigationError('net::ERR_HTTP_RESPONSE_CODE_FAILURE', 403)?.code, 'blocked');
  assert.equal(navigationError(undefined, 200), null);
  assert.equal(navigationError(), null);
});

test('la nitidez baja con el largo para que la página quepa en la biblioteca', () => {
  assert.equal(scaleFor(8000), 2);
  assert.equal(scaleFor(20_000), 1.5);
  assert.equal(scaleFor(58_000), 1);
});

test('una captura sin Chrome lo dice antes de intentar nada', async () => {
  const capture = new WebCapture({ chrome: '/nonexistent/chrome', profileDir: '/tmp/x' });
  assert.equal(capture.available(), false);
  await assert.rejects(capture.run('https://ejemplo.com', new AbortController().signal), (e: CaptureError) => e.code === 'unavailable');
  await assert.rejects(capture.run('no es url', new AbortController().signal), (e: CaptureError) => e.code === 'invalid_url');
});

/** Smallest thing jpegSize can read: SOI, a segment to skip and a frame header. */
const fakeJpeg = (w: number, h: number) =>
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 0, 0, 0, 0, 0xff, 0xd9]);

test('lee el tamaño del JPEG aunque haya segmentos antes', () => {
  assert.deepEqual(jpegSize(fakeJpeg(2880, 1800)), { width: 2880, height: 1800 });
  assert.throws(() => jpegSize(Buffer.from([0xff, 0xd8, 0xff, 0xd9])));
});

test('el texto queda en WinAnsi y escapado', () => {
  assert.equal(pdfString('a(b)\\c'), '(a\\(b\\)\\\\c)');
  assert.equal(pdfString('año'), '(a\\361o)');
  assert.equal(pdfString('“sí”'), '(\\223s\\355\\224)');
  assert.equal(pdfString('🚀'), '(?)');
});

test('el PDF tiene sus páginas, y el índice apunta a cada objeto', () => {
  const pdf = buildWebPdf(
    [
      { jpeg: fakeJpeg(2880, 1800), width: 1440, height: 900, words: [['Hola', 10, 20, 50, 18]] },
      { jpeg: fakeJpeg(2880, 600), width: 1440, height: 300, words: [] },
    ],
    'Título ñ',
  );
  const text = pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-'));
  assert.ok(text.endsWith('%%EOF\n'));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 1440 900\]/);
  assert.match(text, /\/MediaBox \[0 0 1440 300\]/);
  const xref = Number(text.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
  const entries = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(entries.length, 10); // catalog, tree, font, info + 3 per page
  entries.forEach((offset, i) => assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});
