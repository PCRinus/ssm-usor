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
  fileReasons,
  ImportFailure,
  importFailureReason,
  importReasons,
  isExtractorUnavailable,
  isTransient,
  type PipelineDeps,
  prepareFile,
  readImport,
  scanBatchPages,
  scanFile,
  scanPages,
  sortImport,
} from './pipeline';
import { importModel } from './settings';
import { importStore } from './store';

// The consumer's `max_retries` in wrangler.jsonc plus one: the delivery the queue gives up after.
export const lastDelivery = 4;
const retryDelaySeconds = 30;
// An extractor turning files away is busy for minutes, not seconds: about 45 minutes of
// deferrals, each a new message, before the deliveries of the last one count down to a failure.
export const maxDeferrals = 6;
const deferralDelaySeconds = (deferred: number) => Math.min(60 * 2 ** deferred, 900);

const importId = z.uuid();
const deferred = z.int().min(0).optional();

export const importMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prepare'), importId, fileId: z.uuid(), deferred }),
  z.object({ type: z.literal('sort'), importId }),
  z.object({
    type: z.literal('scan'),
    importId,
    fileId: z.uuid(),
    pages: z.array(z.int().min(1)).min(1).max(scanBatchPages).optional(),
    owner: z.string().min(1).max(100).optional(),
    deferred,
  }),
  z.object({
    type: z.literal('read'),
    importId,
    waits: z.int().min(0),
    progress: z.int().min(0).optional(),
  }),
  z.object({ type: z.literal('check'), importId }),
  z.object({ type: z.literal('copy'), importId }),
]);

export type QueueMessage = {
  id: string;
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
      create: files.createImportObject,
      list: async (folder) => (await files.listImportFolder(folder)).map((object) => object.name),
      copy: files.copyImportObject,
      remove: files.removeImportObjects,
    },
    extractor: createExtractor(env),
    model: importModel(env),
    registry: { lookup: (cui) => lookupCompany(cui, timedFetch(8_000)) },
    queue: env.IMPORT_QUEUE ?? null,
  };
}

export function runStep(deps: PipelineDeps, message: ImportMessage, messageId: string) {
  switch (message.type) {
    case 'prepare':
      return prepareFile(deps, message.importId, message.fileId);
    case 'sort':
      return sortImport(deps, message.importId);
    case 'scan': {
      const owner = message.owner ?? messageId;
      return message.pages
        ? scanPages(deps, message.importId, message.fileId, message.pages, owner)
        : scanFile(deps, message.importId, message.fileId, owner);
    }
    case 'read':
      return readImport(deps, message.importId, message.waits, message.progress);
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
        await deps.store.updateFile(
          file.id,
          { state: 'failed', reason: fileFailureReason(error) },
          pending
        );
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

// Sent again rather than retried, so the wait does not use up the message's deliveries.
async function sentAgainLater(deps: PipelineDeps, body: ImportMessage, messageId: string) {
  if (body.type !== 'prepare' && body.type !== 'scan') return false;
  const times = body.deferred ?? 0;
  if (!deps.queue || times >= maxDeferrals) return false;
  const again: ImportMessage =
    body.type === 'scan'
      ? { ...body, owner: body.owner ?? messageId, deferred: times + 1 }
      : { ...body, deferred: times + 1 };
  try {
    await deps.queue.send(again, { delaySeconds: deferralDelaySeconds(times) });
    return true;
  } catch (error) {
    console.error(`Import step ${body.type} could not be deferred: ${describe(error)}`);
    return false;
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
      await runStep(deps, body, message.id);
      message.ack();
    } catch (error) {
      console.error(
        `Import step ${body.type} of import ${body.importId} failed on delivery ${message.attempts}: ${describe(error)}`
      );
      if (isExtractorUnavailable(error) && (await sentAgainLater(deps, body, message.id))) {
        message.ack();
        continue;
      }
      if (isTransient(error) && message.attempts < lastDelivery) {
        message.retry({ delaySeconds: retryDelaySeconds * 2 ** (message.attempts - 1) });
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

// A message lands here when every delivery ended before it could record a failure: the
// invocation ran out of memory or time, or the database stayed unreachable.
export async function consumeImportDeadLetters(
  batch: { messages: readonly QueueMessage[] },
  env: ApiEnv['Bindings'],
  deps: PipelineDeps = pipelineDeps(env)
) {
  for (const message of batch.messages) {
    const parsed = importMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      message.ack();
      continue;
    }
    const body = parsed.data;
    const reason =
      body.type === 'prepare' || body.type === 'scan' ? fileReasons.stopped : importReasons.failed;
    try {
      await recordFailure(deps, body, new ImportFailure(reason));
      message.ack();
    } catch (error) {
      console.error(
        `The lost step ${body.type} of import ${body.importId} was not recorded: ${describe(error)}`
      );
      message.retry({ delaySeconds: retryDelaySeconds });
    }
  }
}
