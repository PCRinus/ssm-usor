import { describe, expect, it } from 'vitest';

import { daysUntil, endedSentence, inDaysLabel } from './subscription-copy';

describe('subscription copy', () => {
  it('counts whole days up to the end, never below zero', () => {
    const now = new Date('2026-11-20T09:00:00Z');
    expect(daysUntil('2026-11-25T10:00:00Z', now)).toBe(6);
    expect(daysUntil('2026-11-20T10:00:00Z', now)).toBe(1);
    expect(daysUntil('2026-11-19T10:00:00Z', now)).toBe(0);
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
