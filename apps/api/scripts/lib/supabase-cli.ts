import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

// Keys are captured in memory; CLI output is never echoed or written into the workspace.

export function localSupabase() {
  try {
    const output = execFileSync('supabase', ['status', '--output', 'json'], {
      cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
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
    return { url: status.API_URL, secret: status.SECRET_KEY };
  } catch {
    throw new Error(
      'Could not read local Supabase settings. Run pnpm supabase:start first (CLI 2.117.0 or newer).'
    );
  }
}

export function secretFromCli(url: string) {
  const projectRef = new URL(url).hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1];
  if (!projectRef)
    throw new Error('Set SUPABASE_SECRET_KEY when using a local or custom Supabase URL.');
  try {
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
