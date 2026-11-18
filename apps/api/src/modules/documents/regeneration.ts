import {
  type BehindLegalChange,
  type BuiltInDocumentTypeKey,
  builtInDocumentTypeKeySchema,
  type DocumentsBehindSummary,
  type DocumentsBehindType,
  type DocumentSet,
  documentSetOf,
  instructionChangeSchema,
  type MissingDocumentData,
  missingDocumentDataSchema,
  type RegenerationItemStatus,
  type RegenerationJob,
  type RunningRegeneration,
  type TemplateVersionKind,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { AdminClient } from '../../lib/admin-db';
import { type DataClient, everyRow, fromDatabaseError } from '../../lib/db';
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

// A code the view learns before the API does would otherwise fail the whole list.
const instructionChangesSchema = z.array(
  z
    .object({ code: z.string() })
    .loose()
    .transform((entry) => {
      const known = instructionChangeSchema.safeParse(entry);
      return known.success ? known.data : null;
    })
);

const instructionChangesOf = (value: unknown) => {
  const parsed = instructionChangesSchema.safeParse(value);
  return parsed.success ? parsed.data.filter((change) => change !== null) : [];
};

// documentSetOf in SQL: a fire-safety type key starts with `fire_`.
const fireTypePattern = 'fire\\_%';

type FilterBuilder<T> = {
  like(column: 'type_key', pattern: string): T;
  not(column: 'type_key', operator: 'like', pattern: string): T;
};

const inSet = <T extends FilterBuilder<T>>(query: T, set: DocumentSet) =>
  set === 'fire_safety'
    ? query.like('type_key', fireTypePattern)
    : query.not('type_key', 'like', fireTypePattern);

// The age after which start_regeneration_job closes an unfinished job of the same type.
const jobLifetimeMs = 60 * 60 * 1000;

// PostgREST answers at most `max_rows` (supabase/config.toml) rows a request.
async function runningJobs(db: DataClient, organizationId: string) {
  const { data, error } = await db
    .from('regeneration_jobs')
    .select('id, type_key, requested_by, total_count, done_count, skipped_count, failed_count')
    .eq('organization_id', organizationId)
    .is('finished_at', null)
    .gt('requested_at', new Date(Date.now() - jobLifetimeMs).toISOString())
    .order('requested_at');
  if (error) throw fromDatabaseError(error, 'running regeneration jobs');
  return data.map((job): RunningRegeneration => ({
    id: job.id,
    typeKey: job.type_key,
    set: documentSetOf(job.type_key),
    requestedBy: job.requested_by,
    total: job.total_count,
    done: job.done_count,
    skipped: job.skipped_count,
    failed: job.failed_count,
  }));
}

async function legalChangesOf(db: DataClient, versionIds: string[]) {
  const answered = new Map<string, BehindLegalChange[]>();
  if (versionIds.length === 0) return answered;
  const { data, error } = await db
    .from('template_version_legal_changes')
    .select('template_version_id, legal_changes(id, legal_acts(name))')
    .in('template_version_id', versionIds);
  if (error) throw fromDatabaseError(error, 'legal changes of template versions');
  for (const row of data) {
    const change = row.legal_changes;
    if (!change?.legal_acts) continue;
    const changes = answered.get(row.template_version_id) ?? [];
    changes.push({ id: change.id, actName: change.legal_acts.name });
    answered.set(row.template_version_id, changes);
  }
  for (const changes of answered.values()) {
    changes.sort((a, b) => a.actName.localeCompare(b.actName, 'ro', { numeric: true }));
  }
  return answered;
}

export async function listDocumentsBehind(
  db: DataClient,
  organizationId: string
): Promise<DocumentsBehindType[]> {
  const [rows, running] = await Promise.all([
    everyRow(
      (from, to) =>
        db
          .from('documents_behind')
          .select(
            'type_key, template_title, newest_version, newest_version_id, newest_kind, newest_note, document_id, client_id, client_name, revision_version, revision_status, revision_issue_date, edited_draft, behind_template, instruction_changes'
          )
          .eq('organization_id', organizationId)
          .order('document_id')
          .range(from, to),
      'documents behind'
    ),
    runningJobs(db, organizationId),
  ]);
  const legalChanges = await legalChangesOf(db, [
    ...new Set(rows.flatMap((row) => (row.newest_version_id ? [row.newest_version_id] : []))),
  ]);

  const types = new Map<string, DocumentsBehindType>();
  for (const row of rows) {
    const typeKey = row.type_key!;
    let type = types.get(typeKey);
    if (!type) {
      type = {
        typeKey,
        title: row.template_title!,
        set: documentSetOf(typeKey),
        newestVersion: {
          version: row.newest_version!,
          kind: row.newest_kind as TemplateVersionKind,
          note: row.newest_note,
        },
        legalChanges: legalChanges.get(row.newest_version_id!) ?? [],
        runningJobId: running.find((job) => job.typeKey === typeKey)?.id ?? null,
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
      behindTemplate: row.behind_template!,
      instructionChanges: instructionChangesOf(row.instruction_changes),
      status: row.revision_status === 'issued' ? 'issued' : 'draft',
      issueDate: row.revision_issue_date,
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

// Counted in the database, as dashboard_summary counts them, whatever the number.
export async function summarizeDocumentsBehind(
  db: DataClient,
  organizationId: string
): Promise<DocumentsBehindSummary> {
  const count = (set: DocumentSet) =>
    inSet(
      db
        .from('documents_behind')
        .select('document_id', { count: 'exact', head: true })
        .eq('organization_id', organizationId),
      set
    );
  const [ssm, su, running] = await Promise.all([
    count('occupational_safety'),
    count('fire_safety'),
    runningJobs(db, organizationId),
  ]);
  if (ssm.error) throw fromDatabaseError(ssm.error, 'documents behind count');
  if (su.error) throw fromDatabaseError(su.error, 'documents behind count');
  return {
    counts: { occupational_safety: ssm.count ?? 0, fire_safety: su.count ?? 0 },
    running,
  };
}

const unavailable = () => {
  console.error('No regeneration queue is bound to the API.');
  return new ApiError(
    'service_unavailable',
    'Regenerarea pentru toți clienții nu este disponibilă acum.'
  );
};

// Regenerating overwrites a draft, hand edits included (ADR 005); that stays a decision made for
// one client at a time, so such a draft never joins a job. The consumer checks again on delivery.
const regenerable = (rows: { client_id: string | null; edited_draft: boolean | null }[]) => [
  ...new Set(rows.filter((row) => !row.edited_draft).map((row) => row.client_id!)),
];

async function openJob(
  admin: AdminClient,
  queue: RegenerationQueue,
  actor: Actor,
  typeKey: string,
  clientIds: string[]
) {
  const started = await admin.rpc('start_regeneration_job', {
    p_organization_id: actor.organizationId,
    p_type_key: typeKey,
    p_requested_by: actor.userId,
    p_client_ids: clientIds,
  });
  if (started.error?.code === '23505') {
    throw new ApiError(
      'conflict',
      'Documentul se regenerează deja pentru toți clienții. Așteaptă să se termine.',
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
    throw new ApiError('service_unavailable', 'Regenerarea nu a putut porni. Încearcă din nou.');
  }
  return jobId;
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
  if (!queue) throw unavailable();
  const behind = await everyRow(
    (from, to) =>
      db
        .from('documents_behind')
        .select('client_id, edited_draft')
        .eq('organization_id', actor.organizationId)
        .eq('type_key', typeKey)
        .order('document_id')
        .range(from, to),
    'documents behind of a type'
  );
  if (behind.length === 0) {
    throw new ApiError(
      'conflict',
      'Niciun client nu are acest document în urmă.',
      undefined,
      'nothing_behind'
    );
  }
  const clientIds = regenerable(behind);
  if (clientIds.length === 0) {
    throw new ApiError(
      'conflict',
      'Fiecare ciornă a acestui document e editată de mână. Regenerează-le de pe pagina fiecărui client.',
      undefined,
      'nothing_behind'
    );
  }
  return readRegenerationJob(db, await openJob(admin, queue, actor, typeKey, clientIds));
}

/**
 * One job per document type of the set with a client to regenerate, in the order of the pack.
 * A type already regenerating keeps its job. When the queue fails after some jobs started, those
 * are returned and the rest stay behind, to be started again.
 */
export async function startSetRegeneration(
  db: DataClient,
  admin: AdminClient,
  queue: RegenerationQueue | undefined,
  actor: Actor,
  set: DocumentSet
) {
  if (!queue) throw unavailable();
  const [behind, running] = await Promise.all([
    everyRow(
      (from, to) =>
        inSet(
          db
            .from('documents_behind')
            .select('type_key, client_id, edited_draft')
            .eq('organization_id', actor.organizationId),
          set
        )
          .order('document_id')
          .range(from, to),
      'documents behind of a set'
    ),
    runningJobs(db, actor.organizationId),
  ]);
  const rowsByType = new Map<string, typeof behind>();
  for (const row of behind) {
    rowsByType.set(row.type_key!, [...(rowsByType.get(row.type_key!) ?? []), row]);
  }
  const todo = [...rowsByType]
    .map(([typeKey, rows]) => ({ typeKey, clientIds: regenerable(rows) }))
    .filter((type) => type.clientIds.length > 0)
    .sort(
      (a, b) =>
        (typeOrder.get(a.typeKey) ?? Infinity) - (typeOrder.get(b.typeKey) ?? Infinity) ||
        a.typeKey.localeCompare(b.typeKey)
    );
  if (todo.length === 0) {
    throw new ApiError(
      'conflict',
      'Niciun document nu are ce regenera: ce a rămas în urmă sunt ciorne editate de mână.',
      undefined,
      'nothing_behind'
    );
  }

  const already = running.filter((job) => job.set === set);
  const started: RunningRegeneration[] = [];
  const notStarted: string[] = [];
  for (const { typeKey, clientIds } of todo) {
    if (already.some((job) => job.typeKey === typeKey)) continue;
    if (notStarted.length > 0) {
      notStarted.push(typeKey);
      continue;
    }
    try {
      const id = await openJob(admin, queue, actor, typeKey, clientIds);
      started.push({
        id,
        typeKey,
        set,
        requestedBy: actor.userId,
        total: clientIds.length,
        done: 0,
        skipped: 0,
        failed: 0,
      });
    } catch (error) {
      if (error instanceof ApiError && error.reason === 'regeneration_running') continue;
      if (error instanceof ApiError && error.code === 'service_unavailable' && started.length > 0) {
        notStarted.push(typeKey);
        continue;
      }
      throw error;
    }
  }
  if (started.length === 0) {
    throw new ApiError(
      'conflict',
      'Documentele se regenerează deja. Așteaptă să se termine.',
      undefined,
      'regeneration_running'
    );
  }
  return { jobs: [...already, ...started], notStarted };
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
    missing: string[] | null;
    clients: { legal_name: string } | null;
  }[];
};

// A code renamed since the item was recorded would otherwise break the whole job's answer.
const knownCode = (code: string): code is MissingDocumentData =>
  missingDocumentDataSchema.safeParse(code).success;

export async function readRegenerationJob(db: DataClient, jobId: string): Promise<RegenerationJob> {
  const { data, error } = await db
    .from('regeneration_jobs')
    .select(
      'id, type_key, requested_at, finished_at, total_count, done_count, skipped_count, failed_count, regeneration_job_items(client_id, status, detail, missing, clients(legal_name))'
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
        missing: (item.missing ?? []).filter(knownCode),
      }))
      .sort(byName),
  };
}
