// Geometry of the marks drawn over a PDF page. Everything is in page units (the page at
// scale 1, origin top-left), so the same numbers serve the screen (SVG viewBox) and the
// exported PDF.
import { getStroke } from 'perfect-freehand';
import type { Annotation, DocAnnotations, InkPoint, ShapeKind } from '@/data/types';

export type Tool = 'select' | 'pen' | 'marker' | 'texthl' | 'eraser' | 'text' | 'shape' | 'note';
export type Box = { x: number; y: number; w: number; h: number };

export const INK_COLORS = ['#1f1e1c', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#e64980', '#868e96'];
export const HIGHLIGHT_COLORS = ['#ffd43b', '#8ce99a', '#74c0fc', '#faa2c1', '#ffa94d'];
export const NOTE_COLORS = ['#ffd43b', '#faa2c1', '#74c0fc', '#8ce99a'];
export const PEN_WIDTHS = [1, 2, 3.5, 6, 10];
export const MARKER_WIDTHS = [8, 14, 20, 28];
export const SHAPE_WIDTHS = [1.5, 3, 5];
export const TEXT_SIZES = [12, 16, 22, 32];

/** Opacity of highlights (marker and text) on the white page. */
export const HIGHLIGHT_OPACITY = 0.4;
/** Text: line height and first baseline, as multiples of the font size. */
export const TEXT_LINE = 1.25;
export const TEXT_BASELINE = 0.92;
export const TEXT_FONT = 'Helvetica, Arial, sans-serif';

export type ToolStyles = {
  pen: { color: string; width: number };
  marker: { color: string; width: number };
  shape: { color: string; width: number };
  text: { color: string; size: number };
  texthl: { color: string };
  note: { color: string };
};

export const DEFAULT_STYLES: ToolStyles = {
  pen: { color: INK_COLORS[0], width: PEN_WIDTHS[1] },
  marker: { color: HIGHLIGHT_COLORS[0], width: MARKER_WIDTHS[1] },
  shape: { color: INK_COLORS[1], width: SHAPE_WIDTHS[1] },
  text: { color: INK_COLORS[0], size: TEXT_SIZES[1] },
  texthl: { color: HIGHLIGHT_COLORS[0] },
  note: { color: NOTE_COLORS[0] },
};

/** Tools that draw with the pointer (the page takes touches instead of scrolling). */
export const DRAWING_TOOLS: Tool[] = ['pen', 'marker', 'eraser', 'text', 'shape', 'note'];

export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
export const r2 = (n: number) => Math.round(n * 100) / 100;

const NO_MARKS: Annotation[] = [];

/** The marks of one page; the same array while that page is untouched. */
export function pageMarks(a: DocAnnotations, page: number): Annotation[] {
  return a.pages?.[page] ?? NO_MARKS;
}

export function withPage(a: DocAnnotations, page: number, marks: Annotation[]): DocAnnotations {
  const pages = { ...(a.pages ?? {}) };
  if (marks.length) pages[page] = marks;
  else delete pages[page];
  return { v: 1, pages };
}

export function countMarks(a: DocAnnotations): number {
  return Object.values(a.pages ?? {}).reduce((n, list) => n + list.length, 0);
}

// ---------- Strokes ----------

const penOptions = (a: Extract<Annotation, { type: 'ink' }>, last = true) => ({
  size: a.width * 1.6,
  // With a mouse or a finger the "pressure" comes from speed: keep it subtle.
  thinning: a.pressure ? 0.65 : 0.35,
  smoothing: 0.55,
  streamline: 0.45,
  simulatePressure: !a.pressure,
  last,
});

/** Filled outline of a pen stroke (polygon). */
export function inkOutline(a: Extract<Annotation, { type: 'ink' }>, last = true): [number, number][] {
  return getStroke(a.points, penOptions(a, last)) as [number, number][];
}

/** SVG path of a closed polygon with smoothed corners (perfect-freehand's recipe). */
export function polygonPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  const d = pts.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(r2(x0), r2(y0), r2((x0 + x1) / 2), r2((y0 + y1) / 2));
      return acc;
    },
    ['M', r2(pts[0][0]), r2(pts[0][1]), 'Q'],
  );
  d.push('Z');
  return d.join(' ');
}

