import console from 'node:console';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../src/database.types';
import { seedAdmin, seedConfigSchema } from './lib/seed-admin';
import { fakeClients, fakeLeads, seedClients, seedLeads } from './lib/seed-clients';
import {
  seedDocumentData,
  seedOrganizationCompanyDetails,
  seedProfessionalTitle,
} from './lib/seed-document-data';
import { fakeEmployees, seedEmployees } from './lib/seed-employees';
import { seedInstructionModules } from './lib/seed-instruction-modules';
import { seedOrganization } from './lib/seed-organization';
import { seedProtectiveEquipment } from './lib/seed-protective-equipment';
import { localSupabase, secretFromCli } from './lib/supabase-cli';

//   pnpm seed                 hosted project from apps/api/.env.seed (admin + organization)
//   pnpm seed:local           local Docker stack, includes fake clients and employees; account from .env.seed too
//   --fake [--clients 25] [--seed 20260917]   opt in to fake data anywhere
//   --reset-password          also set SEED_ADMIN_PASSWORD on an existing seeded account

const options = z
  .object({
    local: z.boolean().default(false),
    fake: z.boolean().default(false),
    'reset-password': z.boolean().default(false),
    clients: z.coerce.number().int().min(0).max(5000).default(25),
    seed: z.coerce.number().int().min(0).default(20260917),
  })
  .parse(parseArgs(process.argv.slice(2)));

function parseArgs(args: string[]) {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const name = arg.slice(2);
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      parsed[name] = next;
      index += 1;
    } else {
      parsed[name] = true;
    }
  }
  return parsed;
}

function configFromLocalCli() {
  const local = localSupabase();
  return seedConfigSchema.parse({
    SUPABASE_URL: local.url,
    SUPABASE_SECRET_KEY: local.secret,
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD,
    SEED_ADMIN_NAME: process.env.SEED_ADMIN_NAME,
    SEED_ORGANIZATION_NAME: process.env.SEED_ORGANIZATION_NAME,
  });
}

try {
  if (process.env.NODE_ENV === 'production')
    throw new Error('The development seed cannot run with NODE_ENV=production.');
  const parsed = seedConfigSchema.safeParse(options.local ? configFromLocalCli() : process.env);
  if (!parsed.success)
    throw new Error(
      'Set a valid SUPABASE_URL, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD (at least six characters) in apps/api/.env.seed.'
    );
  const config = parsed.data;
  const secret = config.SUPABASE_SECRET_KEY ?? secretFromCli(config.SUPABASE_URL);
  const host = new URL(config.SUPABASE_URL).hostname;
  // The secret key bypasses row-level security; it is used only here, never in the Worker.
  const client = createClient<Database>(config.SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  });

  const { user, action } = await seedAdmin(
    client.auth.admin,
    config.SEED_ADMIN_EMAIL,
    config.SEED_ADMIN_PASSWORD,
    { resetPassword: options['reset-password'] }
  );
  console.log(`${action} development admin ${user.email} (${user.id}) in ${host}.`);

  const { organization } = await seedOrganization(
    client,
    config.SEED_ORGANIZATION_NAME,
    user.id,
    config.SEED_ADMIN_NAME
  );
  console.log(`Organization "${organization.name}" (${organization.id}) owned by ${user.email}.`);

  if (options.fake || options.local) {
    const rows = fakeClients(options.clients, options.seed, organization.id, user.id);
    const clients = await seedClients(client, rows);
    console.log(`Upserted ${clients.length} fake clients (seed ${options.seed}).`);
    await seedLeads(client, fakeLeads(4, options.seed, organization.id, user.id));
    console.log('Added 4 fake leads, where they were not there already.');
    const employees = fakeEmployees(clients, options.seed, organization.id, user.id);
    const employeeCount = await seedEmployees(client, employees);
    console.log(`Upserted ${employeeCount} fake employees across those clients.`);
    const filled = await seedOrganizationCompanyDetails(client, config.SEED_ADMIN_NAME);
    await seedProfessionalTitle(client, user.id);
    console.log(
      filled
        ? 'Filled in fake company details for the organization.'
        : 'Kept the company details the organization already has.'
    );
    const documentData = await seedDocumentData(client, clients, user.id);
    console.log(
      `Added ${documentData.workplaces} registered offices and ${documentData.persons} responsible persons to clients that had none.`
    );
    const equipment = await seedProtectiveEquipment(client, organization.id, user.id);
    console.log(
      `Added ${equipment.entries} equipment entries and decided ${equipment.decided} office posts need none, where undecided.`
    );
    const instructions = await seedInstructionModules(client, organization.id, user.id);
    console.log(
      `Added ${instructions.modules} instruction modules to the library, applied ${instructions.applied} to posts and decided ${instructions.decided} need none, where undecided.`
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The seed failed.');
  process.exitCode = 1;
}
