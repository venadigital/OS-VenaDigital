import { describe, expect, it } from 'vitest';
import type { Annotation } from '@/data/types';
import { boundsOf, captureFileName, captureLayout, captureScale, overlapOf } from './capture';
import { spillMarks } from './model';

describe('captureLayout', () => {
  it('turns a region crossing two contiguous pages into page units', () => {
    const pages = [
      { index: 0, left: 100, top: 0, width: 200, height: 100 },
      { index: 1, left: 100, top: 100, width: 200, height: 100 },
      { index: 2, left: 100, top: 200, width: 200, height: 100 },
    ];
    const { width, height, parts } = captureLayout(pages, { left: 120, top: 80, width: 100, height: 40 }, 2);
    expect([width, height]).toEqual([50, 20]);
    expect(parts[0]).toEqual({ index: 0, ox: -10, oy: -40, sx: 10, sy: 40, sw: 50, sh: 10 });
    expect(parts[1]).toEqual({ index: 1, ox: -10, oy: 10, sx: 10, sy: 0, sw: 50, sh: 10 });
    expect(parts[2].sh).toBe(0);
  });

  it('leaves out a page the region does not reach sideways', () => {
    const [part] = captureLayout([{ index: 0, left: 500, top: 0, width: 100, height: 100 }], { left: 0, top: 0, width: 100, height: 100 }, 1).parts;
    expect(part.sw).toBe(0);
  });
});

describe('capture rectangles', () => {
  it('bounds all the pages', () => {
    expect(
      boundsOf([
        { left: 10, top: 0, width: 100, height: 50 },
        { left: 0, top: 66, width: 80, height: 50 },
      ]),
    ).toEqual({ left: 0, top: 0, width: 110, height: 116 });
  });

  it('finds what shows of the pages on screen', () => {
    expect(overlapOf({ left: 0, top: 0, width: 100, height: 100 }, { left: 50, top: -20, width: 100, height: 60 })).toEqual({ left: 50, top: 0, width: 50, height: 40 });
    expect(overlapOf({ left: 0, top: 0, width: 10, height: 10 }, { left: 20, top: 0, width: 10, height: 10 })).toBeNull();
  });
});

describe('captureScale', () => {
  it('stays sharp while it fits and shrinks a very long page', () => {
    expect(captureScale(800, 600)).toBe(2);
    expect(captureScale(1440, 60000, 32_000_000)).toBeCloseTo(0.61, 2);
  });
});

describe('captureFileName', () => {
  it('names by moment and type, and cleans the name', () => {
    const when = new Date(2026, 10, 4, 9, 5);
    expect(captureFileName('Web: portada/inicio', new Blob([], { type: 'image/png' }), when)).toBe('Web- portada-inicio 2026-11-04 09.05.png');
    expect(captureFileName('Larga', new Blob([], { type: 'image/jpeg' }), when)).toBe('Larga 2026-11-04 09.05.jpg');
  });
});

describe('spillMarks', () => {
  const line = (id: string, y1: number, y2: number): Annotation => ({ id, type: 'line', color: '#000', width: 2, x1: 10, y1, x2: 10, y2 });

  it('copies a stroke crossing a cut onto the next page, in its coordinates', () => {
    const out = spillMarks({ pages: { '0': [line('a', 80, 130)] } }, [100, 100, 100]);
    expect(out.pages?.['0']).toHaveLength(1);
    expect(out.pages?.['1']).toEqual([{ ...line('a', -20, 30) }]);
    expect(out.pages?.['2']).toBeUndefined();
  });

  it('follows a stroke over several pages and upwards', () => {
    const down = spillMarks({ pages: { '0': [line('a', 50, 250)] } }, [100, 100, 100]);
    expect(down.pages?.['2']).toEqual([line('a', -150, 50)]);
    const up = spillMarks({ pages: { '1': [line('b', -20, 30)] } }, [100, 100]);
    expect(up.pages?.['0']).toEqual([line('b', 80, 130)]);
  });

  it('leaves alone what stays on its page, and notes', () => {
    const note: Annotation = { id: 'n', type: 'note', color: '#ff0', x: 10, y: 95, text: 'hola' };
    const out = spillMarks({ pages: { '0': [line('a', 10, 20), note] } }, [100, 100]);
    expect(out.pages?.['0']).toHaveLength(2);
    expect(out.pages?.['1']).toBeUndefined();
  });
});
