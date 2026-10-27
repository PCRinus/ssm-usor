import { describe, expect, it } from 'vitest';

import { billingPlans, cataloguePrices, catalogueProducts, priceVersion } from './billing';

describe('plan catalogue', () => {
  it('gives every price its own versioned lookup key', () => {
    const keys = cataloguePrices.map((price) => price.lookupKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(new RegExp(`^[a-z0-9_]+_(monthly|annual)_${priceVersion}$`));
    }
  });

  it('prices every product it lists, and lists every product it prices', () => {
    expect(new Set(cataloguePrices.map((price) => price.product))).toEqual(
      new Set(catalogueProducts.map((product) => product.key))
    );
  });

  it('charges ten months for a year', () => {
    for (const price of cataloguePrices.filter((price) => price.interval === 'year')) {
      const monthly = cataloguePrices.find(
        (other) => other.product === price.product && other.interval === 'month'
      );
      expect(price.unitAmount).toBe(monthly!.unitAmount * 10);
    }
    expect(billingPlans.start.prices.year.unitAmount).toBe(39000);
  });

  it('bills extra SMS monthly by metered usage, and nothing else', () => {
    expect(cataloguePrices.filter((price) => price.usage === 'metered')).toEqual([
      expect.objectContaining({ lookupKey: 'sms_overage_monthly_v1', interval: 'month' }),
    ]);
  });
});
