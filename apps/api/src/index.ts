import { createApp } from './app';
import type { ApiEnv } from './lib/env';
import { consumeRegenerationBatch } from './modules/documents/regeneration-queue';
import { scheduledImportCleanUp } from './modules/imports/cleanup';
import { consumeImportBatch } from './modules/imports/queue';

const app = createApp();

export default {
  fetch: app.fetch,
  // One Worker consumes both queues; production's and non-production's names share a prefix.
  queue: (batch, env) =>
    batch.queue.startsWith('ssm-usor-import')
      ? consumeImportBatch(batch, env)
      : consumeRegenerationBatch(batch, env),
  scheduled: (_controller, env, context) => context.waitUntil(scheduledImportCleanUp(env)),
} satisfies ExportedHandler<ApiEnv['Bindings']>;
