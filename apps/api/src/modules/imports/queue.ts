import { z } from 'zod';

import { adminClient } from '../../lib/admin-db';
import { timedFetch } from '../../lib/db';
import type { ApiEnv, ImportMessage } from '../../lib/env';
import { createExtractor } from '../../lib/extractor';
import { adminFileStore } from '../../lib/files';
import { lookupCompany } from '../companies/anaf';
import {
  afterPreparing,
  checkImport,
  copyFolder,
  describe,
  failedPatch,
  fileFailureReason,
  importFailureReason,
  isTransient,
  type PipelineDeps,
  prepareFile,
  readImport,
  scanFile,
  sortImport,
} from './pipeline';
import { importModel } from './settings';
import { importStore } from './store';

// The consumer's `max_retries` in wrangler.jsonc plus one: the delivery the queue gives up after.
export const lastDelivery = 4;
const retryDelaySeconds = 30;

const importId = z.uuid();

export const importMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prepare'), importId, fileId: z.uuid() }),
  z.object({ type: z.literal('sort'), importId }),
  z.object({ type: z.literal('scan'), importId, fileId: z.uuid() }),
  z.object({ type: z.literal('read'), importId, waits: z.int().min(0) }),
  z.object({ type: z.literal('check'), importId }),
  z.object({ type: z.literal('copy'), importId }),
]);

export type QueueMessage = {
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export function pipelineDeps(env: ApiEnv['Bindings']): PipelineDeps {
  const files = adminFileStore(env);
  return {
    store: importStore(adminClient(env)),
    objects: {
      read: files.readImportObject,
      write: files.writeImportObject,
      copy: files.copyImportObject,
      remove: files.removeImportObjects,
    },
    extractor: createExtractor(env),
    model: importModel(env),
    registry: { lookup: (cui) => lookupCompany(cui, timedFetch(8_000)) },
    queue: env.IMPORT_QUEUE ?? null,
  };
}

export function runStep(deps: PipelineDeps, message: ImportMessage) {
  switch (message.type) {
    case 'prepare':
      return prepareFile(deps, message.importId, message.fileId);
    case 'sort':
      return sortImport(deps, message.importId);
    case 'scan':
      return scanFile(deps, message.importId, message.fileId);
    case 'read':
      return readImport(deps, message.importId, message.waits);
    case 'check':
      return checkImport(deps, message.importId);
    case 'copy':
      return copyFolder(deps, message.importId);
  }
}

export async function recordFailure(deps: PipelineDeps, message: ImportMessage, error: unknown) {
  switch (message.type) {
    case 'prepare':
    case 'scan': {
      const pending = message.type === 'prepare' ? 'uploaded' : 'prepared';
      const file = (await deps.store.listFiles(message.importId)).find(
        (each) => each.id === message.fileId
      );
      if (file?.state === pending) {
        await deps.store.updateFile(file.id, { state: 'failed', reason: fileFailureReason(error) });
      }
      if (message.type === 'prepare') {
        const row = await deps.store.getImport(message.importId);
        if (row?.status === 'preparing') await afterPreparing(deps, message.importId);
      }
      return;
    }
    case 'sort':
    case 'read':
    case 'check': {
      const from = ({ sort: 'sorting', read: 'reading', check: 'checking' } as const)[message.type];
      await deps.store.advance(message.importId, from, failedPatch(importFailureReason(error)));
      return;
    }
    case 'copy':
      // The daily clean-up copies again what is left.
      return;
  }
}

export async function consumeImportBatch(
  batch: { messages: readonly QueueMessage[] },
  env: ApiEnv['Bindings'],
  deps: PipelineDeps = pipelineDeps(env)
) {
  for (const message of batch.messages) {
    const parsed = importMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      console.error('An import message of no known shape was dropped.');
      message.ack();
      continue;
    }
    const body = parsed.data;
    try {
      await runStep(deps, body);
      message.ack();
    } catch (error) {
      console.error(
        `Import step ${body.type} of import ${body.importId} failed on delivery ${message.attempts}: ${describe(error)}`
      );
      if (isTransient(error) && message.attempts < lastDelivery) {
        message.retry({ delaySeconds: retryDelaySeconds });
        continue;
      }
      try {
        await recordFailure(deps, body, error);
        message.ack();
      } catch (recording) {
        console.error(
          `The failure of import ${body.importId} was not recorded: ${describe(recording)}`
        );
        message.retry({ delaySeconds: retryDelaySeconds });
      }
    }
  }
}
