import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { toPaidLines } from './invoices';
import type { StripeCatalogue } from './stripe';

const catalogue = {
  lookupKeys: new Map([
    ['price_credits', 'credits_extra_monthly_v2'],
    ['price_sms', 'sms_overage_monthly_v2'],
  ]),
} as unknown as StripeCatalogue;

const line = (price: string, quantity: number, amount: number) =>
  ({
    amount,
    quantity,
    description: '3 × Extra (at €1.50 / month)',
    pricing: { price_details: { price } },
    parent: { subscription_item_details: { proration: false } },
    period: { start: 1_795_000_000, end: 1_797_600_000 },
  }) as unknown as Stripe.InvoiceLineItem;

describe('the lines of a paid invoice', () => {
  it('names the extras in Romanian, by the unit they are billed in', () => {
    expect(
      toPaidLines([line('price_credits', 3, 450), line('price_sms', 37, 370)], catalogue).map(
        ({ description, unitAmount, quantity }) => [description, unitAmount, quantity]
      )
    ).toEqual([
      ['Credite AI peste cele incluse în plan, câte 100', 150, 3],
      ['SMS peste cele incluse în plan', 10, 37],
    ]);
  });
});
