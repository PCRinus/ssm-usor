import console from 'node:console';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/database.types';
import { grantSigningCodes } from './lib/grant-signing-codes';
import { localSupabase } from './lib/supabase-cli';

//   pnpm grant-signing-codes --email owner@firma.ro --codes 100 --reason "Tester, runda 1" --actor mircea
//   --local      against the local Docker stack instead of SUPABASE_URL and SUPABASE_SECRET_KEY
// Adds signing codes by SMS to the organization's current month, as for a tester at the hard stop
// (ADR 029). A paying owner at the safety cap raises the cap from the Abonament tab instead.

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    codes: { type: 'string' },
    reason: { type: 'string' },
    actor: { type: 'string' },
    local: { type: 'boolean', default: false },
  },
});

try {
  if (!values.email || !values.codes || !values.reason || !values.actor) {
    throw new Error('Pass --email, --codes, --reason and --actor.');
  }
  const { url, secret } = values.local
    ? localSupabase()
    : { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };
  if (!url || !secret) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.');

  // The secret key bypasses row-level security; it is used only here, never in the Worker.
  const client = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await grantSigningCodes(client, {
    email: values.email,
    codes: Number(values.codes),
    reason: values.reason,
    actor: values.actor,
  });
  console.log(
    `"${result.organizationName}" (${result.organizationId}) has ${result.granted} signing codes added by hand for ${result.periodStart.toISOString()} to ${result.periodEnd.toISOString()}.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
