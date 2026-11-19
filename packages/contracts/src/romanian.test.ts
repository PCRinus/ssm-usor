import { describe, expect, it } from 'vitest';

import { countNoun, countOf, formatCount, printedDate } from './romanian';

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
