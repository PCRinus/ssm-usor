import {
  type AdminImportCopy,
  type AdminImportDetail,
  type AdminImportFileLink,
  adminImportFileLinkSeconds,
  adminImportFileQuerySchema,
  type AdminImportFlags,
  type AdminImportList,
  type AdminImportListItem,
  adminImportListQuerySchema,
  type AdminImportPart,
  type AdminImportRow,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';
import { z } from 'zod';

import type { Database } from '../../database.types';
import { type AdminClient, createAdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createAdminFileStore } from '../../lib/files';
import { changedShare, type ReadingFlags } from '../imports/reading-flags';

type AdminEvent = 'import_copy_opened' | 'import_copy_file_opened';

const decoder = new TextDecoder();

function flagsOf(value: unknown): AdminImportFlags | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const flags = value as Partial<ReadingFlags>;
  return {
    unreadableFiles: flags.files?.unreadable?.length ?? 0,
    nothingFound: flags.nothingFound?.length ?? 0,
    emptyRequired: flags.emptyRequired?.length ?? 0,
    checks: Object.values(flags.checks ?? {}).reduce((sum, count) => sum + Number(count || 0), 0),
  };
}

function shareOf(quality: unknown, flags: unknown) {
  const proposed =
    flags && typeof flags === 'object' ? (flags as ReadingFlags).proposedValues : undefined;
  return changedShare(quality, proposed)?.share ?? null;
}

function shortVersion(value: unknown) {
  const prompts = (value as { prompts?: unknown } | null)?.prompts;
  return typeof prompts === 'string' ? prompts.slice(0, 8) : null;
}

const numberOf = (value: number | string | null) => (value === null ? null : Number(value));

const reading = (row: { reading_version: unknown; reading_flags: unknown; quality: unknown }) => ({
  readingVersion: row.reading_version ?? null,
  readingFlags: row.reading_flags ?? null,
  quality: row.quality ?? null,
  flags: flagsOf(row.reading_flags),
  changedShare: shareOf(row.quality, row.reading_flags),
});

const copyOf = (row: {
  id: string;
  part: AdminImportCopy['part'];
  written_at: string;
  expires_at: string;
  removed_at: string | null;
  completed_at: string | null;
}): AdminImportCopy => ({
  id: row.id,
  part: row.part,
  writtenAt: row.written_at,
  expiresAt: row.expires_at,
  removedAt: row.removed_at,
  completedAt: row.completed_at,
});

type CopyColumn = 'copy_written_at' | 'copy_expires_at' | 'copy_removed_at' | 'copy_completed_at';

// The generated types miss that the copy columns are null for an import with no kept copy, and
// the completion for a copy still being written.
type ListRow = Omit<
  Database['public']['Functions']['admin_list_imports']['Returns'][number],
  CopyColumn
> & { [column in CopyColumn]: string | null };

