import console from 'node:console';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/database.types';
import { allLines, printedNetCents, toPaidLines } from '../src/modules/billing/invoices';
import {
  createStripe,
  isStripeError,
  type StripeAccess,
  stripeCatalogue,
} from '../src/modules/billing/stripe';
import { planSubtotals, recordedInvoices, writeSubtotal } from './lib/backfill-invoice-subtotals';
import { localSupabase } from './lib/supabase-cli';

//   STRIPE_SECRET_KEY=… SUPABASE_URL=… SUPABASE_SECRET_KEY=… \
//     pnpm invoice-subtotals:backfill --rule-since 2026-11-16T12:00:00Z [--apply]
//   --rule-since when this environment started sending some lines to Oblio with their VAT
//                (commit fc6e7904a, production from release 2026.11.16); a document issued
//                before it sent every line before VAT and prints the sum of Stripe's amounts
//   --apply      writes; without it, only says what it would write
//   --local      against the local Docker stack instead of SUPABASE_URL and SUPABASE_SECRET_KEY
// Fills the amount without VAT printed on the issued invoices recorded before it was kept, from
// their Stripe lines rebuilt as they were sent to Oblio. Stripe is only read.
// Use the Stripe key of the environment whose database it fills: test mode for non-prod.
// Before --apply on production: Oblio's split of a line sent with its VAT rests on one example
// (ADR 029), and would move a cent if Oblio rounded the price before VAT first. Check the dry
// run's amount for a non-prod proforma with such lines, such as TEST-0015, against its print.

const { values } = parseArgs({
  options: {
    'rule-since': { type: 'string' },
    apply: { type: 'boolean', default: false },
    local: { type: 'boolean', default: false },
  },
});

try {
  const ruleSince = new Date(values['rule-since'] ?? '');
  if (Number.isNaN(ruleSince.getTime())) {
    throw new Error(
      'Pass --rule-since, the ISO time the VAT-included lines reached this environment.'
    );
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) throw new Error('Set STRIPE_SECRET_KEY.');
  const { url, secret } = values.local
    ? localSupabase()
    : { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };
  if (!url || !secret) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.');

  // The secret key bypasses row-level security; it is used only here, never in the Worker.
  const client = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const stripe = createStripe(stripeKey);
  const access: StripeAccess = {
    stripe,
    secretKey: stripeKey,
    livemode: /^(sk|rk)_live_/.test(stripeKey),
  };
  const catalogue = await stripeCatalogue(access);
  const outcomes = await planSubtotals({
    rows: await recordedInvoices(client),
    accountId: catalogue.accountId,
    ruleSince,
    retrieve: async (id) => {
      try {
        const invoice = await stripe.invoices.retrieve(id);
        const lines = await allLines(stripe, invoice);
        return {
          total: invoice.total,
          linesNet: lines.reduce((sum, line) => sum + line.amount, 0),
          printedNet: printedNetCents(toPaidLines(lines, catalogue)),
        };
      } catch (error) {
        if (isStripeError(error) && error.code === 'resource_missing') return null;
        throw error;
      }
    },
  });

  for (const outcome of outcomes) {
    if (outcome.outcome === 'filled' && values.apply) {
      await writeSubtotal(client, outcome.id, outcome.subtotalCents);
    }
    console.log(JSON.stringify(outcome));
  }
  const filled = outcomes.filter((outcome) => outcome.outcome === 'filled').length;
  for (const by of ['before_rule', 'oblio_split', 'storno'] as const) {
    const group = outcomes.filter((outcome) => outcome.outcome === 'filled' && outcome.by === by);
    console.log(`${by}: ${group.length} (${group.map((outcome) => outcome.id).join(', ')})`);
  }
  console.log(
    values.apply
      ? `${filled} of ${outcomes.length} invoices without the amount now have it.`
      : `${filled} of ${outcomes.length} invoices without the amount would get it; pass --apply to write.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
