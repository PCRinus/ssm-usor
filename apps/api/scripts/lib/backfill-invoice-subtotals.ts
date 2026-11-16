import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/database.types';

export type RecordedInvoice = Pick<
  Database['public']['Tables']['billing_invoices']['Row'],
  | 'stripe_invoice_id'
  | 'stripe_account'
  | 'amount_cents'
  | 'storno_of'
  | 'subtotal_cents'
  | 'issued_at'
>;

// `linesNet` is the sum of Stripe's line amounts, what a document issued before the rule that
// sends some lines with their VAT printed; `printedNet` is `printedNetCents` of today's lines.
export type ChargedInvoice = { total: number; linesNet: number; printedNet: number };

// Which way the amount was worked out: `before_rule` from the Stripe lines as sent then,
// `oblio_split` with Oblio's split of the lines sent with their VAT, `storno` from the original.
export type FilledBy = 'before_rule' | 'oblio_split' | 'storno';

export type BackfillOutcome =
  | { id: string; outcome: 'filled'; by: FilledBy; subtotalCents: number }
  | { id: string; outcome: 'other_account' | 'not_in_stripe' | 'original_unknown' }
  | { id: string; outcome: 'total_differs'; stripeTotal: number; recorded: number };

export type BackfillDeps = {
  rows: RecordedInvoice[];
  accountId: string;
  // When the rule that sends some lines to Oblio with their VAT was deployed here.
  ruleSince: Date;
  // Null when Stripe has no such invoice.
  retrieve: (stripeInvoiceId: string) => Promise<ChargedInvoice | null>;
};

// An invoice whose Stripe total is not the amount recorded is left alone: its lines would belong
// to some other charge.
export async function planSubtotals({
  rows,
  accountId,
  ruleSince,
  retrieve,
}: BackfillDeps): Promise<BackfillOutcome[]> {
  const known = new Map<string, number>();
  for (const row of rows) {
    if (row.subtotal_cents !== null) known.set(row.stripe_invoice_id, row.subtotal_cents);
  }
  const outcomes: BackfillOutcome[] = [];
  const missing = rows.filter((row) => row.subtotal_cents === null);

  for (const row of missing.filter((candidate) => candidate.storno_of === null)) {
    const id = row.stripe_invoice_id;
    if (row.stripe_account !== accountId) {
      outcomes.push({ id, outcome: 'other_account' });
      continue;
    }
    const charged = await retrieve(id);
    if (!charged) {
      outcomes.push({ id, outcome: 'not_in_stripe' });
    } else if (charged.total !== row.amount_cents) {
      outcomes.push({
        id,
        outcome: 'total_differs',
        stripeTotal: charged.total,
        recorded: row.amount_cents,
      });
    } else {
      const beforeRule = Date.parse(row.issued_at!) < ruleSince.getTime();
      const net = beforeRule ? charged.linesNet : charged.printedNet;
      known.set(id, net);
      outcomes.push({
        id,
        outcome: 'filled',
        by: beforeRule ? 'before_rule' : 'oblio_split',
        subtotalCents: net,
      });
    }
  }

  for (const row of missing.filter((candidate) => candidate.storno_of !== null)) {
    const id = row.stripe_invoice_id;
    const original = known.get(row.storno_of!);
    outcomes.push(
      original === undefined
        ? { id, outcome: 'original_unknown' }
        : { id, outcome: 'filled', by: 'storno', subtotalCents: -original }
    );
  }
  return outcomes;
}

const pageSize = 500;

export async function recordedInvoices(client: SupabaseClient<Database>) {
  const rows: RecordedInvoice[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('billing_invoices')
      .select(
        'stripe_invoice_id, stripe_account, amount_cents, storno_of, subtotal_cents, issued_at'
      )
      .not('issued_at', 'is', null)
      .order('created_at')
      .order('stripe_invoice_id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Reading the invoices failed: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function writeSubtotal(
  client: SupabaseClient<Database>,
  stripeInvoiceId: string,
  subtotalCents: number
) {
  const { error } = await client
    .from('billing_invoices')
    .update({ subtotal_cents: subtotalCents })
    .eq('stripe_invoice_id', stripeInvoiceId)
    .is('subtotal_cents', null);
  if (error) throw new Error(`Writing ${stripeInvoiceId} failed: ${error.message}`);
}
