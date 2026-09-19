import console from 'node:console';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../src/database.types';
import { manifestSchema, registerTemplates } from './lib/register-templates';
import { localSupabase, secretFromCli } from './lib/supabase-cli';

// Uploads the built-in templates of packages/document-engine/templates and registers a version
// for every file that changed. Run after the migrations, on any environment:
//   pnpm templates:register          hosted project from SUPABASE_URL (apps/api/.env.seed)
//   pnpm templates:register:local    local Docker stack

const templatesUrl = new URL('../../../packages/document-engine/templates/', import.meta.url);

try {
  const local = process.argv.slice(2).includes('--local');
  const config = local
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

  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(new URL('manifest.json', templatesUrl), 'utf8'))
  );
  const ready = manifest.templates.filter((entry) => !entry.contentPending);
  const results = await registerTemplates(
    client,
    ready.map((entry) => ({
      typeKey: entry.typeKey,
      title: entry.title,
      bytes: readFileSync(new URL(entry.file, templatesUrl)),
    }))
  );
  for (const result of results) {
    console.log(`${result.typeKey}: version ${result.version}${result.created ? ' (new)' : ''}`);
  }
  const added = results.filter((result) => result.created).length;
  console.log(
    `${results.length} templates in ${new URL(config.url).hostname}, ${added} new versions; ` +
      `${manifest.templates.length - ready.length} with content pending left out.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Registering the templates failed.');
  process.exitCode = 1;
}
