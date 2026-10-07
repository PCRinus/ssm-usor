import { createApp } from './app';
import type { ApiEnv } from './lib/env';
import { consumeRegenerationBatch } from './modules/documents/regeneration-queue';

const app = createApp();

export default {
  fetch: app.fetch,
  queue: (batch, env) => consumeRegenerationBatch(batch, env),
} satisfies ExportedHandler<ApiEnv['Bindings']>;
