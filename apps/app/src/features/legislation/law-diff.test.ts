import { describe, expect, it } from 'vitest';

import { wordDiff } from './law-diff';

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
      { kind: 'same', text: ' ' },
      { kind: 'inserted', text: 'pe cap cască' },
      { kind: 'same', text: ' de protecție omologată ' },
      {
        kind: 'inserted',
        text: 'pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător',
      },
      { kind: 'same', text: '.' },
    ]);
  });

  it('reads back as the old text without the inserted words and as the new without the deleted', () => {
    const segments = wordDiff(helmetBefore, helmetAfter);
    const read = (skip: string) =>
      segments
        .filter((segment) => segment.kind !== skip)
        .map((segment) => segment.text)
        .join('')
        .replace(/\s+/g, ' ')
        .replace(/ ([.,])/g, '$1');
    expect(read('inserted')).toBe(helmetBefore);
    expect(read('deleted')).toBe(helmetAfter);
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
      { kind: 'same', text: ' ' },
      { kind: 'inserted', text: 'trei' },
      { kind: 'same', text: '.' },
    ]);
  });
});
