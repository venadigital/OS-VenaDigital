import { describe, expect, it } from 'vitest';
import {
  cleanSettings,
  DEFAULT_SETTINGS,
  defaultSize,
  layout,
  mergeSectionUp,
  minSec,
  NEW_SCRIPT_BODY,
  paragraphs,
  parseSections,
  pixelsPerSecond,
  readingSeconds,
  serializeSections,
  wordCount,
} from './model';

const BODY = ['# Gancho', 'Uno dos tres.', '', 'Cuatro cinco.', '', '# Cierre', 'Seis.'].join('\n');

describe('sections', () => {
  it('splits a script at its headings', () => {
    expect(parseSections(BODY)).toEqual([
      { name: 'Gancho', text: 'Uno dos tres.\n\nCuatro cinco.' },
      { name: 'Cierre', text: 'Seis.' },
    ]);
  });

  it('keeps text before the first heading as a section without a name', () => {
    expect(parseSections('Hola.\n# Cierre\nAdiós.')).toEqual([
      { name: '', text: 'Hola.' },
      { name: 'Cierre', text: 'Adiós.' },
    ]);
  });

  it('does not take a hashtag for a heading', () => {
    expect(parseSections('#ia para negocios')).toEqual([{ name: '', text: '#ia para negocios' }]);
  });

  it('always has a section to write in', () => {
    expect(parseSections('')).toEqual([{ name: '', text: '' }]);
  });

  it('keeps the empty sections of a new script', () => {
    expect(parseSections(NEW_SCRIPT_BODY).map((s) => s.name)).toEqual(['Gancho', 'Desarrollo', 'Cierre']);
  });

  it('writes back what it read', () => {
    expect(serializeSections(parseSections(BODY))).toBe(BODY);
    expect(serializeSections(parseSections(NEW_SCRIPT_BODY))).toBe(NEW_SCRIPT_BODY);
    expect(serializeSections([{ name: '', text: ' Hola. ' }])).toBe('Hola.');
    expect(serializeSections([{ name: '', text: '' }])).toBe('');
  });

  it('gives a heading to a later section without a name, so it stays apart', () => {
    const body = serializeSections([
      { name: 'Gancho', text: 'Uno.' },
      { name: '', text: 'Dos.' },
    ]);
    expect(parseSections(body)).toHaveLength(2);
  });

  it('removes a heading without losing its text', () => {
    expect(mergeSectionUp(parseSections(BODY), 1)).toEqual([{ name: 'Gancho', text: 'Uno dos tres.\n\nCuatro cinco.\n\nSeis.' }]);
    expect(mergeSectionUp(parseSections(BODY), 0)[0]).toEqual({ name: '', text: 'Uno dos tres.\n\nCuatro cinco.' });
  });
});

describe('reading', () => {
  it('lists the paragraphs, naming the section on its first one', () => {
    expect(paragraphs(BODY)).toEqual([
      { section: 'Gancho', text: 'Uno dos tres.' },
      { section: null, text: 'Cuatro cinco.' },
      { section: 'Cierre', text: 'Seis.' },
    ]);
  });

  it('counts only the words that are read aloud', () => {
    expect(wordCount(BODY)).toBe(6);
    expect(wordCount(NEW_SCRIPT_BODY)).toBe(0);
  });

  it('estimates the time from the pace', () => {
    expect(readingSeconds(Array(150).fill('palabra').join(' '), 150)).toBe(60);
    expect(readingSeconds(Array(150).fill('palabra').join(' '), 100)).toBe(90);
    expect(minSec(65)).toBe('1:05');
    expect(minSec(0)).toBe('0:00');
  });

  it('scrolls the whole text in the time the pace asks for', () => {
    // 300 words at 150 wpm are 120 s: 2400 px of text move at 20 px/s.
    expect(pixelsPerSecond(150, 300, 2400)).toBe(20);
    expect(pixelsPerSecond(150, 0, 2400)).toBe(0);
  });
});

describe('reading screen', () => {
  it('centres the column under a camera on top', () => {
    expect(layout('top', 1440, 900)).toEqual({ left: 290, width: 860, lineY: 117, dock: 'top' });
  });

  it('puts the column against the side the camera is on, at eye level', () => {
    const left = layout('left', 1440, 900);
    const right = layout('right', 1440, 900);
    expect(left.left).toBe(86);
    expect(right.left + right.width).toBe(1440 - 86);
    expect(left.lineY).toBe(333);
  });

  it('only fits the text on top of a narrow screen', () => {
    expect(layout('left', 390, 844)).toEqual({ left: 48, width: 294, lineY: 110, dock: 'top' });
  });

  it('repairs stored settings', () => {
    expect(cleanSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings({ wpm: 9000, size: 'grande', dock: 'abajo', mirror: 1 })).toEqual({ wpm: 260, size: 56, dock: 'top', mirror: false });
    expect(cleanSettings({ wpm: 120, size: 40, dock: 'right', mirror: true })).toEqual({ wpm: 120, size: 40, dock: 'right', mirror: true });
  });

  it('starts with smaller letters on a phone, until a size is chosen', () => {
    expect(defaultSize(390)).toBe(32);
    expect(defaultSize(1440)).toBe(56);
    expect(cleanSettings(null, 32).size).toBe(32);
    expect(cleanSettings({ size: 44 }, 32).size).toBe(44);
  });
});
