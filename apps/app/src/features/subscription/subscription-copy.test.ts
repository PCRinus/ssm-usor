import type { SubscriptionSummary } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  barFor,
  daysLeftLabel,
  daysUntil,
  endedSentence,
  inDaysLabel,
  sealFor,
} from './subscription-copy';

const now = new Date(2026, 9, 26, 9, 0);
const at = (days: number) => new Date(2026, 9, 26 + days, 22, 0).toISOString();

const trial = (days: number): SubscriptionSummary => ({
  plan: 'profesional',
  status: 'trialing',
  trialEndsAt: at(days),
  accessUntil: at(days),
  access: 'full',
  deletesAt: null,
});

describe('subscription copy', () => {
  it('counts calendar days to the end, never below zero', () => {
    const morning = new Date(2026, 10, 20, 9, 0);
    expect(daysUntil(new Date(2026, 10, 25, 8, 0).toISOString(), morning)).toBe(5);
    expect(daysUntil(new Date(2026, 10, 20, 23, 59).toISOString(), morning)).toBe(0);
    expect(daysUntil(new Date(2026, 10, 21, 0, 30).toISOString(), morning)).toBe(1);
    expect(daysUntil(new Date(2026, 10, 19, 10, 0).toISOString(), morning)).toBe(0);
  });

  it('counts across a change to winter time', () => {
    expect(daysUntil(new Date(2026, 9, 26, 12).toISOString(), new Date(2026, 9, 24, 12))).toBe(2);
  });

  it.each([
    [0, 'azi', 'azi'],
    [1, 'mâine', 'mâine'],
    [5, 'în 5 zile', '5 zile'],
    [19, 'în 19 zile', '19 zile'],
    [20, 'în 20 de zile', '20 de zile'],
    [101, 'în 101 zile', '101 zile'],
  ])('says %i days as "%s" and "%s"', (days, inDays, left) => {
    expect(inDaysLabel(days)).toBe(inDays);
    expect(daysLeftLabel(days)).toBe(left);
  });

  it('names what ended', () => {
    const ended = { ...trial(-2), access: 'read_only', deletesAt: at(28) } as const;
    expect(endedSentence(ended)).toMatch(/^Perioada de probă s-a încheiat pe \d\d\.\d\d\.2026\.$/);
    expect(endedSentence({ ...ended, status: 'canceled' })).toMatch(/^Abonamentul s-a încheiat/);
  });
});

describe('the seal', () => {
  it('counts down a trial', () => {
    expect(sealFor(trial(20), now)).toEqual({
      kind: 'trial',
      label: 'Probă · 20 de zile',
      attention: false,
    });
    expect(sealFor(trial(1), now).label).toBe('Probă · mâine');
  });

  it('names the plan once paid, and marks a failed renewal', () => {
    const paid = { ...trial(0), status: 'active', trialEndsAt: null, accessUntil: null } as const;
    expect(sealFor({ ...paid, plan: 'start' }, now)).toEqual({
      kind: 'start',
      label: 'Start',
      attention: false,
    });
    expect(sealFor({ ...paid, status: 'past_due', accessUntil: at(14) }, now)).toEqual({
      kind: 'profesional',
      label: 'Profesional',
      attention: true,
    });
  });

  it('says read-only above everything else', () => {
    expect(sealFor({ ...trial(-1), access: 'read_only' }, now).kind).toBe('readOnly');
  });
});

describe('the bar', () => {
  it('stays away until the last 7 days of a trial', () => {
    expect(barFor(trial(8), now)).toBeNull();
    expect(barFor(trial(7), now)).toMatchObject({ kind: 'trial', closable: true });
  });

  it('cannot be closed on the last day', () => {
    expect(barFor(trial(1), now)).toMatchObject({
      lead: 'Perioada de probă se încheie mâine.',
      closable: false,
    });
  });

  it('shows a failed renewal and read-only access, never closable, and nothing for a paid plan', () => {
    const paid = { ...trial(0), status: 'active', trialEndsAt: null, accessUntil: null } as const;
    expect(barFor(paid, now)).toBeNull();
    expect(barFor({ ...paid, status: 'past_due', accessUntil: at(14) }, now)).toMatchObject({
      kind: 'pastDue',
      closable: false,
    });
    expect(barFor({ ...trial(-1), access: 'read_only', deletesAt: at(29) }, now)).toMatchObject({
      kind: 'readOnly',
      closable: false,
    });
  });
});
