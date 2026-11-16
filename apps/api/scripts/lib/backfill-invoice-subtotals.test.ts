import { describe, expect, it, vi } from 'vitest';

import {
  type ChargedInvoice,
  planSubtotals,
  type RecordedInvoice,
} from './backfill-invoice-subtotals';

const accountId = 'acct_1Pfa';

const invoice = (overrides: Partial<RecordedInvoice> = {}): RecordedInvoice => ({
  stripe_invoice_id: 'in_1Paid',
  stripe_account: accountId,
  amount_cents: 18029,
  storno_of: null,
  subtotal_cents: null,
  ...overrides,
});

const stripeWith = (invoices: Record<string, ChargedInvoice>) =>
  vi.fn(async (id: string) => invoices[id] ?? null);

describe('the amounts without VAT of invoices recorded before they were kept', () => {
  it("takes the net printed on the invoice, and gives a storno its original's, negated", async () => {
    const retrieve = stripeWith({ in_1Paid: { total: 18029, printedNet: 14900 } });

    const outcomes = await planSubtotals({
      rows: [
        invoice(),
        invoice({ stripe_invoice_id: 're_1Refund', amount_cents: -18029, storno_of: 'in_1Paid' }),
      ],
      accountId,
      retrieve,
    });

    expect(outcomes).toEqual([
      { id: 'in_1Paid', outcome: 'filled', subtotalCents: 14900 },
      { id: 're_1Refund', outcome: 'filled', subtotalCents: -14900 },
    ]);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('leaves an invoice that already has it alone, and still fills its storno from it', async () => {
    const retrieve = stripeWith({});

    const outcomes = await planSubtotals({
      rows: [
        invoice({ subtotal_cents: 14900 }),
        invoice({ stripe_invoice_id: 're_1Refund', amount_cents: -18029, storno_of: 'in_1Paid' }),
      ],
      accountId,
      retrieve,
    });

    expect(outcomes).toEqual([{ id: 're_1Refund', outcome: 'filled', subtotalCents: -14900 }]);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('fills nothing when Stripe charged another total than the one recorded', async () => {
    const outcomes = await planSubtotals({
      rows: [
        invoice(),
        invoice({ stripe_invoice_id: 're_1Refund', amount_cents: -18029, storno_of: 'in_1Paid' }),
      ],
      accountId,
      retrieve: stripeWith({ in_1Paid: { total: 18030, printedNet: 14900 } }),
    });

    expect(outcomes).toEqual([
      { id: 'in_1Paid', outcome: 'total_differs', stripeTotal: 18030, recorded: 18029 },
      { id: 're_1Refund', outcome: 'original_unknown' },
    ]);
  });

  it("does not ask for another account's invoices, and says which Stripe does not have", async () => {
    const retrieve = stripeWith({});

    const outcomes = await planSubtotals({
      rows: [
        invoice({ stripe_invoice_id: 'in_1Srl', stripe_account: 'acct_1Srl' }),
        invoice({ stripe_invoice_id: 'in_1Gone' }),
      ],
      accountId,
      retrieve,
    });

    expect(outcomes).toEqual([
      { id: 'in_1Srl', outcome: 'other_account' },
      { id: 'in_1Gone', outcome: 'not_in_stripe' },
    ]);
    expect(retrieve).toHaveBeenCalledExactlyOnceWith('in_1Gone');
  });
});
