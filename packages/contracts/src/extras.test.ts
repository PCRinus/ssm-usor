import { describe, expect, it } from 'vitest';

import { cataloguePrices } from './billing';
import { extraCreditsWithin, extraUnitsWithin, setExtraRequestSchema } from './index';

describe('extras', () => {
  it('buys whole codes at 0,10 € within the ceiling', () => {
    expect(extraUnitsWithin('sms', 1000)).toBe(100);
    expect(extraUnitsWithin('sms', 100)).toBe(10);
  });

  it('buys whole blocks of 100 credits at 1,50 €, never past the ceiling', () => {
    expect(extraUnitsWithin('credits', 1000)).toBe(6);
    expect(extraCreditsWithin(1000)).toBe(600);
    expect(extraCreditsWithin(300)).toBe(200);
    expect(extraCreditsWithin(100)).toBe(0);
    expect(extraCreditsWithin(50_000)).toBe(33_300);
  });

  it('takes a ceiling of whole euro from 1 to 500, or none to turn it off', () => {
    expect(setExtraRequestSchema.safeParse({ ceilingEuros: 1 }).success).toBe(true);
    expect(setExtraRequestSchema.safeParse({ ceilingEuros: 500 }).success).toBe(true);
    expect(setExtraRequestSchema.safeParse({ ceilingEuros: null }).success).toBe(true);
    expect(setExtraRequestSchema.safeParse({ ceilingEuros: 0 }).success).toBe(false);
    expect(setExtraRequestSchema.safeParse({ ceilingEuros: 501 }).success).toBe(false);
    expect(setExtraRequestSchema.safeParse({ ceilingEuros: 9.5 }).success).toBe(false);
  });

  it('prices both extras monthly and metered, on every plan', () => {
    const metered = cataloguePrices.filter((price) => price.usage === 'metered');
    expect(
      metered.map(({ lookupKey, interval, unitAmount }) => [lookupKey, interval, unitAmount])
    ).toEqual([
      ['sms_overage_monthly_v2', 'month', 10],
      ['credits_extra_monthly_v2', 'month', 150],
    ]);
  });
});
