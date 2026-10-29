import { describe, expect, it } from 'vitest';

import { type DiffRun, diffTokens, spellingDiff } from './spelling-diff';

const marked = (runs: DiffRun[]) => runs.filter((run) => run.changed).map((run) => run.text);

const joined = (runs: DiffRun[]) => runs.map((run) => run.text).join('');

describe('splitting a value into words and separators', () => {
  it('keeps letters with their diacritics, digits and combining marks in one word', () => {
    expect(diffTokens('Șef tură 2, deșeuri (Pașune); etc.')).toEqual([
      'Șef',
      ' ',
      'tură',
      ' ',
      '2',
      ', ',
      'deșeuri',
      ' (',
      'Pașune',
      '); ',
      'etc',
      '.',
    ]);
  });

  it('gives no tokens for an empty value', () => {
    expect(diffTokens('')).toEqual([]);
  });
});

describe('marking the words the spelling correction changed', () => {
  it('marks a word whose case changed, whole', () => {
    const diff = spellingDiff('Îngrijitor hotel etaj', 'Îngrijitor HOTEL etaj');
    expect(diff.value).toEqual([
      { text: 'Îngrijitor ', changed: false },
      { text: 'hotel', changed: true },
      { text: ' etaj', changed: false },
    ]);
    expect(diff.written).toEqual([
      { text: 'Îngrijitor ', changed: false },
      { text: 'HOTEL', changed: true },
      { text: ' etaj', changed: false },
    ]);
  });

  it('marks a word that gained a diacritic, whole', () => {
    const diff = spellingDiff('deșeuri menajere și hârtie', 'deseuri menajere si hartie');
    expect(marked(diff.value)).toEqual(['deșeuri', 'și', 'hârtie']);
    expect(marked(diff.written)).toEqual(['deseuri', 'si', 'hartie']);
  });

  it('marks changed separators along with the words around them', () => {
    const diff = spellingDiff('resturi de mâncare, produse', 'resturi de mancare,produse');
    expect(marked(diff.value)).toEqual(['mâncare, ']);
    expect(marked(diff.written)).toEqual(['mancare,']);
  });

  it('marks nothing in identical values', () => {
    expect(spellingDiff('În curte', 'În curte')).toEqual({
      value: [{ text: 'În curte', changed: false }],
      written: [{ text: 'În curte', changed: false }],
    });
  });

  it('copes with an empty side', () => {
    expect(spellingDiff('', '')).toEqual({ value: [], written: [] });
    expect(spellingDiff('Atelier', '')).toEqual({
      value: [{ text: 'Atelier', changed: true }],
      written: [],
    });
  });

  it('gives back both values whole and keeps the unchanged words in line', () => {
    const value =
      'deșeuri de carton, hârtie, plastic; deșeuri menajere; deșeuri alimentare (resturi de mâncare, produse expirate etc); deșeuri periculoase (detergenți, produse de curățenie, ulei uzat); deșeuri din activitatea hotelieră (textile deteriorate)';
    const written =
      'deșeuri de carton, hârtie, plastic; deseuri menajere; deseuri alimentare (resturi de mancare,produse expirate etc; deseuri periculoase (detergenti,produse de curatenie,ulei uzat; deșeuri din activitatea hotelieră (textile deteriorate)';
    const diff = spellingDiff(value, written);
    expect(joined(diff.value)).toBe(value);
    expect(joined(diff.written)).toBe(written);
    expect(marked(diff.value)).toEqual([
      'deșeuri',
      'deșeuri',
      'mâncare, ',
      '); deșeuri',
      'detergenți, ',
      'curățenie, ',
      '); ',
    ]);
    expect(marked(diff.written)).toEqual([
      'deseuri',
      'deseuri',
      'mancare,',
      '; deseuri',
      'detergenti,',
      'curatenie,',
      '; ',
    ]);
  });
});
