import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { importKinds, type ImportLibraryPart, importLibraryParts } from '@ssm-usor/contracts';

import type { RunOptions } from './run';

const environments = ['non-prod', 'production'] as const;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRunArgs(args: string[], now = new Date()): RunOptions {
  const { values } = parseArgs({
    args,
    allowNegative: true,
    options: {
      env: { type: 'string' },
      import: { type: 'string', multiple: true, default: [] },
      organization: { type: 'string' },
      kind: { type: 'string' },
      part: { type: 'string', multiple: true, default: [] },
      'confirmed-only': { type: 'boolean', default: true },
      limit: { type: 'string' },
      rescan: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      trial: { type: 'boolean', default: false },
      'max-cost': { type: 'string' },
      out: { type: 'string' },
      'show-values': { type: 'boolean', default: false },
    },
  });
  const environment = values.env as RunOptions['environment'] | undefined;
  if (!environment || !environments.includes(environment)) {
    throw new Error('Pass --env non-prod or --env production.');
  }
  for (const id of [...values.import, ...(values.organization ? [values.organization] : [])]) {
    if (!uuid.test(id)) throw new Error(`Not an id: ${id}`);
  }
  const kind = values.kind ?? null;
  if (kind !== null && !(importKinds as readonly string[]).includes(kind)) {
    throw new Error(`--kind is one of ${importKinds.join(', ')}.`);
  }
  for (const part of values.part) {
    if (!(importLibraryParts as readonly string[]).includes(part)) {
      throw new Error(`--part is one of ${importLibraryParts.join(', ')}.`);
    }
  }
  const limit = values.limit === undefined ? null : Number(values.limit);
  if (limit !== null && !(Number.isInteger(limit) && limit >= 1)) {
    throw new Error('--limit is a whole number from 1.');
  }
  const maxCost = values['max-cost'] === undefined ? null : Number(values['max-cost']);
  if (maxCost !== null && !(Number.isFinite(maxCost) && maxCost > 0)) {
    throw new Error('--max-cost is a number of dollars above 0.');
  }
  if (values.yes && !values.trial && maxCost === null) {
    throw new Error('--yes spends: pass --max-cost <usd> with it, or --trial to read one copy.');
  }
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return {
    environment,
    imports: values.import,
    organization: values.organization ?? null,
    kind: kind as RunOptions['kind'],
    parts: values.part as ImportLibraryPart[],
    confirmedOnly: values['confirmed-only'],
    limit,
    rescan: values.rescan,
    yes: values.yes,
    trial: values.trial,
    maxCost,
    out: values.out ?? join(tmpdir(), `import-test-run-${environment}-${stamp}.json`),
    showValues: values['show-values'],
  };
}

// Variables of their own, not SUPABASE_URL: a run reads production only when named so, never
// because the shell kept the project another script used.
export function supabaseOf(environment: RunOptions['environment'], env: NodeJS.ProcessEnv) {
  const suffix = environment === 'production' ? 'PRODUCTION' : 'NON_PROD';
  const url = env[`IMPORT_TEST_SUPABASE_URL_${suffix}`]?.trim();
  const secret = env[`IMPORT_TEST_SUPABASE_SECRET_KEY_${suffix}`]?.trim();
  if (!url || !secret) {
    throw new Error(
      `Set IMPORT_TEST_SUPABASE_URL_${suffix} and IMPORT_TEST_SUPABASE_SECRET_KEY_${suffix}.`
    );
  }
  return { url, secret };
}

export function gatewayOf(env: NodeJS.ProcessEnv) {
  const baseUrl = env.AI_GATEWAY_URL?.trim();
  const token = env.AI_GATEWAY_TOKEN?.trim();
  if (!baseUrl || !token) throw new Error('Set AI_GATEWAY_URL and AI_GATEWAY_TOKEN to spend.');
  return { baseUrl, token };
}
