import { describe, expect, it } from 'vitest';
import { cleanSettings, DEFAULT_SETTINGS, defaultSize, layout, minSec, paragraphs, pixelsPerSecond, plainText, readingSeconds, scriptTitle, wordCount } from './model';

const BODY = 'Uno dos tres.\n\nCuatro cinco.\nSeis.';

describe('text', () => {
  it('drops the section lines of older scripts and keeps hashtags', () => {
    expect(plainText('# Gancho\nUno.\n\n# Cierre\nDos.')).toBe('Uno.\n\nDos.');
    expect(plainText('#ia para negocios')).toBe('#ia para negocios');
    expect(plainText('# Gancho\n\n# Desarrollo\n\n# Cierre')).toBe('');
  });

  it('names a script by how it starts', () => {
    expect(scriptTitle({ title: '', body: '# Gancho\nSi tienes un negocio…\nSegunda línea' })).toBe('Si tienes un negocio…');
    expect(scriptTitle({ title: 'Bienvenida', body: 'Hola.' })).toBe('Bienvenida');
    expect(scriptTitle({ title: '', body: '' })).toBe('Sin texto');
    expect(scriptTitle({ title: '', body: 'a'.repeat(200) })).toHaveLength(121);
  });
});

describe('reading', () => {
  it('splits the text at blank lines', () => {
    expect(paragraphs(BODY)).toEqual(['Uno dos tres.', 'Cuatro cinco.\nSeis.']);
  });

  it('counts the words that are read aloud', () => {
    expect(wordCount(BODY)).toBe(6);
    expect(wordCount('# Gancho\nHola.')).toBe(1);
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
