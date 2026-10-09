import console from 'node:console';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { legalActs } from '@ssm-usor/document-engine/citations';
import {
  createLegislationClient,
  describeRun,
  legalActsSchema,
  type LegislationTables,
  portalOptionsFromEnv,
  runLegislationCheck,
} from '@ssm-usor/legislation-check';
import { z } from 'zod';

import type { Database } from '../src/database.types';
import { localSupabase, secretFromCli } from './lib/supabase-cli';

// apps/legislation runs the same check every morning. By hand:
//   pnpm legislation:check          hosted project from SUPABASE_URL (apps/api/.env.seed)
//   pnpm legislation:check:local    local Docker stack
// Either takes --acts <file.json>, another act list in the shape of legal-acts.json, and reads
// the portal directly unless LEGISLATION_RELAY_ORIGIN and the LEGISLATION_RELAY_CLIENT_* token name the relay.

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
// The package keeps its own copy of these tables' types; this fails when they drift apart.
const tablesMatch: Same<
  Pick<Database['public']['Tables'], keyof LegislationTables>,
  LegislationTables
> = true;
void tablesMatch;

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
  const client = createLegislationClient(config.url, config.secret ?? secretFromCli(config.url));

  const { acts } = legalActsSchema.parse(
    values.acts
      ? JSON.parse(readFileSync(path.resolve(process.env.INIT_CWD ?? '.', values.acts), 'utf8'))
      : { acts: legalActs() }
  );
  const portal = portalOptionsFromEnv(process.env);
  const run = await runLegislationCheck(client, acts, { portal });
  console.log(describeRun(run));
  console.log(
    `Checked against ${new URL(config.url).hostname}${portal.origin ? `, through ${new URL(portal.origin).hostname}` : ''}.`
  );
  // A page that could not be read fails the run, which is the alert; the others are saved.
  if (run.status === 'failed') process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Checking the legislation failed.');
  process.exitCode = 1;
}
