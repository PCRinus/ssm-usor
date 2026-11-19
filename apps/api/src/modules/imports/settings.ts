import { importErrorReasons } from '@ssm-usor/contracts';
import { createModelClient, type ModelClient } from '@ssm-usor/import';
import type { Context } from 'hono';

import type { ApiEnv, ImportQueue } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createExtractor } from '../../lib/extractor';

export function importModel(env: ApiEnv['Bindings']): ModelClient | null {
  const baseUrl = env.AI_GATEWAY_URL?.trim();
  const token = env.AI_GATEWAY_TOKEN?.trim();
  if (!baseUrl || !token) return null;
  return createModelClient({ baseUrl, token });
}

export function missingImportSettings(env: ApiEnv['Bindings']) {
  return [
    ...(importModel(env) ? [] : ['AI_GATEWAY_URL and AI_GATEWAY_TOKEN']),
    ...(createExtractor(env) ? [] : ['the extractor (EXTRACTOR or EXTRACTOR_URL)']),
    ...(env.IMPORT_QUEUE ? [] : ['IMPORT_QUEUE']),
  ];
}

export const importUnavailable = () =>
  new ApiError(
    'service_unavailable',
    'Importul din documente nu este disponibil acum.',
    undefined,
    importErrorReasons.unavailable
  );

export function requireImportService(c: Context<ApiEnv>): ImportQueue {
  const missing = missingImportSettings(c.env);
  if (missing.length > 0) {
    console.error(`Imports are not configured: missing ${missing.join(', ')}.`);
    throw importUnavailable();
  }
  return c.env.IMPORT_QUEUE!;
}
