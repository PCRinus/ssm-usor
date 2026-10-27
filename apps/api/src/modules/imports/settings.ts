import { createModelClient, type ModelClient } from '@ssm-usor/import';

import type { ApiEnv } from '../../lib/env';
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
