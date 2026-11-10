// Presenter's laser: a red dot under the pointer and a trail that shrinks away behind it.
// It lives on its own canvas above the pages, so nothing is saved, exported or undone.
import { useEffect, useRef, type RefObject } from 'react';
import type { Shared } from './PdfPage';

type Point = { x: number; y: number; at: number };

/** How long each stretch of the trail lasts, in milliseconds. */
const TRAIL_MS = 650;
const DOT_RADIUS = 5;
const TRAIL_RADIUS = 3.2;
/** Samples closer than this add nothing, and would pile up on a fast mouse. */
const MIN_STEP = 2;
const GLOW_COLOR = 'rgba(255, 38, 38, 0.85)';
const TAU = Math.PI * 2;

/** Rounds the corners between pointer samples, so a fast sweep doesn't look like a polygon. */
function smooth(pts: Point[]): Point[] {
  if (pts.length < 3) return pts;
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, at: (a.at + b.at) / 2 });
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const corner = pts[i];
    const from = mid(pts[i - 1], corner);
    const to = mid(corner, pts[i + 1]);
    const steps = Math.max(1, Math.min(8, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 5)));
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const v = 1 - u;
      out.push({
        x: v * v * from.x + 2 * v * u * corner.x + u * u * to.x,
        y: v * v * from.y + 2 * v * u * corner.y + u * u * to.y,
        at: from.at + (to.at - from.at) * u,
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Adds a tapered stroke to the current path, as circles joined by quads. */
function traceTrail(ctx: CanvasRenderingContext2D, pts: Point[], radiusOf: (p: Point) => number) {
  pts.forEach((p, i) => {
    const r = radiusOf(p);
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, TAU);
    if (i === 0) return;
    const prev = pts[i - 1];
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const nx = -dy / length;
    const ny = dx / length;
    const q = radiusOf(prev);
    // Wound like arc(), so that under the nonzero rule the overlaps add up instead of cancelling.
    ctx.moveTo(prev.x - nx * q, prev.y - ny * q);
    ctx.lineTo(p.x - nx * r, p.y - ny * r);
    ctx.lineTo(p.x + nx * r, p.y + ny * r);
    ctx.lineTo(prev.x + nx * q, prev.y + ny * q);
    ctx.closePath();
  });
}

export function LaserPointer({ scrollRef, shared }: { scrollRef: RefObject<HTMLDivElement | null>; shared: Shared }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!scroller || !canvas || !ctx) return;

    let dpr = window.devicePixelRatio || 1;
    let frame = 0;
    let trails: Point[][] = [];
    let live: Point[] | null = null; // the trail under the pointer
    let head: { x: number; y: number } | null = null; // where the dot is; null once the pointer left

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const draw = () => {
      frame = 0;
      const now = performance.now();
      trails = trails.filter((t) => {
        while (t.length && now - t[0].at >= TRAIL_MS) t.shift();
        return t.length > 0 || t === live;
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const paths = trails.map(smooth);
      const life = (p: Point) => Math.max(0, 1 - (now - p.at) / TRAIL_MS) ** 0.8;
      const paint = (scale: number, color: string, glow = 0) => {
        ctx.beginPath();
        for (const path of paths) traceTrail(ctx, path, (p) => TRAIL_RADIUS * scale * life(p));
        if (head) {
          const r = DOT_RADIUS * scale;
          ctx.moveTo(head.x + r, head.y);
          ctx.arc(head.x, head.y, r, 0, TAU);
        }
        ctx.fillStyle = color;
        ctx.shadowColor = glow ? GLOW_COLOR : 'transparent';
        ctx.shadowBlur = glow * dpr;
        ctx.fill();
      };
      paint(2.2, 'rgba(255, 38, 38, 0.32)', 18);
      paint(1, '#ff2b2b');
      paint(0.32, '#ffc9c4');

      // A resting pointer needs no frames: only the trail animates.
      if (trails.some((t) => t.length)) schedule();
    };

    const lift = () => {
      if (!head) return;
      // Dated now, so that a dot that was resting shrinks away too.
      live?.push({ ...head, at: performance.now() });
      live = null;
      head = null;
      schedule();
    };

    const place = (e: PointerEvent) => {
      // Two fingers pan and zoom; with a pencil around, one finger scrolls.
      if (e.pointerType === 'touch' && (shared.penMode || shared.touches.size > 1 || shared.gesture)) return lift();
      if (e.type === 'pointerdown' && e.pointerType === 'pen') shared.onPen();
      // Only now: a laser picked with the keyboard must not hide a cursor that hasn't moved.
      if (!head) scroller.dataset.laser = '';
      const box = canvas.getBoundingClientRect();
      const now = performance.now();
      const samples = e.getCoalescedEvents?.() ?? [];
      for (const sample of samples.length ? samples : [e]) {
        const x = sample.clientX - box.left;
        const y = sample.clientY - box.top;
        if (!live) {
          live = [];
          trails.push(live);
        }
        const last = live[live.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) >= MIN_STEP) live.push({ x, y, at: now });
        head = { x, y };
      }
      schedule();
    };

    const up = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') lift(); // a mouse stays where it is; a finger is gone
    };

    const fit = () => {
      dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      schedule();
    };
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    scroller.addEventListener('pointerdown', place);
    scroller.addEventListener('pointermove', place);
    scroller.addEventListener('pointerup', up);
    scroller.addEventListener('pointercancel', lift);
    scroller.addEventListener('pointerleave', lift);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener('pointerdown', place);
      scroller.removeEventListener('pointermove', place);
      scroller.removeEventListener('pointerup', up);
      scroller.removeEventListener('pointercancel', lift);
      scroller.removeEventListener('pointerleave', lift);
      delete scroller.dataset.laser;
    };
  }, [scrollRef, shared]);

  return <canvas ref={canvasRef} className="doc-laser" aria-hidden />;
}
