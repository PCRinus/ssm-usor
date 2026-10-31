import { describe, expect, it } from 'vitest';

import { formatDate, formatTenure, roCount } from './employee-format';

describe('employee formatting', () => {
  it('formats ISO dates in Romanian', () => {
    expect(formatDate('2020-03-01')).toBe('1 mar. 2020');
  });

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
    [0, '0 invitații'],
    [1, '1 invitație'],
    [19, '19 invitații'],
    [20, '20 de invitații'],
    [101, '101 invitații'],
    [100, '100 de invitații'],
    [1000, '1000 de invitații'],
  ])('counts %i with the noun Romanian takes', (value, expected) => {
    expect(roCount(value, 'invitație', 'invitații')).toBe(expected);
  });
});
