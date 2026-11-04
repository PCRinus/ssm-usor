import { WorkerEntrypoint } from 'cloudflare:workers';

import { createAdminApp } from './admin-app';
import { createApp } from './app';
import type { ApiEnv } from './lib/env';
import { consumeRegenerationBatch } from './modules/documents/regeneration-queue';
import { scheduledImportCleanUp } from './modules/imports/cleanup';
import { consumeImportBatch, consumeImportDeadLetters } from './modules/imports/queue';
import { scheduledOverageReports } from './modules/sms-usage/overage';

const app = createApp();
const adminApp = createAdminApp();

// Reached only by the admin Worker's service binding, never from the internet (ADR 038).
export class Admin extends WorkerEntrypoint<ApiEnv['Bindings']> {
  override fetch(request: Request) {
    return adminApp.fetch(request, this.env, this.ctx);
  }
}

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
  scheduled: (_controller, env, context) =>
    context.waitUntil(
      Promise.allSettled([scheduledImportCleanUp(env), scheduledOverageReports(env)])
    ),
} satisfies ExportedHandler<ApiEnv['Bindings']>;
