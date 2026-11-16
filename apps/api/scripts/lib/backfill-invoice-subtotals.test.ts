import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database.types';
import {
  type ChargedInvoice,
  planSubtotals,
  type RecordedInvoice,
  recordedInvoices,
} from './backfill-invoice-subtotals';

const accountId = 'acct_1Pfa';
const ruleSince = new Date('2026-11-16T12:00:00Z');

const invoice = (overrides: Partial<RecordedInvoice> = {}): RecordedInvoice => ({
  stripe_invoice_id: 'in_1Paid',
  stripe_account: accountId,
  amount_cents: 18029,
  storno_of: null,
  subtotal_cents: null,
  issued_at: '2026-11-17T10:00:00Z',
  ...overrides,
});

const stripeWith = (invoices: Record<string, ChargedInvoice>) =>
  vi.fn(async (id: string) => invoices[id] ?? null);

describe('the amounts without VAT of invoices recorded before they were kept', () => {
  it("takes the net printed on the invoice, and gives a storno its original's, negated", async () => {
    const retrieve = stripeWith({ in_1Paid: { total: 18029, linesNet: 14900, printedNet: 14900 } });

    const outcomes = await planSubtotals({
      rows: [
        invoice(),
        invoice({ stripe_invoice_id: 're_1Refund', amount_cents: -18029, storno_of: 'in_1Paid' }),
      ],
      accountId,
      ruleSince,
      retrieve,
    });

    expect(outcomes).toEqual([
      { id: 'in_1Paid', outcome: 'filled', by: 'oblio_split', subtotalCents: 14900 },
      { id: 're_1Refund', outcome: 'filled', by: 'storno', subtotalCents: -14900 },
    ]);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('takes the sum of the Stripe lines for an invoice issued before Oblio split any line, and its split after', async () => {
    const charged = { total: 18393, linesNet: 15200, printedNet: 15201 };
    const retrieve = stripeWith({ in_1Before: charged, in_1After: charged });

    const outcomes = await planSubtotals({
      rows: [
        invoice({
          stripe_invoice_id: 'in_1Before',
          amount_cents: 18393,
          issued_at: '2026-11-16T11:59:59Z',
        }),
        invoice({
          stripe_invoice_id: 'in_1After',
          amount_cents: 18393,
          issued_at: '2026-11-16T12:00:00Z',
        }),
        invoice({ stripe_invoice_id: 're_1Before', amount_cents: -18393, storno_of: 'in_1Before' }),
      ],
      accountId,
      ruleSince,
      retrieve,
    });

    expect(outcomes).toEqual([
      { id: 'in_1Before', outcome: 'filled', by: 'before_rule', subtotalCents: 15200 },
      { id: 'in_1After', outcome: 'filled', by: 'oblio_split', subtotalCents: 15201 },
      { id: 're_1Before', outcome: 'filled', by: 'storno', subtotalCents: -15200 },
    ]);
  });

  it('leaves an invoice that already has it alone, and still fills its storno from it', async () => {
    const retrieve = stripeWith({});

    const outcomes = await planSubtotals({
      rows: [
        invoice({ subtotal_cents: 14900 }),
        invoice({ stripe_invoice_id: 're_1Refund', amount_cents: -18029, storno_of: 'in_1Paid' }),
      ],
      accountId,
      ruleSince,
      retrieve,
    });

    expect(outcomes).toEqual([
      { id: 're_1Refund', outcome: 'filled', by: 'storno', subtotalCents: -14900 },
    ]);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('fills nothing when Stripe charged another total than the one recorded', async () => {
    const outcomes = await planSubtotals({
      rows: [
        invoice(),
        invoice({ stripe_invoice_id: 're_1Refund', amount_cents: -18029, storno_of: 'in_1Paid' }),
      ],
      accountId,
      ruleSince,
      retrieve: stripeWith({ in_1Paid: { total: 18030, linesNet: 14900, printedNet: 14900 } }),
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
      ruleSince,
      retrieve,
    });

    expect(outcomes).toEqual([
      { id: 'in_1Srl', outcome: 'other_account' },
      { id: 'in_1Gone', outcome: 'not_in_stripe' },
    ]);
    expect(retrieve).toHaveBeenCalledExactlyOnceWith('in_1Gone');
  });

  it('reads only the invoices Oblio has issued, with their issue time', async () => {
    const urls: URL[] = [];
    const client = createClient<Database>('http://db.test', 'secret', {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          urls.push(new URL(String(input)));
          return Response.json([]);
        },
      },
    });

    expect(await recordedInvoices(client)).toEqual([]);
    expect(urls[0]!.searchParams.get('issued_at')).toBe('not.is.null');
    expect(urls[0]!.searchParams.get('select')).toContain('issued_at');
  });
});
