import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildWebPdf, type WebPart } from './fromExtension';

/** The smallest valid JPEG: one gray pixel. */
const PIXEL = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  ),
  (c) => c.charCodeAt(0),
);

describe('buildWebPdf', () => {
  const part = (width: number, height: number, words: WebPart['words'] = []): WebPart => ({ bytes: PIXEL, type: 'image/jpeg', width, height, words });

  it('makes one page per stretch, measured in pixels of the site', async () => {
    const blob = await buildWebPdf([part(1440, 600, [['Hola', 10, 20, 50, 18]]), part(1440, 200)], 'Una página');
    expect(blob.type).toBe('application/pdf');
    const pdf = await PDFDocument.load(await blob.arrayBuffer());
    expect(pdf.getTitle()).toBe('Una página');
    expect(pdf.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
      [1440, 600],
      [1440, 200],
    ]);
  });

  it('keeps going with words the font cannot write', async () => {
    const blob = await buildWebPdf([part(800, 600, [['canción', 0, 0, 60, 18], ['日本語', 70, 0, 40, 18], ['🚀', 120, 0, 20, 18]])], 'x');
    expect((await PDFDocument.load(await blob.arrayBuffer())).getPageCount()).toBe(1);
  });
});