async function listPage(
  db: AdminClient,
  query: z.infer<typeof adminImportListQuerySchema>,
  limit: number,
  offset: number
): Promise<ListRow[]> {
  const { data, error } = await db.rpc('admin_list_imports', {
    p_kind: query.kind,
    p_status: query.status,
    p_reported: query.reported ?? false,
    p_has_copy: query.hasCopy ?? false,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw fromDatabaseError(error, 'list admin imports');
  return data;
}

export async function listImports(c: Context<ApiEnv>) {
  const parsed = adminImportListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) throw new ApiError('validation_error');
  const query = parsed.data;
  const db = createAdminClient(c);
  const rows = await listPage(db, query, query.pageSize, (query.page - 1) * query.pageSize);
  // A page past the end has no row to carry the total.
  const total =
    rows[0]?.total ?? (query.page > 1 ? ((await listPage(db, query, 1, 0))[0]?.total ?? 0) : 0);
  const items = rows.map((row): AdminImportListItem => ({
    id: row.import_id,
    organization: { id: row.organization_id, name: row.organization_name },
    rowDeleted: row.row_deleted,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    readingVersion: shortVersion(row.reading_version),
    flags: flagsOf(row.reading_flags),
    changedShare: shareOf(row.quality, row.reading_flags),
    costUsd: numberOf(row.cost_usd),
    reportedAt: row.reported_at,
    copy: row.copy_written_at
      ? {
          writtenAt: row.copy_written_at,
          expiresAt: row.copy_expires_at!,
          removedAt: row.copy_removed_at,
          completedAt: row.copy_completed_at,
        }
      : null,
    partCopies: row.part_copies,
    incompletePartCopies: row.incomplete_part_copies,
  }));
  return c.json({
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: Number(total),
  } satisfies AdminImportList);
}

const importIdSchema = z.uuid();

function importIdOf(c: Context<ApiEnv>) {
  const parsed = importIdSchema.safeParse(c.req.param('id'));
  if (!parsed.success) throw new ApiError('not_found', 'No such import.');
  return parsed.data;
}

async function copiesOf(db: AdminClient, importId: string) {
  const { data, error } = await db
    .from('import_copies')
    .select('id, organization_id, part, written_at, expires_at, removed_at, completed_at')
    .eq('import_id', importId)
    .order('part', { ascending: true, nullsFirst: true });
  if (error) throw fromDatabaseError(error, 'read import copies');
  return data;
}

// No API role can write audit.events: the function names the admin from the x-audit-actor
// header the secret-key client carries (ADR 033). Recorded before the copy is read or a link
// signed, so that no look at a copy goes unlogged.
async function recordEvent(
  db: AdminClient,
  action: AdminEvent,
  copy: { id: string; organization_id: string },
  details: Record<string, string>
) {
  const { error } = await db.rpc('record_admin_event', {
    p_action: action,
    p_table_name: 'import_copies',
    p_row_id: copy.id,
    p_organization_id: copy.organization_id,
    p_details: details,
  });
  if (error) throw fromDatabaseError(error, 'record admin event');
}

export async function getImport(c: Context<ApiEnv>) {
  const importId = importIdOf(c);
  const db = createAdminClient(c);
  const [row, parts, copies] = await Promise.all([
    db.from('imports').select('*').eq('id', importId).maybeSingle(),
    db.from('import_library_parts').select('*').eq('import_id', importId).order('part'),
    copiesOf(db, importId),
  ]);
  if (row.error) throw fromDatabaseError(row.error, 'read import');
  if (parts.error) throw fromDatabaseError(parts.error, 'read import parts');
  const organizationId = row.data?.organization_id ?? copies[0]?.organization_id;
  if (!organizationId) throw new ApiError('not_found', 'No such import.');

  const organization = await db
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle();
  if (organization.error) throw fromDatabaseError(organization.error, 'read organization');

  const kept = copies.filter((copy) => copy.removed_at === null);
  let record: unknown = null;
  let partRecords: AdminImportDetail['partRecords'] = [];
  let files: AdminImportDetail['files'] = [];
  const opened = kept.find((copy) => copy.part === null) ?? kept[0];
  if (opened) {
    await recordEvent(db, 'import_copy_opened', opened, { import_id: importId });
    const store = createAdminFileStore(c);
    const folder = `${organizationId}/${importId}`;
    const objects = await store.listImportCopyObjects(folder);
    files = objects
      .map((object) => ({ path: object.path.slice(folder.length + 1), sizeBytes: object.size }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const listed = new Set(files.map((file) => file.path));
    const readJson = async (path: string) =>
      listed.has(path)
        ? (JSON.parse(decoder.decode(await store.readImportCopy(`${folder}/${path}`))) as unknown)
        : null;
    record = await readJson('record.json');
    partRecords = await Promise.all(
      kept
        .filter((copy) => copy.part !== null)
        .map(async (copy) => ({
          part: copy.part!,
          record: await readJson(`parts/${copy.part}/record.json`),
        }))
    );
  }

  const data = row.data;
  return c.json({
    id: importId,
    organization: { id: organizationId, name: organization.data?.name ?? null },
    import: data
      ? ({
          kind: data.kind,
          status: data.status,
          failureReason: data.failure_reason,
          clientId: data.client_id,
          intoExistingClient: data.into_existing_client,
          createdAt: data.created_at,
          startedAt: data.started_at,
          readyAt: data.ready_at,
          confirmedAt: data.confirmed_at,
          abandonedAt: data.abandoned_at,
          failedAt: data.failed_at,
          reportedAt: data.reported_at,
          reportedBy: data.reported_by,
          costUsd: Number(data.cost_usd),
          inputTokens: data.input_tokens,
          cachedInputTokens: data.cached_input_tokens,
          outputTokens: data.output_tokens,
          ...reading(data),
        } satisfies AdminImportRow)
      : null,
    parts: parts.data.map((part): AdminImportPart => ({
      part: part.part,
      status: part.status,
      attempt: part.attempt,
      failureReason: part.failure_reason,
      readAt: part.read_at,
      confirmedAt: part.confirmed_at,
      failedAt: part.failed_at,
      reportedAt: part.reported_at,
      reportedBy: part.reported_by,
      costUsd: Number(part.cost_usd),
      ...reading(part),
    })),
    copies: copies.map(copyOf),
    record,
    partRecords,
    files,
  } satisfies AdminImportDetail);
}

// Within the copy's folder only: every segment a plain name, and so again once decoded, since
// Storage decodes the path it is given.
function copyPathOf(path: string) {
  const safe = (value: string) =>
    value
      .split('/')
      .every(
        (segment) =>
          segment !== '' &&
          segment !== '.' &&
          segment !== '..' &&
          ![...segment].some((char) => char === '\\' || char < ' ' || char === '\u007f')
      );
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  return safe(path) && safe(decoded) ? path : null;
}

export async function getImportFileLink(c: Context<ApiEnv>) {
  const importId = importIdOf(c);
  const query = adminImportFileQuerySchema.safeParse(c.req.query());
  const path = query.success ? copyPathOf(query.data.path) : null;
  if (!path) throw new ApiError('validation_error', 'The path is not a file of the copy.');

  const db = createAdminClient(c);
  const part = /^parts\/([^/]+)\//.exec(path)?.[1] ?? null;
  const copy = (await copiesOf(db, importId)).find(
    (each) => each.removed_at === null && each.part === part
  );
  if (!copy) throw new ApiError('not_found', 'The import has no such copy kept.');

  const store = createAdminFileStore(c);
  const folder = `${copy.organization_id}/${importId}`;
  const slash = path.lastIndexOf('/');
  const directory = slash === -1 ? folder : `${folder}/${path.slice(0, slash)}`;
  const name = path.slice(slash + 1);
  const listed = await store.listImportCopyObjects(directory);
  if (!listed.some((object) => object.path === `${directory}/${name}`)) {
    throw new ApiError('not_found', 'The copy has no such file.');
  }

  await recordEvent(db, 'import_copy_file_opened', copy, { import_id: importId, path });
  const url = await store.importCopyLink(`${folder}/${path}`, adminImportFileLinkSeconds);
  return c.json({
    url,
    expiresAt: new Date(Date.now() + adminImportFileLinkSeconds * 1000).toISOString(),
  } satisfies AdminImportFileLink);
}
