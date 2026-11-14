import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';

import { toPaidLines } from './invoices';
import { toOblioDocument } from './oblio-documents';
import type { StripeCatalogue } from './stripe';
import { oblioTotalCents } from './upstream.fixture';

const catalogue = {
  lookupKeys: new Map([
    ['price_credits', 'credits_extra_monthly_v2'],
    ['price_sms', 'sms_overage_monthly_v2'],
  ]),
} as unknown as StripeCatalogue;

const line = (price: string, quantity: number, amount: number, tax: number, proration = false) =>
  ({
    amount,
    quantity,
    taxes: [{ amount: tax, type: 'tax_rate_details' }],
    description: '3 × Extra (at €1.50 / month)',
    pricing: { price_details: { price } },
    parent: { subscription_item_details: { proration } },
    period: { start: 1_795_000_000, end: 1_797_600_000 },
  }) as unknown as Stripe.InvoiceLineItem;

describe('the lines of a paid invoice', () => {
  it('names the extras in Romanian, by the unit they are billed in', () => {
    expect(
      toPaidLines(
        [line('price_credits', 4, 600, 126), line('price_sms', 37, 370, 78)],
        catalogue
      ).map(({ description, unitAmount, quantity }) => [description, unitAmount, quantity])
    ).toEqual([
      ['Credite AI peste cele incluse în plan, câte 100', 150, 4],
      ['SMS peste cele incluse în plan', 10, 37],
    ]);
  });
});

const organization = {
  name: 'Prevenție Activă SRL',
  cui: '12345678',
  registryNumber: null,
  countyCode: null,
  locality: null,
  addressLine: null,
  vatPayer: true,
  recipientEmail: 'facturi@example.ro',
};

function oblioTotalOf(lines: Stripe.InvoiceLineItem[], total: number) {
  const request = toOblioDocument('invoice', organization, {
    id: 'in_1Test',
    lines: toPaidLines(lines, catalogue),
    total,
    paymentReference: 'pi_1Test',
    paidAt: new Date('2026-11-15T10:00:00Z'),
  });
  return oblioTotalCents(request.payload.products);
}

function random(seed: number) {
  let state = seed;
  return (below: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % below;
  };
}

const planPrices = [3900, 4900, 5900, 7900, 14900, 19900, 39000, 49000, 78000, 149000, 199000];

// Stripe rounds the invoice's VAT once and gives each line the cent below or above its exact
// share; any such split must make the same total.
function invoiceOf(next: (below: number) => number) {
  const amounts: [string, number, number, boolean][] = [];
  const shape = next(5);
  const plan = planPrices[next(planPrices.length)]!;
  if (shape !== 3) amounts.push(['price_plan', 1, plan, false]);
  if (shape === 1 || shape === 4) {
    amounts.push(['price_plan', 1, -(1 + next(plan * 10)), true]);
    amounts.push(['price_plan', 1, 1 + next(plan * 12), true]);
  }
  if (shape >= 2) {
    const codes = 1 + next(600);
    const blocks = 1 + next(40);
    if (next(2)) amounts.push(['price_sms', codes, codes * 10, false]);
    amounts.push(['price_credits', blocks, blocks * 150, false]);
  }
  const lines = amounts.map(([price, quantity, amount, proration]) => {
    const exact = (amount * 21) / 100;
    const tax = next(2) ? Math.floor(exact) : Math.ceil(exact);
    return line(price, quantity, amount, tax, proration);
  });
  const total = lines.reduce((sum, item) => sum + item.amount + item.taxes![0]!.amount, 0);
  return { lines, total };
}

describe('the total of the Oblio document', () => {
  it('is what Stripe charged for the proration that Oblio once made a cent short', () => {
    const lines = [
      line('price_plan', 1, -142017, -29823, true),
      line('price_plan', 1, 170420, 35788, true),
    ];

    expect(oblioTotalOf(lines, 34368)).toBe(34368);
  });

  it('keeps the price before VAT, and the quantity, of a line whose VAT Oblio rounds as Stripe did', () => {
    const [plan, sms] = toPaidLines(
      [line('price_plan', 1, 78000, 16380), line('price_sms', 7, 70, 15)],
      catalogue
    );

    expect(plan).toMatchObject({ unitAmount: 78000, quantity: 1, vatIncluded: false });
    expect(sms).toMatchObject({ unitAmount: 10, quantity: 7, vatIncluded: false });
  });

  it('sends a line whose VAT Stripe rounded the other way with its VAT, as one unit', () => {
    const [sms, credit] = toPaidLines(
      [line('price_sms', 7, 70, 14), line('price_plan', 1, -142017, -29823, true)],
      catalogue
    );

    expect(sms).toMatchObject({ unitAmount: 84, quantity: 1, vatIncluded: true });
    expect(credit).toMatchObject({ unitAmount: 171840, quantity: -1, vatIncluded: true });
  });

  it('says what a line sent as one unit was counted in', () => {
    const request = toOblioDocument('invoice', organization, {
      id: 'in_1Test',
      lines: toPaidLines([line('price_sms', 7, 70, 14)], catalogue),
      total: 84,
      paymentReference: 'pi_1Test',
      paidAt: new Date('2026-11-15T10:00:00Z'),
    });

    expect(request.payload.products[0]).toMatchObject({
      name: 'SMS peste cele incluse în plan',
      description: expect.stringMatching(/^7 × 0,10 € fără TVA\. Perioada /),
      price: 0.84,
      quantity: 1,
      vatIncluded: 1,
    });
  });

  it('sends a line whose VAT is exactly half a cent with its VAT, whichever way Stripe rounded it', () => {
    for (const tax of [10, 11]) {
      const [sms] = toPaidLines([line('price_sms', 5, 50, tax)], catalogue);

      expect(sms).toMatchObject({ unitAmount: 50 + tax, quantity: 1, vatIncluded: true });
    }
  });

  it('is what Stripe charged, for thousands of invoices of every shape', () => {
    const next = random(2026);
    for (let run = 0; run < 5000; run++) {
      const { lines, total } = invoiceOf(next);
      if (total <= 0) continue;
      expect(
        oblioTotalOf(lines, total),
        JSON.stringify(lines.map((l) => [l.amount, l.taxes]))
      ).toBe(total);
    }
  });

  it('prints each line before VAT within a cent of Stripe', () => {
    const next = random(29);
    for (let run = 0; run < 2000; run++) {
      const { lines } = invoiceOf(next);
      for (const [index, paid] of toPaidLines(lines, catalogue).entries()) {
        const value = paid.unitAmount * paid.quantity;
        const net = paid.vatIncluded ? Math.round((value * 100) / 121) : value;
        expect(Math.abs(net - lines[index]!.amount)).toBeLessThanOrEqual(1);
      }
    }
  });
});
