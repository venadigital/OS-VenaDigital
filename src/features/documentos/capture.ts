// Screenshots: a region of the viewer drawn into an image, pages and marks together. Each page
// is rendered again for the image, so the result does not depend on the zoom on screen.
import { format } from 'date-fns';
import type { Annotation, DocAnnotations } from '@/data/types';
import { arrowHead, HIGHLIGHT_OPACITY, inkOutline, linePath, noteSize, pageMarks, polygonPath, TEXT_BASELINE, TEXT_FONT, TEXT_LINE, textLines } from './model';
import { MAX_CANVAS_PIXELS, type PDFPageProxy } from './pdf';

export type Rect = { left: number; top: number; width: number; height: number };

/** Where a page falls in the image, in page units. `sw`/`sh` are 0 if none of it shows. */
export type CapturePart = { index: number; ox: number; oy: number; sx: number; sy: number; sw: number; sh: number };
export type CaptureLayout = { width: number; height: number; parts: CapturePart[] };

/** Screen rectangles of the pages and of the region, turned into page units. */
export function captureLayout(pages: (Rect & { index: number })[], region: Rect, zoom: number): CaptureLayout {
  const width = region.width / zoom;
  const height = region.height / zoom;
  const parts = pages.map((p): CapturePart => {
    const ox = (p.left - region.left) / zoom;
    const oy = (p.top - region.top) / zoom;
    const sx = Math.max(0, -ox);
    const sy = Math.max(0, -oy);
    return {
      index: p.index,
      ox,
      oy,
      sx,
      sy,
      sw: Math.max(0, Math.min(p.width / zoom, width - ox) - sx),
      sh: Math.max(0, Math.min(p.height / zoom, height - oy) - sy),
    };
  });
  return { width, height, parts };
}

/** The screen rectangle holding all the given ones. */
export function boundsOf(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  return { left, top, width: Math.max(...rects.map((r) => r.left + r.width)) - left, height: Math.max(...rects.map((r) => r.top + r.height)) - top };
}

/** Where two rectangles overlap, or null. */
export function overlapOf(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const width = Math.min(a.left + a.width, b.left + b.width) - left;
  const height = Math.min(a.top + a.height, b.top + b.height) - top;
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

const DESKTOP_PIXELS = 32_000_000;
/** Above this a photo-heavy PNG could outgrow what the library accepts for one file. */
const PNG_PIXELS = 12_000_000;

/** Pixels per page unit: sharp when it fits, smaller when a whole long page wouldn't. */
export function captureScale(width: number, height: number, limit = DESKTOP_PIXELS): number {
  return Math.min(2, Math.sqrt(limit / Math.max(1, width * height)));
}

/** Draws marks onto a canvas in page units, the same way the viewer shows them. */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: Annotation[]) {
  for (const a of marks) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (a.type) {
      case 'ink':
        ctx.fillStyle = a.color;
        ctx.fill(new Path2D(polygonPath(inkOutline(a))));
        break;
      case 'marker':
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = HIGHLIGHT_OPACITY;
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width;
        ctx.stroke(new Path2D(linePath(a.points)));
        break;
      case 'texthl':
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = HIGHLIGHT_OPACITY;
        ctx.fillStyle = a.color;
        for (const [x, y, w, h] of a.rects) {
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, Math.min(2, h / 6));
          ctx.fill();
        }
        break;
      case 'rect':
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width;
        ctx.strokeRect(Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.abs(a.x2 - a.x1), Math.abs(a.y2 - a.y1));
        break;
      case 'ellipse':
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width;
        ctx.beginPath();
        ctx.ellipse((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2, Math.abs(a.x2 - a.x1) / 2, Math.abs(a.y2 - a.y1) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'line':
      case 'arrow': {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width;
        ctx.beginPath();
        ctx.moveTo(a.x1, a.y1);
        ctx.lineTo(a.x2, a.y2);
        if (a.type === 'arrow') {
          const [h1, h2] = arrowHead(a.x1, a.y1, a.x2, a.y2, a.width);
          ctx.moveTo(h1[0], h1[1]);
          ctx.lineTo(a.x2, a.y2);
          ctx.lineTo(h2[0], h2[1]);
        }
        ctx.stroke();
        break;
      }
      case 'text':
        ctx.fillStyle = a.color;
        ctx.font = `${a.size}px ${TEXT_FONT}`;
        textLines(a.text).forEach((line, i) => ctx.fillText(line, a.x, a.y + a.size * (TEXT_BASELINE + i * TEXT_LINE)));
        break;
      case 'note': {
        ctx.translate(a.x, a.y);
        const k = noteSize(1) / 24;
        ctx.scale(k, k);
        ctx.fillStyle = a.color;
        ctx.strokeStyle = 'rgb(0 0 0 / 0.28)';
        ctx.lineWidth = 1;
        const body = new Path2D('M3 2.5h18a1.5 1.5 0 0 1 1.5 1.5v11.5l-7 7H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 3 2.5Z');
        ctx.fill(body);
        ctx.stroke(body);
        const fold = new Path2D('M22.5 15.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5');
        ctx.fillStyle = 'rgb(0 0 0 / 0.08)';
        ctx.fill(fold);
        ctx.stroke(fold);
        ctx.strokeStyle = 'rgb(0 0 0 / 0.45)';
        ctx.lineWidth = 1.4;
        ctx.stroke(new Path2D('M7 8h10M7 11.5h10M7 15h5'));
        break;
      }
    }
    ctx.restore();
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('El navegador no pudo crear la imagen'))), type, quality));

