import type { BillingExtras } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { creditsUsage, smsUsage } from '@/test/billing-fixture';

import {
  ceilingBuys,
  checkCeiling,
  creditsExtraMeter,
  extraOnLine,
  extrasLines,
  smsExtraMeter,
} from './extras-copy';

const off = { enabled: false, ceilingCents: null, limit: null, used: null, spentCents: null };

const extras = (overrides: Partial<BillingExtras> = {}): BillingExtras => ({
  unavailable: null,
  sms: { ...off },
  credits: { ...off },
  ...overrides,
});

describe('the ceiling field', () => {
  it.each([
    ['10', { ok: true, euros: 10 }],
    [' 25 € ', { ok: true, euros: 25 }],
    ['1', { ok: true, euros: 1 }],
    ['500', { ok: true, euros: 500 }],
  ])('takes %j', (text, result) => {
    expect(checkCeiling(text)).toEqual(result);
  });

  it.each([
    ['', 'Scrie plafonul lunar, în euro.'],
    ['0', 'Plafonul e de cel puțin 1 €. Ca să nu plătești nimic, lasă Extra oprit.'],
    ['501', 'Plafonul e de cel mult 500 € pe lună.'],
    ['9,50', 'Scrie o sumă în euro întregi, fără bani.'],
    ['zece', 'Scrie o sumă în euro întregi, fără bani.'],
  ])('refuses %j', (text, error) => {
    expect(checkCeiling(text)).toEqual({ ok: false, error });
  });

  it('says what a ceiling buys: codes, or whole blocks of 100 credits', () => {
    expect(ceilingBuys('sms', 10)).toBe('Până la 100 de coduri extra pe lună.');
    expect(ceilingBuys('credits', 10)).toBe(
      'Până la 600 de credite AI extra pe lună, în pachete de 100: cel mult 9 €.'
    );
    expect(ceilingBuys('credits', 1)).toBe(
      'Cu 1 € nu ajungi la 100 de credite AI, care costă 1,50 €.'
    );
  });
});

describe('a kind that is on', () => {
  it('says what was used of the ceiling, and when it was reached', () => {
    const on = { enabled: true, ceilingCents: 1000, limit: 100, used: 37, spentCents: 370 };
    expect(extraOnLine('sms', on, '2026-12-01T08:00:00.000Z')).toBe(
      '37 de coduri extra până azi: 3,70 € din 10 €.'
    );
    expect(extraOnLine('sms', { ...on, used: 0, spentCents: 0 }, null)).toBe(
      'Plafon 10 € pe lună. Nimic folosit luna aceasta.'
    );
    expect(
      extraOnLine('sms', { ...on, used: 100, spentCents: 1000 }, '2026-12-01T08:00:00.000Z')
    ).toBe('Plafon atins: 10 € din 10 €. Până pe 01.12.2026, codurile pleacă pe email.');
  });

  it('lists each kind used on the next payment, without VAT', () => {
    expect(
      extrasLines(
        extras({
          sms: { enabled: true, ceilingCents: 1000, limit: 100, used: 37, spentCents: 370 },
          credits: { enabled: true, ceilingCents: 1500, limit: 1000, used: 100, spentCents: 150 },
        })
      )
    ).toEqual([
      { label: '37 de coduri SMS extra, până azi', amountCents: 370 },
      { label: '100 de credite AI extra, până azi', amountCents: 150 },
    ]);
    expect(extrasLines(extras())).toEqual([]);
  });
});

describe('the meters with extras', () => {
  it('shows the codes past what is included as extra, with what they cost to the owner only', () => {
    const sms = smsUsage({ used: 137, included: 100, allowance: 100, overage: 37, state: 'extra' });
    const on = extras({
      sms: { enabled: true, ceilingCents: 1000, limit: 100, used: 37, spentCents: 370 },
    });
    expect(smsExtraMeter(sms, on, true)).toMatchObject({
      value: '100 + 37 extra',
      used: 137,
      limit: 200,
      ticks: [0.5],
      tone: 'over',
      hint: '37 de coduri extra până azi, 3,70 € + TVA. Plafonul e în Extra.',
    });
    expect(smsExtraMeter(sms, { ...on, sms: { ...off, enabled: true } }, false)).toMatchObject({
      value: '100 + 37 extra',
      hint: '37 de coduri extra până azi.',
    });
  });

  it('turns red at the ceiling, and points an owner with extras off to them', () => {
    const reached = smsUsage({ used: 200, included: 100, overage: 100, state: 'stopped' });
    expect(smsExtraMeter(reached, extras(), true)).toMatchObject({ tone: 'danger' });
    const used = smsUsage({ used: 100, included: 100, overage: 0, state: 'stopped' });
    expect(smsExtraMeter(used, extras(), true)).toMatchObject({ toExtra: true, tone: 'danger' });
    expect(smsExtraMeter(used, extras(), false)).toBeNull();
    expect(smsExtraMeter(used, extras({ unavailable: 'past_due' }), true)).toBeNull();
  });

  it('shows the credits bought in blocks beside those included', () => {
    const credits = creditsUsage({ used: 1300, included: 1250, extra: 100, left: 50, state: 'ok' });
    expect(
      creditsExtraMeter(
        credits,
        extras({
          credits: { enabled: true, ceilingCents: 1500, limit: 1000, used: 100, spentCents: 150 },
        }),
        true
      )
    ).toMatchObject({
      value: '1.250 + 100 extra',
      tone: 'over',
      hint: '100 de credite AI extra luna aceasta, 1,50 € + TVA. Plafonul e în Extra.',
    });
  });
});
