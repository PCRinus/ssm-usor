import console from 'node:console';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { manifestEntries, templatesUrl } from '@ssm-usor/document-engine/template-store';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../src/database.types';
import { manifestEntrySchema, registerTemplates } from './lib/register-templates';
import { localSupabase, secretFromCli } from './lib/supabase-cli';

// Run after the migrations, on any environment:
//   pnpm templates:register          hosted project from SUPABASE_URL (apps/api/.env.seed)
//   pnpm templates:register:local    local Docker stack

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

  const templates = manifestEntries().map((stored) => {
    const parsed = manifestEntrySchema.safeParse(stored);
    if (!parsed.success) {
      throw new Error(
        `The manifest entry of ${stored.path} is not valid:\n${z.prettifyError(parsed.error)}`
      );
    }
    const entry = parsed.data;
    return {
      typeKey: entry.typeKey,
      title: entry.title,
      bytes: readFileSync(new URL(stored.path, templatesUrl)),
      kind: entry.change.kind,
      note: entry.change.note,
      resolves: entry.change.resolves,
    };
  });
  const byType = new Map(templates.map((template) => [template.typeKey, template]));
  const results = await registerTemplates(client, templates);
  for (const result of results) {
    const template = byType.get(result.typeKey)!;
    const resolves = template.resolves?.map((each) => `${each.act} ${each.consolidatedOn}`);
    const created = result.created
      ? ` (new, ${template.kind}${resolves?.length ? `, resolves ${resolves.join(', ')}` : ''})`
      : '';
    console.log(`${result.typeKey}: version ${result.version}${created}`);
  }
  const added = results.filter((result) => result.created).length;
  console.log(
    `${results.length} templates in ${new URL(config.url).hostname}, ${added} new versions.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Registering the templates failed.');
  process.exitCode = 1;
}
