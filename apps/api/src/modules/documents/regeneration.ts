import {
  type BuiltInDocumentTypeKey,
  builtInDocumentTypeKeySchema,
  type DocumentsBehindType,
  type RegenerationItemStatus,
  type RegenerationJob,
  type TemplateVersionKind,
} from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import type { RegenerationQueue } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type { Actor } from './documents';

const typeOrder = new Map<string, number>(
  builtInDocumentTypeKeySchema.options.map((typeKey, index) => [typeKey, index])
);

const byName = (a: { clientName: string }, b: { clientName: string }) =>
  a.clientName.localeCompare(b.clientName, 'ro');

// A Queues limit: at most a hundred messages in one send.
const sendBatchSize = 100;

export async function listDocumentsBehind(
  db: DataClient,
  organizationId: string
): Promise<DocumentsBehindType[]> {
  const [behind, running] = await Promise.all([
    db
      .from('documents_behind')
      .select(
        'type_key, template_title, newest_version, newest_kind, newest_note, document_id, client_id, client_name, revision_version, edited_draft'
      )
      .eq('organization_id', organizationId),
    db
      .from('regeneration_jobs')
      .select('id, type_key')
      .eq('organization_id', organizationId)
      .is('finished_at', null),
  ]);
  if (behind.error) throw fromDatabaseError(behind.error, 'documents behind');
  if (running.error) throw fromDatabaseError(running.error, 'running regeneration jobs');

  const types = new Map<string, DocumentsBehindType>();
  for (const row of behind.data) {
    const typeKey = row.type_key!;
    let type = types.get(typeKey);
    if (!type) {
      type = {
        typeKey,
        title: row.template_title!,
        newestVersion: {
          version: row.newest_version!,
          kind: row.newest_kind as TemplateVersionKind,
          note: row.newest_note,
        },
        runningJobId: running.data.find((job) => job.type_key === typeKey)?.id ?? null,
        clients: [],
      };
      types.set(typeKey, type);
    }
    type.clients.push({
      documentId: row.document_id!,
      clientId: row.client_id!,
      clientName: row.client_name!,
      version: row.revision_version!,
      editedDraft: row.edited_draft!,
    });
  }
  return [...types.values()]
    .map((type) => ({ ...type, clients: type.clients.sort(byName) }))
    .sort(
      (a, b) =>
        (typeOrder.get(a.typeKey) ?? Infinity) - (typeOrder.get(b.typeKey) ?? Infinity) ||
        a.title.localeCompare(b.title, 'ro')
    );
}

/**
 * The clients are read with the caller's token, so a job holds only documents they can reach.
 * The job is written with the secret key: members have no write policy on it.
 */
export async function startRegeneration(
  db: DataClient,
  admin: AdminClient,
  queue: RegenerationQueue | undefined,
  actor: Actor,
  typeKey: BuiltInDocumentTypeKey
) {
  if (!queue) {
    console.error('No regeneration queue is bound to the API.');
    throw new ApiError(
      'service_unavailable',
      'Regenerarea pentru toți clienții nu este disponibilă acum.'
    );
  }
  const behind = await db
    .from('documents_behind')
    .select('client_id')
    .eq('organization_id', actor.organizationId)
    .eq('type_key', typeKey);
  if (behind.error) throw fromDatabaseError(behind.error, 'documents behind of a type');
  const clientIds = [...new Set(behind.data.map((row) => row.client_id!))];
  if (clientIds.length === 0) {
    throw new ApiError(
      'conflict',
      'Niciun client nu are acest document în urmă.',
      undefined,
      'nothing_behind'
    );
  }

  const started = await admin.rpc('start_regeneration_job', {
    p_organization_id: actor.organizationId,
    p_type_key: typeKey,
    p_requested_by: actor.userId,
    p_client_ids: clientIds,
  });
  if (started.error?.code === '23505') {
    throw new ApiError(
      'conflict',
      'Documentul se regenerează deja pentru toți clienții. Așteptați să se termine.',
      undefined,
      'regeneration_running'
    );
  }
  if (started.error) throw fromDatabaseError(started.error, 'start regeneration job');
  const jobId = started.data.id;

  try {
    for (let start = 0; start < clientIds.length; start += sendBatchSize) {
      await queue.sendBatch(
        clientIds.slice(start, start + sendBatchSize).map((clientId) => ({
          body: { jobId, clientId },
        }))
      );
    }
  } catch (error) {
    // A job whose clients never reach the queue would hold the type for an hour. Messages
    // already sent find no item and are dropped.
    console.error(
      `Regeneration job ${jobId} could not be queued: ${error instanceof Error ? error.message : 'unknown error'}`
    );
    const removed = await admin.from('regeneration_jobs').delete().eq('id', jobId);
    if (removed.error) console.error(`Regeneration job ${jobId} stays open: ${removed.error.code}`);
    throw new ApiError('service_unavailable', 'Regenerarea nu a putut porni. Încercați din nou.');
  }
  return readRegenerationJob(db, jobId);
}

type JobRow = {
  id: string;
  type_key: string;
  requested_at: string;
  finished_at: string | null;
  total_count: number;
  done_count: number;
  skipped_count: number;
  failed_count: number;
  regeneration_job_items: {
    client_id: string;
    status: string;
    detail: string | null;
    clients: { legal_name: string } | null;
  }[];
};

export async function readRegenerationJob(db: DataClient, jobId: string): Promise<RegenerationJob> {
  const { data, error } = await db
    .from('regeneration_jobs')
    .select(
      'id, type_key, requested_at, finished_at, total_count, done_count, skipped_count, failed_count, regeneration_job_items(client_id, status, detail, clients(legal_name))'
    )
    .eq('id', jobId)
    .returns<JobRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read regeneration job');
  if (!data) throw new ApiError('not_found', 'Această regenerare nu există.');
  return {
    id: data.id,
    typeKey: data.type_key,
    requestedAt: data.requested_at,
    finishedAt: data.finished_at,
    total: data.total_count,
    done: data.done_count,
    skipped: data.skipped_count,
    failed: data.failed_count,
    items: data.regeneration_job_items
      .map((item) => ({
        clientId: item.client_id,
        clientName: item.clients?.legal_name ?? '',
        status: item.status as RegenerationItemStatus,
        detail: item.detail,
      }))
      .sort(byName),
  };
}
