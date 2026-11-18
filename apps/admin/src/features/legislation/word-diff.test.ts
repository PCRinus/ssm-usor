import { describe, expect, it } from 'vitest';

import { type DiffSegment, wordDiff } from './word-diff';

const readBack = (segments: DiffSegment[], skip: DiffSegment['kind']) =>
  segments
    .filter((segment) => segment.kind !== skip)
    .map((segment) => segment.text)
    .join('');

describe('the word diff', () => {
  it('strikes the law’s old words and marks the new ones, as one replacement', () => {
    expect(
      wordDiff(
        'să poarte casca de protecție omologată.',
        'să poarte pe cap cască de protecție omologată pentru motocicliști.'
      )
    ).toEqual([
      { kind: 'same', text: 'să poarte ' },
      { kind: 'deleted', text: 'casca' },
      { kind: 'inserted', text: 'pe cap cască' },
      { kind: 'same', text: ' de protecție omologată' },
      { kind: 'inserted', text: ' pentru motocicliști' },
      { kind: 'same', text: '.' },
    ]);
  });

  it('marks a paragraph break added between two units, with no empty change', () => {
    expect(wordDiff('alin. (1)\nText vechi.', 'alin. (1)\n\nText nou.')).toEqual([
      { kind: 'same', text: 'alin. (1)' },
      { kind: 'inserted', text: '\n\n' },
      { kind: 'deleted', text: '\n' },
      { kind: 'same', text: 'Text ' },
      { kind: 'deleted', text: 'vechi' },
      { kind: 'inserted', text: 'nou' },
      { kind: 'same', text: '.' },
    ]);
  });

  it('marks a removed double space, with no empty change', () => {
    expect(wordDiff('a)  dublu spațiu', 'a) dublu spațiu')).toEqual([
      { kind: 'same', text: 'a)' },
      { kind: 'inserted', text: ' ' },
      { kind: 'deleted', text: '  ' },
      { kind: 'same', text: 'dublu spațiu' },
    ]);
  });

  it('keeps the line break of a line removed or added with that line', () => {
    expect(wordDiff('a) unu;\nb) doi;\nc) trei.', 'a) unu;\nc) trei.')).toEqual([
      { kind: 'same', text: 'a) unu;\n' },
      { kind: 'deleted', text: 'b) doi;\n' },
      { kind: 'same', text: 'c) trei.' },
    ]);
  });

  it('reads back as both texts exactly, whatever their words and spacing', () => {
    const words = ['a', 'b', 'de', 'la', 'ș', '(2)', '.', ',', ';', '\n', ' '];
    let seed = 1;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const text = () =>
      Array.from(
        { length: Math.floor(random() * 12) },
        () => words[Math.floor(random() * words.length)]! + (random() < 0.6 ? ' ' : '')
      ).join('');
    for (let round = 0; round < 3000; round += 1) {
      const [before, after] = [text(), text()];
      const segments = wordDiff(before, after)!;
      expect(segments.every((segment) => segment.text !== '')).toBe(true);
      expect(readBack(segments, 'inserted')).toBe(before);
      expect(readBack(segments, 'deleted')).toBe(after);
    }
  });

  it('gives up on texts too long to compare in a tab', () => {
    const long = 'cuvânt '.repeat(1100);
    expect(wordDiff(long, `${long}nou`)).toBeNull();
  });
});
