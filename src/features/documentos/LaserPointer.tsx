// Presenter's laser over the pages. It lives on its own canvas above them, so nothing is saved,
// exported or undone. The drawing is in laser.ts, shared with the Chrome extension.
import { useEffect, useRef, type RefObject } from 'react';
import { createLaser } from './laser';
import type { Shared } from './PdfPage';

export function LaserPointer({ scrollRef, shared }: { scrollRef: RefObject<HTMLDivElement | null>; shared: Shared }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    const canvas = canvasRef.current;
    const laser = canvas && createLaser(canvas);
    if (!scroller || !laser) return;

    const lift = () => laser.lift();

    const place = (e: PointerEvent) => {
      // Two fingers pan and zoom; with a pencil around, one finger scrolls.
      if (e.pointerType === 'touch' && (shared.penMode || shared.touches.size > 1 || shared.gesture)) return lift();
      if (e.type === 'pointerdown' && e.pointerType === 'pen') shared.onPen();
      // Only now: a laser picked with the keyboard must not hide a cursor that hasn't moved.
      if (!laser.showing) scroller.dataset.laser = '';
      const samples = e.getCoalescedEvents?.() ?? [];
      laser.move(samples.length ? samples : [e]);
    };

    const up = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') lift(); // a mouse stays where it is; a finger is gone
    };

    scroller.addEventListener('pointerdown', place);
    scroller.addEventListener('pointermove', place);
    scroller.addEventListener('pointerup', up);
    scroller.addEventListener('pointercancel', lift);
    scroller.addEventListener('pointerleave', lift);
    return () => {
      laser.dispose();
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
