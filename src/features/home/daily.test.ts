import { describe, expect, it } from 'vitest';
import { dayNumber, formatQuotes, parseQuotes, pickDaily, quoteSize } from './daily';

describe('pickDaily', () => {
  const items = ['a', 'b', 'c'];

  it('returns nothing for an empty list', () => {
    expect(pickDaily([], new Date(2026, 10, 12))).toBeNull();
  });

  it('keeps the same item all day and moves to the next one at local midnight', () => {
    const morning = pickDaily(items, new Date(2026, 10, 12, 0, 0, 1));
    const night = pickDaily(items, new Date(2026, 10, 12, 23, 59, 59));
    const tomorrow = pickDaily(items, new Date(2026, 10, 13, 0, 0, 1));
    expect(night).toBe(morning);
    expect(items.indexOf(tomorrow!)).toBe((items.indexOf(morning!) + 1) % items.length);
  });

  it('goes around the whole list before repeating', () => {
    const seen = new Set([0, 1, 2].map((i) => pickDaily(items, new Date(2026, 10, 12 + i))));
    expect(seen.size).toBe(3);
    expect(pickDaily(items, new Date(2026, 10, 15))).toBe(pickDaily(items, new Date(2026, 10, 12)));
  });

  it('counts whole calendar days across a month change', () => {
    expect(dayNumber(new Date(2026, 11, 1)) - dayNumber(new Date(2026, 10, 30))).toBe(1);
  });
});

describe('parseQuotes', () => {
  it('reads one quote per line and skips blank lines', () => {
    expect(parseQuotes('Primera frase\n\n  Segunda frase  \n')).toEqual([
      { text: 'Primera frase', author: null },
      { text: 'Segunda frase', author: null },
    ]);
  });

  it('takes the author after a long dash or a spaced hyphen', () => {
    expect(parseQuotes('Confínate al presente. — Marco Aurelio')).toEqual([{ text: 'Confínate al presente.', author: 'Marco Aurelio' }]);
    expect(parseQuotes('Un solo paso - Lao Tse')).toEqual([{ text: 'Un solo paso', author: 'Lao Tse' }]);
    expect(parseQuotes('Poco tiempo–Séneca')).toEqual([{ text: 'Poco tiempo', author: 'Séneca' }]);
  });

  it('keeps hyphenated words and a trailing dash as part of the quote', () => {
    expect(parseQuotes('Un plan bien-pensado')).toEqual([{ text: 'Un plan bien-pensado', author: null }]);
    expect(parseQuotes('Sin autor —')).toEqual([{ text: 'Sin autor —', author: null }]);
  });

  it('uses the last dash when the quote has one of its own', () => {
    expect(parseQuotes('Menos — pero mejor — Dieter Rams')).toEqual([{ text: 'Menos — pero mejor', author: 'Dieter Rams' }]);
  });

  it('drops the quotation marks around a pasted quote', () => {
    expect(parseQuotes('“La calma es una decisión.” — Anónimo')).toEqual([{ text: 'La calma es una decisión.', author: 'Anónimo' }]);
  });

  it('survives a round trip through the text box', () => {
    const quotes = [
      { text: 'Confínate al presente.', author: 'Marco Aurelio' },
      { text: 'Sin autor', author: null },
    ];
    expect(parseQuotes(formatQuotes(quotes))).toEqual(quotes);
  });
});

describe('quoteSize', () => {
  it('sets longer quotes smaller', () => {
    expect(quoteSize('Confínate al presente.')).toBe('xl');
    expect(quoteSize('No es que tengamos poco tiempo, sino que perdemos mucho.')).toBe('lg');
    expect(quoteSize('x'.repeat(150))).toBe('md');
    expect(quoteSize('x'.repeat(300))).toBe('sm');
  });
});
