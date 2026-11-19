import { describe, expect, it } from 'vitest';

import { formatTenure, workerNoun } from './employee-format';

describe('employee formatting', () => {
  it.each([
    ['2026-09-01', '2026-09-18', 'sub o lună'],
    ['2026-08-18', '2026-09-18', '1 lună'],
    ['2026-03-20', '2026-09-18', '5 luni'],
    ['2025-09-18', '2026-09-18', '1 an'],
    ['2020-03-01', '2026-09-18', '6 ani și 6 luni'],
    ['2006-09-18', '2026-09-18', '20 de ani'],
    ['2003-08-18', '2026-09-18', '23 de ani și 1 lună'],
  ])('computes tenure from %s to %s', (from, to, expected) => {
    expect(formatTenure(from, to)).toBe(expected);
  });

  it.each([
    [0, '0 lucrători'],
    [1, '1 lucrător'],
    [2, '2 lucrători'],
    [19, '19 lucrători'],
    [20, '20 de lucrători'],
    [101, '101 lucrători'],
    [120, '120 de lucrători'],
    [1500, '1.500 de lucrători'],
  ])('counts %i workers as %s', (count, text) => {
    expect(workerNoun(count)).toBe(text);
  });
});