function thumbnailOf(canvas: HTMLCanvasElement): string {
  const width = 360;
  const k = width / canvas.width;
  const thumb = document.createElement('canvas');
  thumb.width = width;
  thumb.height = Math.max(1, Math.round(Math.min(canvas.height * k, width * 1.2)));
  thumb.getContext('2d')?.drawImage(canvas, 0, 0, canvas.width, thumb.height / k, 0, 0, width, thumb.height);
  const url = thumb.toDataURL('image/jpeg', 0.8);
  thumb.width = thumb.height = 0;
  return url;
}

export type CaptureImage = { blob: Blob; width: number; height: number; thumbnail: string };

export async function composeCapture(layout: CaptureLayout, pages: PDFPageProxy[], marks: DocAnnotations): Promise<CaptureImage> {
  // iOS refuses large canvases.
  const limit = navigator.maxTouchPoints > 0 ? MAX_CANVAS_PIXELS : DESKTOP_PIXELS;
  const s = captureScale(layout.width, layout.height, limit);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(layout.width * s));
  canvas.height = Math.max(1, Math.round(layout.height * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo crear la imagen');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const part of layout.parts) {
    if (!part.sw || !part.sh) continue;
    const sheet = document.createElement('canvas');
    sheet.width = Math.max(1, Math.ceil(part.sw * s));
    sheet.height = Math.max(1, Math.ceil(part.sh * s));
    const viewport = pages[part.index].getViewport({ scale: s, offsetX: -part.sx * s, offsetY: -part.sy * s });
    await pages[part.index].render({ canvas: sheet, viewport }).promise;
    ctx.drawImage(sheet, Math.round((part.ox + part.sx) * s), Math.round((part.oy + part.sy) * s));
    sheet.width = sheet.height = 0;
  }
  // Marks of every page: a stroke may start on a page outside the region and cross into it.
  for (const part of layout.parts) {
    const list = pageMarks(marks, part.index);
    if (!list.length) continue;
    ctx.save();
    ctx.scale(s, s);
    ctx.translate(part.ox, part.oy);
    drawMarks(ctx, list);
    ctx.restore();
  }

  const large = canvas.width * canvas.height > PNG_PIXELS;
  const blob = await (large ? toBlob(canvas, 'image/jpeg', 0.92) : toBlob(canvas, 'image/png'));
  const image = { blob, width: canvas.width, height: canvas.height, thumbnail: thumbnailOf(canvas) };
  canvas.width = canvas.height = 0;
  return image;
}

/** File name for a capture: its name and moment, without characters that file systems refuse. */
export const captureFileName = (name: string, blob: Blob, when: Date) =>
  `${name.replace(/[/\\:*?"<>|]/g, '-')} ${format(when, 'yyyy-MM-dd HH.mm')}.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`;
