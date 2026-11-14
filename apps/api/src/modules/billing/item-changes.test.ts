import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { itemChanges } from './service';
import type { StripeCatalogue } from './stripe';
import { priceIdOf, stripeSubscription } from './upstream.fixture';

const keys = [
  'start_monthly_v1',
  'sms_overage_monthly_v1',
  'start_500_monthly_v2',
  'sms_overage_monthly_v2',
  'credits_extra_monthly_v2',
];
const catalogue = {
  priceIds: new Map(keys.map((key) => [key, priceIdOf(key)])),
  lookupKeys: new Map(keys.map((key) => [priceIdOf(key), key])),
} as unknown as StripeCatalogue;

const target = { plan: 'start', step: 500, interval: 'month' } as const;

describe('the items of a change', () => {
  it('moves a v1 subscription to v2 with the AI credits item, keeping its SMS item', () => {
    const v1 = stripeSubscription({
      choice: target,
      lines: [
        { lookupKey: 'start_monthly_v1', quantity: 1 },
        { lookupKey: 'sms_overage_monthly_v1', quantity: undefined },
      ],
    }) as unknown as Stripe.Subscription;

    expect(itemChanges(v1, target, catalogue)).toEqual([
      { id: 'si_0', price: priceIdOf('start_500_monthly_v2'), quantity: 1 },
      { price: priceIdOf('credits_extra_monthly_v2') },
    ]);
  });

  it('adds both metered items to a subscription without them', () => {
    const bare = stripeSubscription({
      choice: target,
      lines: [{ lookupKey: 'start_monthly_v1', quantity: 1 }],
    }) as unknown as Stripe.Subscription;

    expect(itemChanges(bare, target, catalogue)).toEqual([
      { id: 'si_0', price: priceIdOf('start_500_monthly_v2'), quantity: 1 },
      { price: priceIdOf('sms_overage_monthly_v2') },
      { price: priceIdOf('credits_extra_monthly_v2') },
    ]);
  });
});
