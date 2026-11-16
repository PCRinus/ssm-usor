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

//   STRIPE_SECRET_KEY=… SUPABASE_URL=… SUPABASE_SECRET_KEY=… pnpm invoice-subtotals:backfill [--apply]
//   --apply      writes; without it, only says what it would write
//   --local      against the local Docker stack instead of SUPABASE_URL and SUPABASE_SECRET_KEY
// Fills the amount without VAT printed on the invoices recorded before it was kept, from their
// Stripe lines rebuilt as they were sent to Oblio. Stripe is only read.
// Use the Stripe key of the environment whose database it fills: test mode for non-prod.

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    local: { type: 'boolean', default: false },
  },
});

try {
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
    retrieve: async (id) => {
      try {
        const invoice = await stripe.invoices.retrieve(id);
        const lines = toPaidLines(await allLines(stripe, invoice), catalogue);
        return { total: invoice.total, printedNet: printedNetCents(lines) };
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
  console.log(
    values.apply
      ? `${filled} of ${outcomes.length} invoices without the amount now have it.`
      : `${filled} of ${outcomes.length} invoices without the amount would get it; pass --apply to write.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
