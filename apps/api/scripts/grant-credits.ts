import console from 'node:console';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/database.types';
import { grantCredits } from './lib/grant-credits';
import { localSupabase } from './lib/supabase-cli';

//   pnpm grant-credits --email owner@firma.ro --credits 500 --reason "A rămas fără credite" --actor mircea
//   --local      against the local Docker stack instead of SUPABASE_URL and SUPABASE_SECRET_KEY
// Adds import credits to the organization's current month, for anyone who runs out until credits
// can be bought (ADR 030).

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    credits: { type: 'string' },
    reason: { type: 'string' },
    actor: { type: 'string' },
    local: { type: 'boolean', default: false },
  },
});

try {
  if (!values.email || !values.credits || !values.reason || !values.actor) {
    throw new Error('Pass --email, --credits, --reason and --actor.');
  }
  const { url, secret } = values.local
    ? localSupabase()
    : { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };
  if (!url || !secret) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.');

  // The secret key bypasses row-level security; it is used only here, never in the Worker.
  const client = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await grantCredits(client, {
    email: values.email,
    credits: Number(values.credits),
    reason: values.reason,
    actor: values.actor,
  });
  console.log(
    `"${result.organizationName}" (${result.organizationId}) has ${values.credits} credits added for ${result.periodStart.toISOString()} to ${result.periodEnd.toISOString()}; the month's balance is ${result.balance}.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
