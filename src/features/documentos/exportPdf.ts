// "Descargar PDF anotado": a copy of the original with every mark drawn into its pages as
// vector graphics (any reader shows them) and the margin notes as native PDF notes.
import type { Annotation, DocAnnotations } from '@/data/types';
import { arrowHead, HIGHLIGHT_OPACITY, inkOutline, TEXT_BASELINE, TEXT_LINE, textLines } from './model';

type Matrix = [number, number, number, number, number, number];
type Pt = [number, number];

const invert = ([a, b, c, d, e, f]: number[]): Matrix => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};
const apply = ([a, b, c, d, e, f]: Matrix, [x, y]: Pt): Pt => [a * x + c * y + e, b * x + d * y + f];
const rgbOf = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * @param bytes the original PDF
 * @param transforms per page, the transform of the page shown at scale 1 (pdf.js
 *   `getViewport({ scale: 1 }).transform`): it maps PDF space to the page units marks use.
 */
export async function exportAnnotatedPdf(bytes: Uint8Array, annotations: DocAnnotations, transforms: number[][]): Promise<Blob> {
  const lib = await import('pdf-lib');
  const { PDFDocument, PDFContentStream, PDFHexString, PDFString, StandardFonts, LineCapStyle, LineJoinStyle } = lib;
  const op = lib;
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  // Helvetica only knows Latin-1-ish characters (all of Spanish); anything else becomes "?".
  const encodable = new Map<string, boolean>();
  const clean = (text: string) =>
    [...text]
      .map((ch) => {
        if (!encodable.has(ch)) {
          try {
            font.encodeText(ch);
            encodable.set(ch, true);
          } catch {
            encodable.set(ch, false);
          }
        }
        return encodable.get(ch) ? ch : '?';
      })
      .join('');

  for (const [key, marks] of Object.entries(annotations.pages ?? {})) {
    const page = pages[Number(key)];
    const t = transforms[Number(key)];
    if (!page || !t || !marks.length) continue;
    const toPdf = invert(t);

    // Shared resources of this page: the font and one translucent "multiply" state for highlights.
    const fontKey = page.node.newFontDictionary('VenaF', font.ref);
    const glow = page.node.newExtGState('VenaHL', pdf.context.obj({ Type: 'ExtGState', ca: HIGHLIGHT_OPACITY, CA: HIGHLIGHT_OPACITY, BM: 'Multiply' }));

    const ops: ReturnType<typeof op.moveTo>[] = [];
    const smoothPath = (pts: Pt[], closed: boolean) => {
      if (!pts.length) return;
      ops.push(op.moveTo(...pts[0]));
      if (pts.length === 1) {
        ops.push(op.lineTo(pts[0][0] + 0.01, pts[0][1]));
        return;
      }
      // Quadratic curves through the midpoints, as on screen, written as cubic Béziers.
      const quad = (p0: Pt, q: Pt, p1: Pt) =>
        ops.push(op.appendBezierCurve(p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1]), p1[0] + (2 / 3) * (q[0] - p1[0]), p1[1] + (2 / 3) * (q[1] - p1[1]), p1[0], p1[1]));
      const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (closed) {
        let cur = pts[0];
        for (let i = 0; i < pts.length; i++) {
          const next = mid(pts[i], pts[(i + 1) % pts.length]);
          quad(cur, pts[i], next);
          cur = next;
        }
        ops.push(op.closePath());
      } else {
        let cur = pts[0];
        for (let i = 1; i < pts.length - 1; i++) {
          const next = mid(pts[i], pts[i + 1]);
          quad(cur, pts[i], next);
          cur = next;
        }
        ops.push(op.lineTo(...pts[pts.length - 1]));
      }
    };
    const stroke = (color: string, width: number) => {
      ops.push(op.setStrokingRgbColor(...rgbOf(color)), op.setLineWidth(width), op.setLineCap(LineCapStyle.Round), op.setLineJoin(LineJoinStyle.Round));
    };
    const ellipse = (x1: number, y1: number, x2: number, y2: number) => {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const k = 0.5522847498;
      ops.push(
        op.moveTo(cx + rx, cy),
        op.appendBezierCurve(cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry),
        op.appendBezierCurve(cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy),
        op.appendBezierCurve(cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry),
        op.appendBezierCurve(cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy),
        op.closePath(),
      );
    };

    const draw = (a: Annotation) => {
      ops.push(op.pushGraphicsState());
      switch (a.type) {
        case 'ink':
          ops.push(op.setFillingRgbColor(...rgbOf(a.color)));
          smoothPath(inkOutline(a), true);
          ops.push(op.fill());
          break;
        case 'marker':
          ops.push(op.setGraphicsState(glow));
          stroke(a.color, a.width);
          smoothPath(a.points.map((p) => [p[0], p[1]] as Pt), false);
          ops.push(op.stroke());
          break;
        case 'texthl':
          ops.push(op.setGraphicsState(glow), op.setFillingRgbColor(...rgbOf(a.color)));
          for (const [x, y, w, h] of a.rects) ops.push(op.rectangle(x, y, w, h));
          ops.push(op.fill());
          break;
        case 'rect':
          stroke(a.color, a.width);
          ops.push(op.rectangle(Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.abs(a.x2 - a.x1), Math.abs(a.y2 - a.y1)), op.stroke());
          break;
        case 'ellipse':
          stroke(a.color, a.width);
          ellipse(a.x1, a.y1, a.x2, a.y2);
          ops.push(op.stroke());
          break;
        case 'line':
        case 'arrow':
          stroke(a.color, a.width);
          ops.push(op.moveTo(a.x1, a.y1), op.lineTo(a.x2, a.y2));
          if (a.type === 'arrow') {
            const [h1, h2] = arrowHead(a.x1, a.y1, a.x2, a.y2, a.width);
            ops.push(op.moveTo(...h1), op.lineTo(a.x2, a.y2), op.lineTo(...h2));
          }
          ops.push(op.stroke());
          break;
        case 'text':
          ops.push(op.beginText(), op.setFontAndSize(fontKey, a.size), op.setFillingRgbColor(...rgbOf(a.color)));
          textLines(a.text).forEach((line, i) => {
            if (!line) return;
            // The page space is flipped (y grows down), so the text matrix flips the glyphs back.
            ops.push(op.setTextMatrix(1, 0, 0, -1, a.x, a.y + a.size * (TEXT_BASELINE + i * TEXT_LINE)), op.showText(font.encodeText(clean(line))));
          });
          ops.push(op.endText());
          break;
        case 'note':
          break; // a native note, below
      }
      ops.push(op.popGraphicsState());
    };
    for (const a of marks) draw(a);

    // Keep whatever state the original content leaves behind from bending the marks.
    page.node.normalize();
    const wrap = (o: ReturnType<typeof op.pushGraphicsState>) => pdf.context.register(PDFContentStream.of(pdf.context.obj({}), [o]));
    page.node.wrapContentStreams(wrap(op.pushGraphicsState()), wrap(op.popGraphicsState()));
    page.pushOperators(op.pushGraphicsState(), op.concatTransformationMatrix(...toPdf), ...ops, op.popGraphicsState());

    for (const a of marks) {
      if (a.type !== 'note' || !a.text.trim()) continue;
      const [x, y] = apply(toPdf, [a.x, a.y]);
      const [x2, y2] = apply(toPdf, [a.x + 20, a.y + 20]);
      const note = pdf.context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [Math.min(x, x2), Math.min(y, y2), Math.max(x, x2), Math.max(y, y2)],
        Contents: PDFHexString.fromText(a.text),
        Name: 'Comment',
        C: rgbOf(a.color),
        F: 4,
        Open: false,
        M: PDFString.fromDate(new Date()),
      });
      page.node.addAnnot(pdf.context.register(note));
    }
  }

  const out = await pdf.save();
  return new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
