import { createApp } from './app';
import type { ApiEnv } from './lib/env';
import { consumeRegenerationBatch } from './modules/documents/regeneration-queue';
import { scheduledImportCleanUp } from './modules/imports/cleanup';
import { consumeImportBatch, consumeImportDeadLetters } from './modules/imports/queue';

const app = createApp();

export default {
  fetch: app.fetch,
  // One Worker consumes every queue; production's and non-production's names share a prefix.
  queue: (batch, env) => {
    if (batch.queue.startsWith('ssm-usor-import-dead-letter')) {
      return consumeImportDeadLetters(batch, env);
    }
    if (batch.queue.startsWith('ssm-usor-import')) return consumeImportBatch(batch, env);
    return consumeRegenerationBatch(batch, env);
  },
  scheduled: (_controller, env, context) => context.waitUntil(scheduledImportCleanUp(env)),
} satisfies ExportedHandler<ApiEnv['Bindings']>;
