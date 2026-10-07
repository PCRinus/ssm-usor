import { clientConflictReasons, type RegenerationItemStatus } from '@ssm-usor/contracts';
import { z } from 'zod';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import type { ApiEnv, RegenerationMessage } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { adminFileStore, type FileStore } from '../../lib/files';
import { type Actor, regenerateDocument } from './documents';

// The consumer's `max_retries` in wrangler.jsonc plus one: the delivery the queue gives up after.
export const lastDelivery = 4;
const retryDelaySeconds = 30;

const messageSchema = z.object({ jobId: z.uuid(), clientId: z.uuid() });

export type QueueMessage = {
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

const details = {
  notBehind: 'Documentul nu mai este în urmă.',
  editedDraft:
    'Ciorna are modificări făcute de mână, pe care regenerarea le-ar pierde. Regenerați documentul de pe pagina clientului.',
  noRequester: 'Membrul care a pornit regenerarea nu mai are cont.',
  missingData:
    'Lipsesc date pe care documentul le tipărește. Completați-le pe pagina clientului, apoi regenerați documentul.',
  archived: 'Clientul a fost arhivat.',
  unavailable: 'Un serviciu nu a răspuns. Regenerați documentul de pe pagina clientului.',
} as const;

export async function consumeRegenerationBatch(
  batch: { messages: readonly QueueMessage[] },
  env: ApiEnv['Bindings']
) {
  const admin = adminClient(env);
  const files = adminFileStore(env);
  for (const message of batch.messages) {
    const parsed = messageSchema.safeParse(message.body);
    if (!parsed.success) {
      console.error('A regeneration message without a job and a client was dropped.');
      message.ack();
      continue;
    }
    try {
      await regenerateQueuedClient(admin, files, parsed.data, message.attempts >= lastDelivery);
      message.ack();
    } catch (error) {
      console.error(
        `Regenerating client ${parsed.data.clientId} of job ${parsed.data.jobId} failed on delivery ${message.attempts}: ${describe(error)}`
      );
      message.retry({ delaySeconds: retryDelaySeconds });
    }
  }
}

/**
 * Throws only for what another delivery may get past; everything else ends as the item's
 * status. On the last delivery nothing is left to get past, so that ends as `failed` too.
 */
export async function regenerateQueuedClient(
  admin: AdminClient,
  files: FileStore,
  { jobId, clientId }: RegenerationMessage,
  lastAttempt: boolean
) {
  const item = await admin
    .from('regeneration_job_items')
    .select('status, regeneration_jobs(organization_id, type_key, requested_by)')
    .eq('job_id', jobId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (item.error) throw fromDatabaseError(item.error, 'read regeneration item');
  // No item: its job was taken back because it could not be queued.
  if (!item.data || item.data.status !== 'queued' || !item.data.regeneration_jobs) return;
  const job = item.data.regeneration_jobs;
  const record = (status: Exclude<RegenerationItemStatus, 'queued'>, detail: string | null) =>
    recordItem(admin, jobId, clientId, status, detail);

  if (!job.requested_by) return record('failed', details.noRequester);

  // Asked again at delivery, so a document regenerated since, by hand or by an earlier delivery
  // of this same message, is left as it is.
  const behind = await admin
    .from('documents_behind')
    .select('document_id, edited_draft')
    .eq('organization_id', job.organization_id)
    .eq('client_id', clientId)
    .eq('type_key', job.type_key)
    .maybeSingle();
  if (behind.error) throw fromDatabaseError(behind.error, 'document behind of a client');
  if (!behind.data) return record('skipped', details.notBehind);
  // Regenerating overwrites a draft, hand edits included (ADR 005); that stays a decision made
  // for one client at a time. An issued revision has nothing to lose: it gets a new draft and
  // stays in force until someone issues that one.
  if (behind.data.edited_draft) return record('skipped', details.editedDraft);

  const actor: Actor = {
    userId: job.requested_by,
    organizationId: job.organization_id,
    createdBy: job.requested_by,
  };
  try {
    await regenerateDocument(admin, files, actor, behind.data.document_id!, {});
  } catch (error) {
    if (transient(error) && !lastAttempt) throw error;
    return record('failed', failureDetail(error));
  }
  return record('done', null);
}

async function recordItem(
  admin: AdminClient,
  jobId: string,
  clientId: string,
  status: Exclude<RegenerationItemStatus, 'queued'>,
  detail: string | null
) {
  const { error } = await admin.rpc('record_regeneration_item', {
    p_job_id: jobId,
    p_client_id: clientId,
    p_status: status,
    // Null where nothing needs saying; the generated type does not know a parameter can be.
    p_detail: detail as string,
  });
  if (error) throw fromDatabaseError(error, 'record regeneration item');
}

// An unreachable database or Storage, or anything that is not the API's own answer, may pass
// on the next delivery; missing data or a refused document will not.
function transient(error: unknown) {
  return !(error instanceof ApiError) || error.code === 'service_unavailable';
}

function failureDetail(error: unknown) {
  if (error instanceof ApiError) {
    if (error.reason === 'missing_document_data') return details.missingData;
    if (error.reason === clientConflictReasons.clientArchived) return details.archived;
    if (error.code === 'service_unavailable') return details.unavailable;
  }
  return `Regenerarea a eșuat: ${describe(error)}`.slice(0, 1000);
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : 'unknown error';
}
