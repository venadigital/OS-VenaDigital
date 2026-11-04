import { describe, expect, it } from 'vitest';
import { bandFor, chooseTarget, frameOffsets, friendlyError, scaleFor, scrollFor, stretchHeight } from './lib.js';

const frame = (frameId, over = {}) => ({
  frameId,
  vw: 1000,
  vh: 700,
  doc: { scrollable: 0, width: 1000, height: 700 },
  inner: null,
  iframes: [],
  ...over,
});

describe('frameOffsets', () => {
  it('finds a frame by its address, and the frames inside it', () => {
    const frames = [
      frame(0, { iframes: [{ left: 0, top: 40, width: 1000, height: 660, src: 'https://a.test/x' }] }),
      frame(5, { vh: 660, iframes: [{ left: 10, top: 20, width: 900, height: 600, src: 'https://b.test/y' }] }),
      frame(9, { vw: 900, vh: 600 }),
    ];
    const nav = [
      { frameId: 0, parentFrameId: -1, url: 'https://claude.ai/' },
      { frameId: 5, parentFrameId: 0, url: 'https://a.test/x' },
      { frameId: 9, parentFrameId: 5, url: 'https://b.test/y' },
    ];
    const at = frameOffsets(frames, nav);
    expect(at.get(5)).toEqual({ x: 0, y: 40 });
    expect(at.get(9)).toEqual({ x: 10, y: 60 });
  });

  it('falls back to the size when the address changed after loading', () => {
    const frames = [frame(0, { iframes: [{ left: 0, top: 40, width: 1000, height: 660, src: 'https://a.test/old' }] }), frame(5, { vh: 660 })];
    const at = frameOffsets(frames, [
      { frameId: 0, parentFrameId: -1, url: 'https://claude.ai/' },
      { frameId: 5, parentFrameId: 0, url: 'https://a.test/new' },
    ]);
    expect(at.get(5)).toEqual({ x: 0, y: 40 });
  });

  it('leaves out a frame it cannot place', () => {
    const at = frameOffsets([frame(0), frame(5, { vw: 300, vh: 200 })], [
      { frameId: 0, parentFrameId: -1, url: 'https://x.test/' },
      { frameId: 5, parentFrameId: 0, url: 'https://ad.test/' },
    ]);
    expect(at.has(5)).toBe(false);
    expect(at.has(0)).toBe(true);
  });
});

describe('chooseTarget', () => {
  const offsets = new Map([
    [0, { x: 0, y: 0 }],
    [5, { x: 0, y: 40 }],
  ]);

  it('takes the document of a normal page', () => {
    const f = [frame(0, { doc: { scrollable: 5000, width: 1000, height: 700 } })];
    expect(chooseTarget(f, offsets, 1000, 700)).toEqual({ frameId: 0, kind: 'document' });
  });

  it('takes the frame when the page is a bar and a frame, like a Claude artifact', () => {
    const f = [frame(0), frame(5, { vh: 660, doc: { scrollable: 4000, width: 1000, height: 660 } })];
    expect(chooseTarget(f, offsets, 1000, 700)).toEqual({ frameId: 5, kind: 'document' });
  });

  it('takes the main panel when the document barely moves', () => {
    const f = [
      frame(0, {
        doc: { scrollable: 60, width: 1000, height: 700 },
        inner: { scrollable: 6000, left: 250, top: 60, width: 750, height: 640 },
      }),
    ];
    expect(chooseTarget(f, offsets, 1000, 700)).toEqual({ frameId: 0, kind: 'element' });
  });

  it('ignores a small scroller, even a long one', () => {
    const f = [
      frame(0, {
        doc: { scrollable: 2000, width: 1000, height: 700 },
        inner: { scrollable: 90000, left: 0, top: 0, width: 200, height: 200 },
      }),
    ];
    expect(chooseTarget(f, offsets, 1000, 700)).toEqual({ frameId: 0, kind: 'document' });
  });

  it('stays on the document when nothing scrolls', () => {
    expect(chooseTarget([frame(0)], offsets, 1000, 700)).toEqual({ frameId: 0, kind: 'document' });
  });
});

describe('stretches', () => {
  it('keeps the middle of the screen', () => {
    expect(bandFor(900)).toEqual({ height: 600, margin: 150 });
    expect(bandFor(660)).toEqual({ height: 440, margin: 110 });
  });

  it('starts at the top of the page and ends where the page ends', () => {
    expect(scrollFor(0, 150)).toBe(0);
    expect(scrollFor(600, 150)).toBe(450);
    expect(stretchHeight(600, 600, 2000)).toBe(600);
    expect(stretchHeight(1800, 600, 2000)).toBe(200);
  });

  it('gives up sharpness on very long pages', () => {
    expect([scaleFor(8000), scaleFor(20_000), scaleFor(50_000)]).toEqual([2, 1.5, 1]);
  });
});

describe('friendlyError', () => {
  it('explains the failures that have an explanation', () => {
    expect(friendlyError(new Error('Cannot access a chrome:// URL'))).toMatch(/no deja/);
    expect(friendlyError(new Error('The extensions gallery cannot be scripted.'))).toMatch(/no deja/);
    expect(friendlyError(new Error('No tab with id: 4'))).toMatch(/cambió/);
    expect(friendlyError(new Error('rara'))).toBe('No se pudo capturar esta página.');
  });
});
