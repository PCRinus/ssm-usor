import console from 'node:console';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createModelClient } from '@ssm-usor/import';

import type { ApiEnv } from '../src/lib/env';
import { createExtractor } from '../src/lib/extractor';
import { romanianToday } from '../src/modules/imports/employees';
import { gatewayOf, parseRunArgs, supabaseOf } from './lib/import-test-run/args';
import { runTests } from './lib/import-test-run/run';
import { databaseContext, secretClient, storageCopies } from './lib/import-test-run/supabase';

//   pnpm --filter @ssm-usor/api import:test-run --env production --kind client --limit 5
//   … --trial --yes      reads the first copy alone and prints its real tokens and cost
//   … --yes              reads every copy selected
// Reads the improvement copies of confirmed imports again with today's reading and compares
// each with what the member confirmed (ADR 037, docs/import-test-runs.md). It reads client data,
// so only Mircea runs it, from his machine.

try {
  const options = parseRunArgs(process.argv.slice(2));
  const { url, secret } = supabaseOf(options.environment, process.env);
  const admin = secretClient(url, secret);
  await runTests(options, {
    source: storageCopies(admin),
    context: databaseContext(admin),
    model: () => createModelClient(gatewayOf(process.env)),
    extractor: process.env.EXTRACTOR_URL
      ? createExtractor({ EXTRACTOR_URL: process.env.EXTRACTOR_URL } as ApiEnv['Bindings'])
      : null,
    print: (line) => console.log(line),
    repositoryRoot: resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),
    today: romanianToday(),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
