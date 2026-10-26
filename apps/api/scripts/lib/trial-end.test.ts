import { describe, expect, it } from 'vitest';

import { endOfRomanianDay } from './trial-end';

describe('endOfRomanianDay', () => {
  it('ends the day in Romanian winter time', () => {
    expect(endOfRomanianDay('2027-01-31').toISOString()).toBe('2027-01-31T21:59:59.000Z');
  });

  it('ends the day in Romanian summer time', () => {
    expect(endOfRomanianDay('2027-07-15').toISOString()).toBe('2027-07-15T20:59:59.000Z');
  });

  it.each(['2027-02-30', '31.01.2027', ''])('refuses %s', (date) => {
    expect(() => endOfRomanianDay(date)).toThrow();
  });
});
