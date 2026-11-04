import { deflateSync } from 'node:zlib';

/**
 * Writes the PDF of a captured web page: each page is a JPEG of a stretch of the site with
 * its words on top as invisible text, so the viewer can select and highlight them.
 * One page unit equals one CSS pixel of the site.
 */

/** A word on the page: text, then left, top, width and height from the page's top-left corner. */
export type PdfWord = [text: string, x: number, y: number, w: number, h: number];

export interface PdfPage {
  jpeg: Buffer;
  width: number;
  height: number;
  words: PdfWord[];
}

/** Every glyph measures half an em, so a word's horizontal scale comes from its length alone. */
const GLYPH_EM = 0.5;

/** Windows-1252 positions that differ from Latin-1. */
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';

function winAnsiByte(ch: string): number {
  const code = ch.codePointAt(0) ?? 63;
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return code;
  const i = CP1252.indexOf(ch);
  return i >= 0 ? 0x80 + i : 63; // outside the encoding: the word keeps its place, as "?"
}

/** A PDF literal string, with any byte that isn't plain ASCII written in octal. */
export function pdfString(text: string): string {
  let out = '(';
  for (const ch of text) {
    const b = winAnsiByte(ch);
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return `${out})`;
}

const num = (n: number) => String(Math.round(n * 100) / 100);

/** Pixel size of a JPEG, from its start-of-frame marker. */
export function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let i = 2;
  while (i + 9 < jpeg.length) {
    if (jpeg[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = jpeg[i + 1];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { height: jpeg.readUInt16BE(i + 5), width: jpeg.readUInt16BE(i + 7) };
    i += 2 + jpeg.readUInt16BE(i + 2);
  }
  throw new Error('JPEG sin dimensiones');
}

function pageContent(page: PdfPage): Buffer {
  const ops = [`q ${num(page.width)} 0 0 ${num(page.height)} 0 0 cm /Im Do Q`];
  if (page.words.length) {
    ops.push('BT 3 Tr');
    for (const [text, x, y, w, h] of page.words) {
      const size = h * 0.85;
      const scale = (w / ([...text].length * GLYPH_EM * size)) * 100;
      ops.push(`/F ${num(size)} Tf ${num(scale)} Tz 1 0 0 1 ${num(x)} ${num(page.height - (y + h * 0.8))} Tm ${pdfString(text)} Tj`);
    }
    ops.push('ET');
  }
  return deflateSync(Buffer.from(ops.join('\n'), 'latin1'));
}

export function buildWebPdf(pages: PdfPage[], title: string): Buffer {
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let size = 0;
  const write = (b: Buffer | string) => {
    const buf = typeof b === 'string' ? Buffer.from(b, 'latin1') : b;
    chunks.push(buf);
    size += buf.length;
  };
  const object = (n: number, dict: string, stream?: Buffer) => {
    offsets[n] = size;
    write(`${n} 0 obj\n${dict}\n`);
    if (stream) {
      write('stream\n');
      write(stream);
      write('\nendstream\n');
    }
    write('endobj\n');
  };

  // 1 catalog, 2 page tree, 3 font, 4 info; then page, contents and image for each page.
  const pageObj = (i: number) => 5 + i * 3;
  write('%PDF-1.5\n%\xe2\xe3\xcf\xd3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`);
  const widths = new Array(224).fill(GLYPH_EM * 1000).join(' ');
  object(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 255 /Widths [${widths}] >>`);
  const utf16 = Buffer.from(`﻿${title}`, 'utf16le').swap16().toString('hex');
  object(4, `<< /Title <${utf16}> /Producer (Vena OS) >>`);

  pages.forEach((page, i) => {
    const n = pageObj(i);
    const { width, height } = jpegSize(page.jpeg);
    object(
      n,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Contents ${n + 1} 0 R ` +
        `/Resources << /XObject << /Im ${n + 2} 0 R >> /Font << /F 3 0 R >> >> >>`,
    );
    const content = pageContent(page);
    object(n + 1, `<< /Length ${content.length} /Filter /FlateDecode >>`, content);
    object(
      n + 2,
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg,
    );
  });

  const xref = size;
  const count = offsets.length;
  write(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) write(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${count} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