/** Open, smoothed path through the points (highlighter). */
export function linePath(points: InkPoint[]): string {
  if (!points.length) return '';
  const [first, ...rest] = points;
  if (!rest.length) return `M ${r2(first[0])} ${r2(first[1])} L ${r2(first[0] + 0.01)} ${r2(first[1])}`;
  let d = `M ${r2(first[0])} ${r2(first[1])}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const [x, y] = rest[i];
    const [nx, ny] = rest[i + 1];
    d += ` Q ${r2(x)} ${r2(y)} ${r2((x + nx) / 2)} ${r2((y + ny) / 2)}`;
  }
  const last = rest[rest.length - 1];
  return `${d} L ${r2(last[0])} ${r2(last[1])}`;
}

/** Drops points closer than `min` to the previous one; keeps strokes light in the database. */
export function simplify(points: InkPoint[], min = 0.6): InkPoint[] {
  const round = (p: InkPoint): InkPoint => [r2(p[0]), r2(p[1]), Math.round(p[2] * 100) / 100];
  const out: InkPoint[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) >= min) out.push(round(p));
  }
  // The stroke ends where the pen lifted, even if that point was too close to keep.
  const last = points[points.length - 1];
  const kept = out[out.length - 1];
  if (last && kept && (kept[0] !== r2(last[0]) || kept[1] !== r2(last[1]))) out.push(round(last));
  return out;
}

// ---------- Shapes ----------

/** Shift: squares, circles and lines at 45° steps. */
export function constrainShape(kind: ShapeKind, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (kind === 'rect' || kind === 'ellipse') {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    return [x1 + Math.sign(dx || 1) * s, y1 + Math.sign(dy || 1) * s];
  }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return [x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len];
}

/** The two ends of an arrow head at (x2, y2). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, width: number): [[number, number], [number, number]] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.min(Math.max(10, width * 4.5), Math.hypot(x2 - x1, y2 - y1) * 0.6 || 10);
  const spread = Math.PI / 7;
  return [
    [x2 - len * Math.cos(angle - spread), y2 - len * Math.sin(angle - spread)],
    [x2 - len * Math.cos(angle + spread), y2 - len * Math.sin(angle + spread)],
  ];
}

// ---------- Text ----------

let measureCtx: CanvasRenderingContext2D | null | undefined;
export function textWidth(text: string, size: number): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  if (!measureCtx) return text.length * size * 0.55;
  measureCtx.font = `${size}px ${TEXT_FONT}`;
  return measureCtx.measureText(text).width;
}

export const textLines = (text: string) => text.split('\n');

// ---------- Boxes, hits and moves ----------

/** Note pins keep a comfortable size on screen whatever the zoom. */
export const noteSize = (zoom: number) => Math.max(18, 26 / zoom);

export function bbox(a: Annotation, zoom = 1): Box {
  switch (a.type) {
    case 'ink':
    case 'marker': {
      const xs = a.points.map((p) => p[0]);
      const ys = a.points.map((p) => p[1]);
      const pad = a.width / 2;
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
    }
    case 'rect':
    case 'ellipse':
    case 'line':
    case 'arrow': {
      const pad = a.type === 'arrow' ? Math.max(10, a.width * 4.5) / 2 + a.width : a.width / 2;
      const x = Math.min(a.x1, a.x2) - pad;
      const y = Math.min(a.y1, a.y2) - pad;
      return { x, y, w: Math.abs(a.x2 - a.x1) + pad * 2, h: Math.abs(a.y2 - a.y1) + pad * 2 };
    }
    case 'text': {
      const lines = textLines(a.text);
      const w = Math.max(a.size, ...lines.map((l) => textWidth(l, a.size)));
      return { x: a.x, y: a.y, w, h: lines.length * a.size * TEXT_LINE };
    }
    case 'texthl': {
      const x = Math.min(...a.rects.map((r) => r[0]));
      const y = Math.min(...a.rects.map((r) => r[1]));
      return { x, y, w: Math.max(...a.rects.map((r) => r[0] + r[2])) - x, h: Math.max(...a.rects.map((r) => r[1] + r[3])) - y };
    }
    case 'note': {
      const s = noteSize(zoom);
      return { x: a.x, y: a.y, w: s, h: s };
    }
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const inBox = (b: Box, x: number, y: number, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

/** Whether the point (x, y) touches the mark, with a tolerance `tol` (page units). */
export function hitTest(a: Annotation, x: number, y: number, tol: number, zoom = 1): boolean {
  switch (a.type) {
    case 'ink':
    case 'marker': {
      const reach = a.width / 2 + tol;
      if (!inBox(bbox(a), x, y, tol)) return false;
      if (a.points.length === 1) return Math.hypot(a.points[0][0] - x, a.points[0][1] - y) <= reach;
      for (let i = 1; i < a.points.length; i++) {
        const [x1, y1] = a.points[i - 1];
        const [x2, y2] = a.points[i];
        if (distToSegment(x, y, x1, y1, x2, y2) <= reach) return true;
      }
      return false;
    }
    case 'line':
    case 'arrow': {
      const reach = a.width / 2 + tol;
      if (distToSegment(x, y, a.x1, a.y1, a.x2, a.y2) <= reach) return true;
      if (a.type === 'line') return false;
      return arrowHead(a.x1, a.y1, a.x2, a.y2, a.width).some(([hx, hy]) => distToSegment(x, y, a.x2, a.y2, hx, hy) <= reach);
    }
    case 'rect': {
      const reach = a.width / 2 + tol;
      const [l, r] = [Math.min(a.x1, a.x2), Math.max(a.x1, a.x2)];
      const [t, b] = [Math.min(a.y1, a.y2), Math.max(a.y1, a.y2)];
      return (
        distToSegment(x, y, l, t, r, t) <= reach ||
        distToSegment(x, y, r, t, r, b) <= reach ||
        distToSegment(x, y, r, b, l, b) <= reach ||
        distToSegment(x, y, l, b, l, t) <= reach
      );
    }
    case 'ellipse': {
      const cx = (a.x1 + a.x2) / 2;
      const cy = (a.y1 + a.y2) / 2;
      const rx = Math.abs(a.x2 - a.x1) / 2;
      const ry = Math.abs(a.y2 - a.y1) / 2;
      if (rx < 1 || ry < 1) return distToSegment(x, y, a.x1, a.y1, a.x2, a.y2) <= a.width / 2 + tol;
      // Distance to the outline, approximated by the normalized radius.
      const k = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const angle = Math.atan2((y - cy) / ry, (x - cx) / rx);
      const ex = cx + rx * Math.cos(angle);
      const ey = cy + ry * Math.sin(angle);
      return Math.hypot(x - ex, y - ey) <= a.width / 2 + tol || (k === 0 && Math.min(rx, ry) <= tol);
    }
    case 'text':
      return inBox(bbox(a), x, y, tol);
    case 'texthl':
      return a.rects.some(([rx, ry, rw, rh]) => inBox({ x: rx, y: ry, w: rw, h: rh }, x, y, tol));
    case 'note':
      return inBox(bbox(a, zoom), x, y, tol);
  }
}

/** Topmost mark under the point. */
export function hitTop(marks: Annotation[], x: number, y: number, tol: number, zoom = 1): Annotation | null {
  for (let i = marks.length - 1; i >= 0; i--) if (hitTest(marks[i], x, y, tol, zoom)) return marks[i];
  return null;
}

export function translate(a: Annotation, dx: number, dy: number): Annotation {
  switch (a.type) {
    case 'ink':
    case 'marker':
      return { ...a, points: a.points.map(([x, y, p]) => [r2(x + dx), r2(y + dy), p] as InkPoint) };
    case 'rect':
    case 'ellipse':
    case 'line':
    case 'arrow':
      return { ...a, x1: r2(a.x1 + dx), y1: r2(a.y1 + dy), x2: r2(a.x2 + dx), y2: r2(a.y2 + dy) };
    case 'text':
    case 'note':
      return { ...a, x: r2(a.x + dx), y: r2(a.y + dy) };
    case 'texthl':
      return { ...a, rects: a.rects.map(([x, y, w, h]) => [r2(x + dx), r2(y + dy), w, h] as [number, number, number, number]) };
  }
}

// ---------- Text highlight ----------

/**
 * Joins the selection rectangles of one page into one rectangle per line: the browser
 * returns one per text run, often overlapping or with gaps between words.
 */
export function mergeLineRects(rects: Box[]): [number, number, number, number][] {
  const sorted = rects.filter((r) => r.w > 0.5 && r.h > 0.5).sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines: Box[] = [];
  for (const r of sorted) {
    const line = lines.find((l) => {
      const overlap = Math.min(l.y + l.h, r.y + r.h) - Math.max(l.y, r.y);
      return overlap > Math.min(l.h, r.h) * 0.5 && r.x <= l.x + l.w + Math.max(l.h, r.h) * 1.5 && r.x + r.w >= l.x - Math.max(l.h, r.h) * 1.5;
    });
    if (!line) {
      lines.push({ ...r });
      continue;
    }
    const x = Math.min(line.x, r.x);
    const y = Math.min(line.y, r.y);
    line.w = Math.max(line.x + line.w, r.x + r.w) - x;
    line.h = Math.max(line.y + line.h, r.y + r.h) - y;
    line.x = x;
    line.y = y;
  }
  return lines.map((l) => [r2(l.x), r2(l.y), r2(l.w), r2(l.h)]);
}
