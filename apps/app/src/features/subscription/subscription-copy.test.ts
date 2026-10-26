import { describe, expect, it } from 'vitest';

import { daysUntil, endedSentence, inDaysLabel } from './subscription-copy';

describe('subscription copy', () => {
  it('counts calendar days to the end, never below zero', () => {
    const now = new Date(2026, 10, 20, 9, 0);
    expect(daysUntil(new Date(2026, 10, 25, 8, 0).toISOString(), now)).toBe(5);
    expect(daysUntil(new Date(2026, 10, 20, 23, 59).toISOString(), now)).toBe(0);
    expect(daysUntil(new Date(2026, 10, 21, 0, 30).toISOString(), now)).toBe(1);
    expect(daysUntil(new Date(2026, 10, 19, 10, 0).toISOString(), now)).toBe(0);
  });

  it('counts across a change to winter time', () => {
    expect(daysUntil(new Date(2026, 9, 26, 12).toISOString(), new Date(2026, 9, 24, 12))).toBe(2);
  });

  it.each([
    [0, 'azi'],
    [1, 'mâine'],
    [5, 'în 5 zile'],
    [19, 'în 19 zile'],
    [20, 'în 20 de zile'],
    [101, 'în 101 zile'],
  ])('says %i days as "%s"', (days, label) => {
    expect(inDaysLabel(days)).toBe(label);
  });

  it('names what ended', () => {
    const summary = {
      plan: 'profesional',
      status: 'trialing',
      trialEndsAt: '2026-11-25T10:00:00.000Z',
      accessUntil: '2026-11-25T10:00:00.000Z',
      access: 'read_only',
      deletesAt: '2026-12-25T10:00:00.000Z',
    } as const;
    expect(endedSentence(summary)).toBe('Perioada de probă s-a încheiat pe 25.11.2026.');
    expect(endedSentence({ ...summary, status: 'canceled' })).toBe(
      'Abonamentul s-a încheiat pe 25.11.2026.'
    );
  });
});
