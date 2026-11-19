import { describe, expect, it } from 'vitest';

import {
  capitalized,
  countNoun,
  countOf,
  formatCount,
  printedDate,
  uncapitalized,
} from './romanian';

describe('a printed date', () => {
  it('is day first, with dots, from a date or the date part of a timestamp', () => {
    expect(printedDate('2026-01-09')).toBe('09.01.2026');
    expect(printedDate('1990-12-31T00:00:00+00:00')).toBe('31.12.1990');
  });
});

describe('a count in words', () => {
  it('puts "de" between a number and its noun from 20 on, except 101 to 119 and the like', () => {
    const months = (count: number) => countOf(count, 'lună', 'luni');
    expect([0, 1, 2, 19, 20, 25, 100, 101, 119, 120, 1000, 1200, 1201].map(months)).toEqual([
      '0 luni',
      '1 lună',
      '2 luni',
      '19 luni',
      '20 de luni',
      '25 de luni',
      '100 de luni',
      '101 luni',
      '119 luni',
      '120 de luni',
      '1.000 de luni',
      '1.200 de luni',
      '1.201 luni',
    ]);
  });

  it('gives the noun alone, for a number shown apart', () => {
    expect([0, 1, 19, 20, 101, 120].map((count) => countNoun(count, 'post', 'posturi'))).toEqual([
      'posturi',
      'post',
      'posturi',
      'de posturi',
      'posturi',
      'de posturi',
    ]);
  });

  it('reads a negative count by its size', () => {
    expect(countOf(-20, 'credit', 'credite')).toBe('-20 de credite');
    expect(countOf(-2, 'credit', 'credite')).toBe('-2 credite');
  });
});

describe('a number as a count', () => {
  it('groups thousands with a dot and writes a fraction after a comma', () => {
    expect([0, 999, 1000, 12_345, 1_234_567, -1490, 1.5].map(formatCount)).toEqual([
      '0',
      '999',
      '1.000',
      '12.345',
      '1.234.567',
      '-1.490',
      '1,5',
    ]);
  });
});

describe('a sentence start', () => {
  it('capitalises the first letter, diacritics included, and leaves the rest', () => {
    expect(capitalized('la 3 luni')).toBe('La 3 luni');
    expect(capitalized('șapte ani')).toBe('Șapte ani');
    expect(capitalized('ține minte')).toBe('Ține minte');
    expect(capitalized('în curs')).toBe('În curs');
    expect(capitalized('Deja mare')).toBe('Deja mare');
    expect(capitalized('')).toBe('');
  });
});

describe('a phrase carried into a sentence', () => {
  it('lower-cases the first letter, diacritics included, and leaves the rest', () => {
    expect(uncapitalized('Grupa de factori')).toBe('grupa de factori');
    expect(uncapitalized('Ștergere')).toBe('ștergere');
    expect(uncapitalized('Țesător')).toBe('țesător');
    expect(uncapitalized('Încă un rând')).toBe('încă un rând');
    expect(uncapitalized('Art. 5 din Legea 319')).toBe('art. 5 din Legea 319');
    expect(uncapitalized('3 rânduri')).toBe('3 rânduri');
    expect(uncapitalized('')).toBe('');
  });
});
