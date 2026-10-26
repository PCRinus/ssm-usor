import console from 'node:console';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/database.types';
import { localSupabase } from './lib/supabase-cli';
import { endOfRomanianDay } from './lib/trial-end';

//   pnpm extend-trial --email owner@firma.ro --until 2027-01-31 --reason "Tester, runda 1" --actor mircea
//   --local   against the local Docker stack instead of SUPABASE_URL and SUPABASE_SECRET_KEY
// Until the admin area exists (#611), this is how a tester's trial gets a later end (ADR 029).

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    until: { type: 'string' },
    reason: { type: 'string' },
    actor: { type: 'string' },
    local: { type: 'boolean', default: false },
  },
});

try {
  if (!values.email || !values.until || !values.reason || !values.actor) {
    throw new Error('Pass --email, --until (YYYY-MM-DD), --reason and --actor.');
  }
  const until = endOfRomanianDay(values.until);
  const { url, secret } = values.local
    ? localSupabase()
    : { url: process.env.SUPABASE_URL, secret: process.env.SUPABASE_SECRET_KEY };
  if (!url || !secret) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY.');

  // The secret key bypasses row-level security; it is used only here, never in the Worker.
  const client = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.rpc('extend_trial', {
    p_owner_email: values.email,
    p_until: until.toISOString(),
    p_reason: values.reason,
    p_actor: values.actor,
  });
  if (error) {
    const known: Record<string, string> = {
      TRL01: `No organization has an owner with the email ${values.email}.`,
      TRL02: 'That organization pays for a plan; its trial is over.',
      TRL03: 'The new end must be in the future.',
      TRL04: "The new end must be later than the trial's current end; a trial is never shortened.",
      TRL05: `More than one owner has the email ${values.email}; nothing was changed.`,
      '22023': 'Give a reason of at least three characters, and who runs this.',
    };
    throw new Error(known[error.code] ?? `${error.code}: ${error.message}`);
  }
  const row = data[0]!;
  console.log(
    row.started
      ? `"${row.organization_name}" (${row.organization_id}) had no subscription and now starts a trial that ends ${row.trial_ends_at}.`
      : `The trial of "${row.organization_name}" (${row.organization_id}) now ends ${row.trial_ends_at}.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
