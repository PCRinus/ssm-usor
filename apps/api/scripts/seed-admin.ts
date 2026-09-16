import { execFileSync } from 'node:child_process';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { seedAdmin, seedConfigSchema } from './lib/seed-admin';

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
    throw new Error('The development admin seed cannot run with NODE_ENV=production.');
  const parsed = seedConfigSchema.safeParse(
    process.argv.includes('--local') ? configFromLocalCli() : process.env
  );
  if (!parsed.success)
    throw new Error(
      'Set a valid SUPABASE_URL, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD (at least six characters) in apps/api/.env.seed.'
    );
  const config = parsed.data;
  const secret = config.SUPABASE_SECRET_KEY ?? secretFromCli(config.SUPABASE_URL);
  const client = createClient(config.SUPABASE_URL, secret, {
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
  console.log(
    `${action} development admin ${user.email} (${user.id}) in ${new URL(config.SUPABASE_URL).hostname}.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The admin seed failed.');
  process.exitCode = 1;
}
