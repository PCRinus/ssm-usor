import console from 'node:console';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../src/database.types';
import { checkLegislation, legalActsSchema, summarize } from './lib/legislation/check';
import { localSupabase, secretFromCli } from './lib/supabase-cli';

// Run daily by .github/workflows/legislation.yml, or by hand:
//   pnpm legislation:check          hosted project from SUPABASE_URL (apps/api/.env.seed)
//   pnpm legislation:check:local    local Docker stack
// Either takes --acts <file.json>, another act list in the shape of legal-acts.json.

const actsUrl = new URL(
  '../../../packages/document-engine/templates/legal-acts.json',
  import.meta.url
);

try {
  const { values } = parseArgs({
    options: { local: { type: 'boolean', default: false }, acts: { type: 'string' } },
  });
  const config = values.local
    ? localSupabase()
    : z
        .object({ SUPABASE_URL: z.url(), SUPABASE_SECRET_KEY: z.string().min(1).optional() })
        .transform((value) => ({ url: value.SUPABASE_URL, secret: value.SUPABASE_SECRET_KEY }))
        .parse(process.env);
  const secret = config.secret ?? secretFromCli(config.url);
  // The secret key bypasses row-level security; it is used only here, never in the Worker.
  const client = createClient<Database>(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    },
  });

  const source = values.acts ? path.resolve(process.env.INIT_CWD ?? '.', values.acts) : actsUrl;
  const { acts } = legalActsSchema.parse(JSON.parse(readFileSync(source, 'utf8')));
  const outcomes = await checkLegislation(client, acts);
  console.log(summarize(outcomes));
  console.log(`Checked against ${new URL(config.url).hostname}.`);
  // A page that could not be read fails the run, which is the alert; the others are saved.
  if (outcomes.some((outcome) => outcome.result === 'failed')) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Checking the legislation failed.');
  process.exitCode = 1;
}
