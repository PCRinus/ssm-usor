import { describe, expect, it } from 'vitest';

import { type DiffSegment, wordDiff } from './law-diff';

const readBack = (segments: DiffSegment[], skip: DiffSegment['kind']) =>
  segments
    .filter((segment) => segment.kind !== skip)
    .map((segment) => segment.text)
    .join('');

const helmetBefore =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.';
const helmetAfter =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.';

describe('wordDiff', () => {
  it('marks the words the law removed and those it added, each phrase as one change', () => {
    expect(wordDiff(helmetBefore, helmetAfter)).toEqual([
      {
        kind: 'same',
        text: '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte ',
      },
      { kind: 'deleted', text: 'casca' },
      { kind: 'inserted', text: 'pe cap cască' },
      { kind: 'same', text: ' de protecție omologată' },
      {
        kind: 'inserted',
        text: ' pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător',
      },
      { kind: 'same', text: '.' },
    ]);
  });

  it('reads back as the old text without the inserted words and as the new without the deleted', () => {
    const segments = wordDiff(helmetBefore, helmetAfter);
    expect(readBack(segments, 'inserted')).toBe(helmetBefore);
    expect(readBack(segments, 'deleted')).toBe(helmetAfter);
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
      const segments = wordDiff(before, after);
      expect(readBack(segments, 'inserted')).toBe(before);
      expect(readBack(segments, 'deleted')).toBe(after);
    }
  });

  it('puts no space between a replaced word and its replacement', () => {
    expect(wordDiff('termen de 30 de zile', 'termen de 60 de zile')).toEqual([
      { kind: 'same', text: 'termen de ' },
      { kind: 'deleted', text: '30' },
      { kind: 'inserted', text: '60' },
      { kind: 'same', text: ' de zile' },
    ]);
    expect(wordDiff('art. 5(2)', 'art. 5(3)')).toEqual([
      { kind: 'same', text: 'art. 5(' },
      { kind: 'deleted', text: '2' },
      { kind: 'inserted', text: '3' },
      { kind: 'same', text: ')' },
    ]);
  });

  it('marks no bare spacing as changed where the spacing stays', () => {
    expect(wordDiff('(unu doi)', '( )')).toEqual([
      { kind: 'same', text: '(' },
      { kind: 'deleted', text: 'unu' },
      { kind: 'same', text: ' ' },
      { kind: 'deleted', text: 'doi' },
      { kind: 'same', text: ')' },
    ]);
  });

  it('keeps the line break of a line removed or added with that line', () => {
    expect(wordDiff('a) unu;\nb) doi;\nc) trei.', 'a) unu;\nc) trei.')).toEqual([
      { kind: 'same', text: 'a) unu;\n' },
      { kind: 'deleted', text: 'b) doi;\n' },
      { kind: 'same', text: 'c) trei.' },
    ]);
    expect(wordDiff('a) unu;', 'a) unu;\nb) doi.')).toEqual([
      { kind: 'same', text: 'a) unu;' },
      { kind: 'inserted', text: '\nb) doi.' },
    ]);
  });

  it('keeps an unchanged text whole', () => {
    expect(wordDiff('Art. 6 rămâne.', 'Art. 6 rămâne.')).toEqual([
      { kind: 'same', text: 'Art. 6 rămâne.' },
    ]);
  });

  it('marks a whole text added or removed', () => {
    expect(wordDiff('', 'Text nou.')).toEqual([{ kind: 'inserted', text: 'Text nou.' }]);
    expect(wordDiff('Text vechi.', '')).toEqual([{ kind: 'deleted', text: 'Text vechi.' }]);
  });

  it('keeps the lines of a unit apart', () => {
    expect(wordDiff('a) unu;\nb) doi.', 'a) unu;\nb) trei.')).toEqual([
      { kind: 'same', text: 'a) unu;\nb) ' },
      { kind: 'deleted', text: 'doi' },
      { kind: 'inserted', text: 'trei' },
      { kind: 'same', text: '.' },
    ]);
  });
});
