import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../src/database.types';
import { seedAdmin, seedConfigSchema } from './lib/seed-admin';
import { fakeClients, seedClients } from './lib/seed-clients';
import { seedOrganization } from './lib/seed-organization';

// Development seed: the admin user, its organization, and optionally fake clients.
//   pnpm seed                 hosted project from apps/api/.env.seed (admin + organization)
//   pnpm seed:local           local Docker stack, includes fake clients
//   --fake [--clients 25] [--seed 20260917]   opt in to fake data anywhere

const options = z
  .object({
    local: z.boolean().default(false),
    fake: z.boolean().default(false),
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
  try {
    const output = execFileSync('supabase', ['status', '--output', 'json'], {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    const status = z
      .object({
        API_URL: z.url().refine((value) => {
          const url = new URL(value);
          return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
        }),
        SECRET_KEY: z.string().startsWith('sb_secret_'),
      })
      .parse(JSON.parse(output));
    // Local mode deliberately ignores hosted environment settings and credentials.
    return seedConfigSchema.parse({
      SUPABASE_URL: status.API_URL,
      SUPABASE_SECRET_KEY: status.SECRET_KEY,
    });
  } catch {
    throw new Error(
      'Could not read local Supabase settings. Run pnpm supabase:start first (CLI 2.117.0 or newer).'
    );
  }
}

function secretFromCli(url: string) {
  const projectRef = new URL(url).hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1];
  if (!projectRef)
    throw new Error('Set SUPABASE_SECRET_KEY when using a local or custom Supabase URL.');
  try {
    // Capture keys in memory; never echo CLI output or write keys into the workspace.
    const output = execFileSync(
      'supabase',
      ['projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output', 'json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }
    );
    const keys = z.array(z.object({ api_key: z.string() })).parse(JSON.parse(output));
    const secret = keys.find((key) => key.api_key.startsWith('sb_secret_'))?.api_key;
    if (!secret) throw new Error('No secret key returned.');
    return secret;
  } catch {
    throw new Error(
      'Could not read the project secret key through the Supabase CLI. Run supabase login or set SUPABASE_SECRET_KEY for this script.'
    );
  }
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
    config.SEED_ADMIN_PASSWORD
  );
  console.log(`${action} development admin ${user.email} (${user.id}) in ${host}.`);

  const { organization } = await seedOrganization(client, config.SEED_ORGANIZATION_NAME, user.id);
  console.log(`Organization "${organization.name}" (${organization.id}) owned by ${user.email}.`);

  // Fake data is opt-in on hosted projects; the local stack always gets it.
  if (options.fake || options.local) {
    const rows = fakeClients(options.clients, options.seed, organization.id, user.id);
    const count = await seedClients(client, rows);
    console.log(`Upserted ${count} fake clients (seed ${options.seed}).`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The seed failed.');
  process.exitCode = 1;
}
