import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import type { Annotation, DocAnnotations } from '@/data/types';
import { constrainShape, countMarks, hitTest, hitTop, mergeLineRects, pageMarks, simplify, translate, withPage } from './model';
import { exportAnnotatedPdf } from './exportPdf';

const ink: Annotation = { id: 'a', type: 'ink', color: '#000', width: 3, points: [[10, 10, 0.5], [50, 10, 0.5], [50, 50, 0.5]] };
const rect: Annotation = { id: 'b', type: 'rect', color: '#f00', width: 2, x1: 100, y1: 100, x2: 200, y2: 150 };
const text: Annotation = { id: 'c', type: 'text', color: '#000', size: 16, x: 300, y: 300, text: 'Hola\nmundo' };

describe('documentos · marcas', () => {
  it('hits a stroke near its line and misses away from it', () => {
    expect(hitTest(ink, 30, 11, 2)).toBe(true);
    expect(hitTest(ink, 30, 30, 2)).toBe(false);
  });

  it('hits a rectangle on its border, not in its empty middle', () => {
    expect(hitTest(rect, 100, 125, 2)).toBe(true);
    expect(hitTest(rect, 150, 125, 2)).toBe(false);
    expect(hitTop([ink, rect, text], 302, 305, 2)?.id).toBe('c');
  });

  it('moves every kind of mark by the same offset', () => {
    expect(translate(rect, 5, -5)).toMatchObject({ x1: 105, y1: 95, x2: 205, y2: 145 });
    expect(translate(ink, 1, 2)).toMatchObject({ points: [[11, 12, 0.5], [51, 12, 0.5], [51, 52, 0.5]] });
    expect(translate(text, -10, 0)).toMatchObject({ x: 290, y: 300 });
  });

  it('keeps strokes light but always ends where the pen lifted', () => {
    const pts = simplify([[0, 0, 0.5], [0.1, 0, 0.5], [0.2, 0, 0.5], [5, 0, 0.5], [5.1, 0, 0.5]]);
    expect(pts).toEqual([[0, 0, 0.5], [5, 0, 0.5], [5.1, 0, 0.5]]);
  });

  it('snaps shapes with shift', () => {
    expect(constrainShape('rect', 0, 0, 30, 10)).toEqual([30, 30]);
    const [x, y] = constrainShape('line', 0, 0, 100, 8);
    expect(Math.round(y)).toBe(0);
    expect(Math.round(x)).toBe(100);
  });

  it('joins the selection boxes of a line into one highlight per line', () => {
    const rects = mergeLineRects([
      { x: 10, y: 100, w: 40, h: 12 },
      { x: 52, y: 101, w: 30, h: 11 },
      { x: 10, y: 120, w: 60, h: 12 },
      { x: 0, y: 0, w: 0, h: 0 },
    ]);
    expect(rects).toEqual([
      [10, 100, 72, 12],
      [10, 120, 60, 12],
    ]);
  });

  it('stores marks per page and drops empty pages', () => {
    let a: DocAnnotations = {};
    a = withPage(a, 2, [ink]);
    a = withPage(a, 0, [rect, text]);
    expect(countMarks(a)).toBe(3);
    expect(pageMarks(a, 1)).toBe(pageMarks(a, 5)); // same empty array: untouched pages don't re-render
    a = withPage(a, 2, []);
    expect(Object.keys(a.pages ?? {})).toEqual(['0']);
  });
});

describe('documentos · PDF anotado', () => {
  it('draws the marks into a copy and adds margin notes as PDF notes', async () => {
    const src = await PDFDocument.create();
    const font = await src.embedFont(StandardFonts.Helvetica);
    src.addPage([600, 800]).drawText('Original', { x: 50, y: 700, size: 12, font });
    src.addPage([600, 800]);
    const bytes = await src.save();

    const marks: DocAnnotations = {
      v: 1,
      pages: {
        '0': [ink, rect, text, { id: 'h', type: 'texthl', color: '#ffd43b', rects: [[48, 88, 60, 14]] }],
        '1': [
          { id: 'n', type: 'note', color: '#ffd43b', x: 20, y: 20, text: 'Revisar cláusula ñ' },
          { id: 'm', type: 'marker', color: '#8ce99a', width: 14, points: [[10, 10, 0.5], [90, 12, 0.5]] },
          { id: 'e', type: 'ellipse', color: '#1971c2', width: 2, x1: 10, y1: 10, x2: 60, y2: 40 },
          { id: 'w', type: 'arrow', color: '#e03131', width: 3, x1: 10, y1: 100, x2: 80, y2: 100 },
          { id: 'x', type: 'text', color: '#000', size: 12, x: 10, y: 200, text: 'Emoji 🙂 fuera' },
        ],
      },
    };
    const flip = [1, 0, 0, -1, 0, 800];
    const blob = await exportAnnotatedPdf(bytes, marks, [flip, flip]);
    const out = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(out.getPageCount()).toBe(2);
    const annots = out.getPage(1).node.Annots();
    expect(annots?.size()).toBe(1);
    const note = out.context.lookup(annots!.get(0)) as unknown as { get: (k: PDFName) => unknown };
    expect(String(note.get(PDFName.of('Subtype')))).toBe('/Text');
    // The original page kept its content and gained the marks after it.
    expect(out.getPage(0).node.Contents()).toBeTruthy();
  });
});
