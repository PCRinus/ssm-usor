import console from 'node:console';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { discordWebhook } from '@ssm-usor/discord';
import { legalActs } from '@ssm-usor/document-engine/citations';
import { createModelClient } from '@ssm-usor/import';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../src/database.types';
import { changeFilter, readOpenChanges, readRuns } from './lib/legislation-fix/changes';
import { runLegislationFix } from './lib/legislation-fix/fix';
import { createGitHub } from './lib/legislation-fix/github';
import { gitAt, replaceQuoteTool, templatesAt } from './lib/legislation-fix/workspace';
import { localSupabase } from './lib/supabase-cli';

// legislation-fix.yml runs this every morning after production's legislation check (ADR 017):
//   pnpm legislation:fix [--change <act>[-<YYYY-MM-DD>]] [--dry-run] [--local] [--no-model]
// --dry-run applies each fix to the working tree, prints the pull request, the issues and the
// Discord payloads, then restores the templates; it pushes, opens and posts nothing, and only
// reads from GitHub when GITHUB_TOKEN is set. It still asks the model, which is paid, unless
// --no-model is given. --change answers the change again when its pull request or issue was
// closed.

const root = new URL('../../../', import.meta.url);

try {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      local: { type: 'boolean', default: false },
      change: { type: 'string' },
      'no-model': { type: 'boolean', default: false },
    },
  });
  const dryRun = values['dry-run'];
  const env = z
    .object({
      SUPABASE_URL: z.url().optional(),
      SUPABASE_SECRET_KEY: z.string().min(1).optional(),
      GITHUB_REPOSITORY: z.string().default('PCRinus/ssm-usor'),
      GITHUB_TOKEN: z.string().min(1).optional(),
      LEGISLATION_APP_TOKEN: z.string().min(1).optional(),
      AI_GATEWAY_URL: z.url().optional(),
      AI_GATEWAY_TOKEN: z.string().min(1).optional(),
      DISCORD_LEGISLATION_WEBHOOK: z.string().optional(),
      ENVIRONMENT: z.string().default('local'),
    })
    .parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value?.trim())));

  const supabase = values.local
    ? localSupabase()
    : env.SUPABASE_URL && env.SUPABASE_SECRET_KEY
      ? { url: env.SUPABASE_URL, secret: env.SUPABASE_SECRET_KEY }
      : null;
  if (!supabase) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY, or pass --local.');
  if (!dryRun && (!env.GITHUB_TOKEN || !env.LEGISLATION_APP_TOKEN)) {
    throw new Error('Set GITHUB_TOKEN and LEGISLATION_APP_TOKEN, or pass --dry-run.');
  }
  const db = createClient<Database>(supabase.url, supabase.secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const model =
    !values['no-model'] && env.AI_GATEWAY_URL && env.AI_GATEWAY_TOKEN
      ? createModelClient({ baseUrl: env.AI_GATEWAY_URL, token: env.AI_GATEWAY_TOKEN })
      : null;
  const acts = legalActs();

  const report = await runLegislationFix(
    {
      changes: () => readOpenChanges(db),
      runs: () => readRuns(db),
      templates: templatesAt(new URL('packages/document-engine/templates/', root)),
      tool: replaceQuoteTool,
      git: gitAt(root, { pushToken: env.LEGISLATION_APP_TOKEN }),
      github: env.GITHUB_TOKEN
        ? createGitHub({
            repository: env.GITHUB_REPOSITORY,
            token: env.GITHUB_TOKEN,
            appToken: env.LEGISLATION_APP_TOKEN,
          })
        : null,
      model,
      discord: discordWebhook(env.DISCORD_LEGISLATION_WEBHOOK, {
        what: 'A legislation fix notice',
      }),
      actTitle: (id) => acts.find((act) => act.id === id)?.title ?? null,
      log: (text) => console.log(text),
      now: () => Date.now(),
    },
    {
      dryRun,
      environment: env.ENVIRONMENT,
      only: changeFilter(values.change),
      redo: Boolean(values.change?.trim()),
    }
  );

  const count = (action: string) =>
    report.results.filter((result) => result.action === action).length;
  console.log(
    `\n${report.results.length} changes: ${['pull', 'issue', 'skipped', 'failed']
      .map((action) => `${count(action)} ${action}`)
      .join(
        ', '
      )}${report.stale ? '; no successful legislation check in two days' : ''}; model $${report.cost.toFixed(4)}.`
  );
  if (!model) {
    console.log(
      values['no-model']
        ? 'No model was asked: --no-model.'
        : 'No model was asked: AI_GATEWAY_URL and AI_GATEWAY_TOKEN are not set.'
    );
  }
  if (count('failed') > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The legislation fix failed.');
  process.exitCode = 1;
}
