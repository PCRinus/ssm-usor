import { describe, expect, it } from 'vitest';

import { dateToIso, formatRoDate, isoToDate, parseRoDate } from './dates';

describe('calendar dates', () => {
  it('round-trips ISO dates through local Date objects', () => {
    const date = isoToDate('2020-03-01')!;
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2020, 2, 1]);
    expect(dateToIso(date)).toBe('2020-03-01');
    expect(isoToDate('2021-02-29')).toBeUndefined();
    expect(isoToDate('1.3.2020')).toBeUndefined();
  });

  it('formats for display and parses what people type', () => {
    expect(formatRoDate('2020-03-01')).toBe('01.03.2020');
    expect(formatRoDate('')).toBe('');
    expect(parseRoDate('01.03.2020')).toBe('2020-03-01');
    expect(parseRoDate('1.3.2020')).toBe('2020-03-01');
    expect(parseRoDate(' 01/03/2020 ')).toBe('2020-03-01');
    expect(parseRoDate('01-03-2020')).toBe('2020-03-01');
  });

  it.each(['', '01.03', '31.02.2020', '2020-03-01', '01.03.20', 'azi'])('rejects %s', (text) => {
    expect(parseRoDate(text)).toBeNull();
  });
});
