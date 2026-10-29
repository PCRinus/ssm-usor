import type { RouteHandler } from '@hono/zod-openapi';
import {
  clientConflictReasons,
  type ImportChanges,
  importChangesSchema,
  type ImportDetail,
  importErrorReasons,
  importFileExtensions,
  type ImportFileType,
  importLimits,
  type ImportSourceResponse,
  type ImportSummary,
  type ImportUsage,
} from '@ssm-usor/contracts';
import { placeQuote, proposalSchema } from '@ssm-usor/import';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { type AdminClient, createAdminClient } from '../../lib/admin-db';
import { adminToolsAllowed } from '../../lib/auth';
import {
  archivedClientError,
  createDataClient,
  type DataClient,
  fromDatabaseError,
} from '../../lib/db';
import type { ApiEnv, ImportMessage, ImportQueue } from '../../lib/env';
import { ApiError, type BrokenConstraint } from '../../lib/errors';
import { createAdminFileStore, createFileStore } from '../../lib/files';
import {
  type ExistingRecords,
  noExistingRecords,
  type RegisteredCompany,
  toClientPayload,
} from './payload';
import {
  characterCount,
  describe,
  loadPrepared,
  maxScannedPages,
  type PreparedPages,
  sendAll,
  textPathOf,
  tooMuchText,
} from './pipeline';
import type {
  abandonImportRoute,
  confirmImportRoute,
  createImportRoute,
  getImportRoute,
  getImportSourceRoute,
  listImportsRoute,
  readImportFileRoute,
  registerImportFilesRoute,
  saveImportChangesRoute,
  splitImportRoute,
  startImportRoute,
} from './routes';
import { missingImportSettings } from './settings';
import { importFileColumns, type ImportFileRow } from './store';

// Members read imports through their own policies; every write is the secret key's, after the
// import was found under the caller's token, or one of the functions that check the caller
// themselves (ADR 030, docs/data-model.md).

type ImportRow = Pick<
  Database['public']['Tables']['imports']['Row'],
  | 'id'
  | 'kind'
  | 'status'
  | 'client_id'
  | 'into_existing_client'
  | 'company_name'
  | 'company_cui'
  | 'source_import_id'
  | 'failure_reason'
  | 'created_by'
  | 'created_at'
  | 'started_at'
  | 'ready_at'
  | 'failed_at'
  | 'confirmed_at'
> & {
  clients: { id: string; legal_name: string } | null;
  import_files: { count: number }[];
};

const summaryColumns =
  'id, kind, status, client_id, into_existing_client, company_name, company_cui, source_import_id, failure_reason, created_by, created_at, started_at, ready_at, failed_at, confirmed_at, clients!imports_client_in_organization(id, legal_name), import_files(count)';

const detailColumns = `${summaryColumns}, version, proposal, changes, proposal_dropped_at, read_characters, input_tokens, cached_input_tokens, output_tokens, cost_usd, usage_by_step`;

const openStatuses = [
  'uploading',
  'preparing',
  'sorting',
  'reading',
  'checking',
  'ready',
  'failed',
] as const;

const unavailable = () =>
  new ApiError(
    'service_unavailable',
    'Importul din documente nu este disponibil acum.',
    undefined,
    importErrorReasons.unavailable
  );

function requireImportService(c: Context<ApiEnv>): ImportQueue {
  const missing = missingImportSettings(c.env);
  if (missing.length > 0) {
    console.error(`Imports are not configured: missing ${missing.join(', ')}.`);
    throw unavailable();
  }
  return c.env.IMPORT_QUEUE!;
}

const conflict = (message: string, reason: string) =>
  new ApiError('conflict', message, undefined, reason);

const notFound = () =>
  new ApiError('not_found', 'This import does not exist in your organization.');

async function creatorNames(db: DataClient, rows: { created_by: string | null }[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.created_by ? [row.created_by] : [])))];
  if (ids.length === 0) return new Map<string, string>();
  const { data, error } = await db.from('profiles').select('user_id, full_name').in('user_id', ids);
  if (error) throw fromDatabaseError(error, 'read import creators');
  return new Map(data.map((profile) => [profile.user_id, profile.full_name]));
}

function toSummary(row: ImportRow, names: Map<string, string>): ImportSummary {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    client: row.clients ? { id: row.clients.id, legalName: row.clients.legal_name } : null,
    intoExistingClient: row.into_existing_client,
    companyName: row.company_name,
    companyCui: row.company_cui,
    sourceImportId: row.source_import_id,
    failureReason: row.failure_reason,
    fileCount: row.import_files[0]?.count ?? 0,
    createdBy: row.created_by
      ? { id: row.created_by, fullName: names.get(row.created_by) ?? null }
      : null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    readyAt: row.ready_at,
    failedAt: row.failed_at,
    confirmedAt: row.confirmed_at,
  };
}

async function summaryOf(db: DataClient, importId: string) {
  const { data, error } = await db
    .from('imports')
    .select(summaryColumns)
    .eq('id', importId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read import');
  if (!data) throw notFound();
  return toSummary(data, await creatorNames(db, [data]));
}

async function findImport(db: DataClient, importId: string) {
  const { data, error } = await db
    .from('imports')
    .select(detailColumns)
    .eq('id', importId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find import');
  if (!data) throw notFound();
  return data;
}

// The source needs only to know the import is the caller's; the detail's columns carry the whole
// proposal.
async function importExists(db: DataClient, importId: string) {
  const { data, error } = await db.from('imports').select('id').eq('id', importId).maybeSingle();
  if (error) throw fromDatabaseError(error, 'find import');
  if (!data) throw notFound();
}

async function listFilesOf(db: DataClient | AdminClient, importId: string) {
  const { data, error } = await db
    .from('import_files')
    .select(importFileColumns)
    .eq('import_id', importId)
    .order('upload_path')
    .order('id');
  if (error) throw fromDatabaseError(error, 'list import files');
  return data;
}

export async function existingRecords(db: DataClient, clientId: string): Promise<ExistingRecords> {
  const [client, fireSafety, workplaces, positions, employees, persons] = await Promise.all([
    db.from('clients').select('*').eq('id', clientId).maybeSingle(),
    db.from('client_fire_safety').select('*').eq('client_id', clientId).maybeSingle(),
    db
      .from('client_workplaces')
      .select('id, name, address_line')
      .eq('client_id', clientId)
      .is('archived_at', null),
    db.from('job_positions').select('id, name').eq('client_id', clientId).is('archived_at', null),
    db
      .from('employees')
      .select('id, last_name, first_name, cnp')
      .eq('client_id', clientId)
      .is('archived_at', null),
    db
      .from('client_responsible_persons')
      .select('full_name')
      .eq('client_id', clientId)
      .is('archived_at', null),
  ]);
  for (const answer of [client, fireSafety, workplaces, positions, employees, persons]) {
    if (answer.error) throw fromDatabaseError(answer.error, 'read the client of an import');
  }
  return {
    client: client.data as Record<string, unknown> | null,
    fireSafety: fireSafety.data as Record<string, unknown> | null,
    workplaces: workplaces.data ?? [],
    jobPositions: positions.data ?? [],
    employees: employees.data ?? [],
    responsiblePersons: persons.data ?? [],
  };
}

type UsageColumns = {
  input_tokens: unknown;
  cached_input_tokens: unknown;
  output_tokens: unknown;
  cost_usd: unknown;
};

// Postgres numeric and bigint may arrive as strings.
const modelUsage = (row: UsageColumns) => ({
  costUsd: Number(row.cost_usd ?? 0),
  inputTokens: Number(row.input_tokens ?? 0),
  cachedInputTokens: Number(row.cached_input_tokens ?? 0),
  outputTokens: Number(row.output_tokens ?? 0),
});

function usageOf(row: UsageColumns & { read_characters: number | null; usage_by_step: unknown }) {
  const steps =
    row.usage_by_step && typeof row.usage_by_step === 'object' && !Array.isArray(row.usage_by_step)
      ? (row.usage_by_step as Record<string, UsageColumns | null | undefined>)
      : {};
  const bySteps: ImportUsage['bySteps'] = {};
  for (const step of ['sorting', 'reading', 'scanning'] as const) {
    const usage = steps[step];
    if (usage && typeof usage === 'object') bySteps[step] = modelUsage(usage);
  }
  return {
    ...modelUsage(row),
    readCharacters: row.read_characters,
    bySteps,
  } satisfies ImportUsage;
}

function storedProposal(value: unknown) {
  if (value === null || typeof value !== 'object') return null;
  const proposal = proposalSchema.safeParse(value);
  if (!proposal.success) return null;
  const registered = (value as { registeredCompany?: RegisteredCompany | null }).registeredCompany;
  return { proposal: proposal.data, registeredCompany: registered ?? null };
}

function storedChanges(value: unknown): ImportChanges | null {
  if (value === null) return null;
  const changes = importChangesSchema.safeParse(value);
  return changes.success ? changes.data : null;
}

function presentFile(file: ImportFileRow) {
  return {
    id: file.id,
    uploadPath: file.upload_path,
    fileName: file.original_file_name,
    mimeType: file.mime_type as ImportFileType,
    sizeBytes: file.size_bytes,
    state: file.state,
    documentKind: file.document_kind,
    reason: file.reason,
    companyName: file.company_name,
    companyCui: file.company_cui,
    pageCount: file.page_count,
    isScan: file.is_scan,
    hasDerived: file.derived_path !== null,
  };
}

function otherCompanies(files: ImportFileRow[]) {
  const groups = new Map<string, { name: string | null; cui: string | null; fileIds: string[] }>();
  for (const file of files.filter((each) => each.state === 'other_company')) {
    const key = file.company_cui ?? `name:${file.company_name ?? ''}`;
    const group = groups.get(key) ?? {
      name: file.company_name,
      cui: file.company_cui,
      fileIds: [],
    };
    group.name ??= file.company_name;
    group.fileIds.push(file.id);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.fileIds.length - a.fileIds.length);
}

function progressOf(files: ImportFileRow[]) {
  const scans = files.filter((file) => file.is_scan);
  return {
    files: files.length,
    prepared: files.filter((file) => !['uploading', 'uploaded'].includes(file.state)).length,
    scans: scans.length,
    scansRead: scans.filter((file) => file.state !== 'prepared').length,
  };
}

export const createImport: RouteHandler<typeof createImportRoute, ApiEnv> = async (c) => {
  requireImportService(c);
  const { clientId } = c.req.valid('json');
  const db = createDataClient(c);
  if (clientId) {
    const { data, error } = await db
      .from('clients')
      .select('id, stage, archived_at')
      .eq('id', clientId)
      .maybeSingle();
    if (error) throw fromDatabaseError(error, 'find import client');
    if (!data) throw new ApiError('not_found', 'This client does not exist in your organization.');
    if (data.archived_at) throw archivedClientError();
    if (data.stage === 'lead') {
      throw conflict(
        'The company is still a lead; promote it first.',
        clientConflictReasons.clientIsLead
      );
    }
  }
  const { data, error } = await createAdminClient(c)
    .from('imports')
    .insert({
      organization_id: c.get('membership').organizationId,
      kind: 'client',
      client_id: clientId ?? null,
      into_existing_client: clientId !== undefined,
      created_by: c.get('user').id,
    })
    .select('id')
    .single();
  if (error) throw fromDatabaseError(error, 'create import');
  return c.json({ import: await summaryOf(db, data.id) }, 201);
};

export const listImports: RouteHandler<typeof listImportsRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('query');
  const db = createDataClient(c);
  const query = db
    .from('imports')
    .select(summaryColumns)
    .in('status', [...openStatuses])
    .order('created_at', { ascending: false });
  const { data, error } = await (clientId ? query.eq('client_id', clientId) : query);
  if (error) throw fromDatabaseError(error, 'list imports');
  const names = await creatorNames(db, data);
  return c.json({ items: data.map((row) => toSummary(row, names)) }, 200);
};

export const getImport: RouteHandler<typeof getImportRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  const files = await listFilesOf(db, importId);
  const stored = storedProposal(row.proposal);
  const visible = stored !== null && (row.status === 'ready' || row.status === 'confirmed');
  const changes = visible ? storedChanges(row.changes) : null;
  let blockers: ImportDetail['blockers'] = [];
  if (visible && row.status === 'ready') {
    blockers = toClientPayload({
      proposal: stored.proposal,
      changes,
      intoExistingClient: row.into_existing_client,
      existing:
        row.into_existing_client && row.client_id
          ? await existingRecords(db, row.client_id)
          : noExistingRecords,
      registeredCompany: stored.registeredCompany,
    }).blockers;
  }
  const detail = {
    ...toSummary(row, await creatorNames(db, [row])),
    version: row.version,
    files: files.map(presentFile),
    progress: progressOf(files),
    otherCompanies: otherCompanies(files),
    registeredCompany: visible ? stored.registeredCompany : null,
    changes,
    blockers,
    proposalDroppedAt: row.proposal_dropped_at,
    proposal: visible ? stored.proposal : null,
    ...(adminToolsAllowed(c) ? { usage: usageOf(row) } : {}),
  };
  return c.json({ import: detail }, 200);
};

function checkedPaths(files: { uploadPath: string; mimeType: ImportFileType }[]) {
  const seen = new Set<string>();
  for (const [index, file] of files.entries()) {
    if (seen.has(file.uploadPath)) {
      throw conflict('The same path is in the upload twice.', importErrorReasons.duplicatePath);
    }
    seen.add(file.uploadPath);
    const extension = file.uploadPath.split('.').at(-1)?.toLowerCase() ?? '';
    const types = (importFileExtensions as Record<string, readonly string[]>)[extension];
    if (!types?.includes(file.mimeType)) {
      throw new ApiError(
        'validation_error',
        'The file name does not end in the extension of its type.',
        [{ path: `files.${index}.uploadPath`, message: 'The extension is not the type’s.' }],
        importErrorReasons.typeMismatch
      );
    }
  }
}

const tooLarge = () =>
  new ApiError(
    'unprocessable',
    'An import holds at most 150 files and 100 MiB.',
    undefined,
    importErrorReasons.tooLarge
  );

const notUploading = () =>
  conflict('Files are added only before the reading starts.', importErrorReasons.notUploading);

export const registerImportFiles: RouteHandler<typeof registerImportFilesRoute, ApiEnv> = async (
  c
) => {
  const { importId } = c.req.valid('param');
  const { files } = c.req.valid('json');
  checkedPaths(files);
  const row = await findImport(createDataClient(c), importId);
  if (row.status !== 'uploading') throw notUploading();
  const admin = createAdminClient(c);
  const known = await listFilesOf(admin, importId);
  if (known.some((file) => files.some((each) => each.uploadPath === file.upload_path))) {
    throw conflict(
      'A file with this path is in the import already.',
      importErrorReasons.duplicatePath
    );
  }
  const bytes = [...known, ...files].reduce(
    (total, file) => total + ('sizeBytes' in file ? file.sizeBytes : file.size_bytes),
    0
  );
  if (known.length + files.length > importLimits.files || bytes > importLimits.totalBytes) {
    throw tooLarge();
  }
  const { data, error } = await admin
    .from('import_files')
    .insert(
      files.map((file) => ({
        import_id: importId,
        organization_id: c.get('membership').organizationId,
        upload_path: file.uploadPath,
        original_file_name: file.uploadPath.split('/').at(-1)!,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        sha256: file.sha256,
      }))
    )
    .select('id, upload_path, storage_path');
  if (error?.code === 'IMP05') throw tooLarge();
  if (error?.code === 'IMP01') throw notUploading();
  if (error) throw fromDatabaseError(error, 'register import files');
  return c.json(
    {
      files: data.map((file) => ({
        id: file.id,
        uploadPath: file.upload_path,
        bucket: 'imports' as const,
        storagePath: file.storage_path,
      })),
    },
    201
  );
};

async function beginReading(
  c: Context<ApiEnv>,
  admin: AdminClient,
  queue: ImportQueue,
  importId: string,
  organizationId: string
) {
  const files = await listFilesOf(admin, importId);
  const objects = createAdminFileStore(c);
  const stored = new Map(
    (await objects.listImportFolder(`${organizationId}/${importId}`)).map((object) => [
      object.name,
      object.size,
    ])
  );
  const sizeOf = (file: ImportFileRow) => stored.get(file.storage_path.split('/').at(-1)!);
  // The caps counted the sizes the browser declared, and the bucket's policy checks only the
  // path: an object of another size is dropped with its row, as one that never arrived.
  const misdeclared = files.filter((file) => {
    const size = sizeOf(file);
    return typeof size === 'number' && size !== file.size_bytes;
  });
  const arrived = files.filter((file) => sizeOf(file) !== undefined && !misdeclared.includes(file));
  const missing = files.filter((file) => !arrived.includes(file));
  if (misdeclared.length > 0) {
    console.error(
      `Import ${importId}: ${misdeclared.length} objects differ from their declared size.`
    );
    await objects
      .removeImportObjects(misdeclared.map((file) => file.storage_path))
      .catch((error: unknown) =>
        console.error(`Objects of import ${importId} were left in Storage: ${describe(error)}`)
      );
  }
  if (missing.length > 0) {
    const { error } = await admin
      .from('import_files')
      .delete()
      .in(
        'id',
        missing.map((file) => file.id)
      );
    if (error) throw fromDatabaseError(error, 'drop files that never arrived');
  }
  if (arrived.length === 0) {
    throw new ApiError(
      'unprocessable',
      'No file of the import was uploaded.',
      undefined,
      importErrorReasons.empty
    );
  }
  const marked = await admin
    .from('import_files')
    .update({ state: 'uploaded' })
    .in(
      'id',
      arrived.map((file) => file.id)
    );
  if (marked.error) throw fromDatabaseError(marked.error, 'mark files uploaded');
  const moved = await admin
    .from('imports')
    .update({ status: 'preparing', started_at: new Date().toISOString() })
    .eq('id', importId)
    .eq('status', 'uploading')
    .select('id');
  if (moved.error) throw fromDatabaseError(moved.error, 'start import');
  if (moved.data.length === 0) throw notUploading();
  try {
    await sendAll(
      queue,
      arrived.map((file): ImportMessage => ({ type: 'prepare', importId, fileId: file.id }))
    );
  } catch (error) {
    console.error(`Import ${importId} could not be queued: ${describe(error)}`);
    await admin
      .from('imports')
      .update({ status: 'uploading' })
      .eq('id', importId)
      .eq('status', 'preparing');
    throw unavailable();
  }
}

export const startImport: RouteHandler<typeof startImportRoute, ApiEnv> = async (c) => {
  const queue = requireImportService(c);
  const { importId } = c.req.valid('param');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  if (row.status !== 'uploading') {
    throw conflict('The reading has started already.', importErrorReasons.notUploading);
  }
  await beginReading(c, createAdminClient(c), queue, importId, c.get('membership').organizationId);
  return c.json({ import: await summaryOf(db, importId) }, 200);
};

const proposalListOfTable: Record<string, string> = {
  clients: 'client',
  client_fire_safety: 'fireSafety',
  client_workplaces: 'workplaces',
  job_positions: 'jobPositions',
  job_position_equipment: 'protectiveEquipment',
  client_responsible_persons: 'responsiblePersons',
  employees: 'employees',
  fire_equipment: 'fireEquipment',
  fire_installations: 'fireInstallations',
};

const registeredOfficeKey = 'client_workplaces_registered_office_key';

function proposalPathOf(constraint: BrokenConstraint) {
  const table =
    constraint.table ??
    Object.keys(proposalListOfTable).find((name) => constraint.name.startsWith(`${name}_`));
  return (table && proposalListOfTable[table]) ?? table ?? constraint.name;
}

function decisionError(error: { code?: string | null; message?: string }, context: string) {
  switch (error.code) {
    case 'P0002':
      return notFound();
    case 'IMP01':
      return conflict('The import is not ready for review.', importErrorReasons.notReady);
    case 'IMP02':
      return conflict(
        'Someone saved the import since you read it. Read it again.',
        importErrorReasons.changed
      );
    case 'IMP03':
      return conflict(
        'The documents are about another company than the client.',
        importErrorReasons.otherCompany
      );
    case 'IMP04':
      return conflict(
        'The organization already has a client with this CUI.',
        importErrorReasons.clientExists
      );
    case '22023':
      // A row the review named went since, or was never the client's; the payload's checks
      // catch both, so this is a race with another member, or a payload bug the log shows.
      console.error(`The import payload broke its contract (${context}).`);
      return conflict(
        'The client changed since the import was reviewed. Read it again.',
        importErrorReasons.outdated
      );
  }
  const refused = fromDatabaseError(error, context);
  // The payload's checks mirror the tables' rules; one they miss still names the section. The
  // payload cannot see an existing client's registered office, which the unique index guards.
  const refusedRule =
    error.code === '23514' ||
    error.code === '23502' ||
    (error.code === '23505' && refused.constraint?.name === registeredOfficeKey);
  if (refusedRule && refused.constraint) {
    return new ApiError(
      'unprocessable',
      'The client refused a value of the import.',
      [{ path: proposalPathOf(refused.constraint), message: refused.constraint.name }],
      importErrorReasons.refused
    );
  }
  return refused;
}

export const saveImportChanges: RouteHandler<typeof saveImportChangesRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { version, changes } = c.req.valid('json');
  const { data, error } = await createDataClient(c).rpc('save_import_changes', {
    p_import_id: importId,
    p_expected_version: version,
    p_changes: changes,
  });
  if (error) throw decisionError(error, 'save import changes');
  return c.json({ version: data }, 200);
};

export const getImportSource: RouteHandler<typeof getImportSourceRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { file: named, quote, near } = c.req.valid('query');
  const db = createDataClient(c);
  const [, files] = await Promise.all([importExists(db, importId), listFilesOf(db, importId)]);
  const paged = /^(.*) \(pagina (\d+)\)$/.exec(named);
  const exact = files.find((file) => file.upload_path === named);
  const file = exact ?? (paged ? files.find((each) => each.upload_path === paged[1]) : undefined);
  if (!file) throw new ApiError('not_found', 'The import has no file by this name.');
  const page = exact || !paged ? null : Number(paged[2]);
  const store = createFileStore(c);
  const expiresInSeconds = 300;
  const derivedType =
    file.mime_type === 'application/msword'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'image/jpeg';

  // A scan page is shown as its image, which no text marks.
  const readable = file.text_path && !file.mime_type.startsWith('image/') && page === null;
  const [content, originalUrl, derivedUrl] = await Promise.all([
    readable
      ? store
          .readImportObject(file.text_path ?? textPathOf(file))
          .then((bytes) => new TextDecoder().decode(bytes))
      : null,
    store.importObjectLink(file.storage_path, expiresInSeconds),
    file.derived_path ? store.importObjectLink(file.derived_path, expiresInSeconds) : null,
  ]);

  let text: string | null = null;
  let pages: { number: number; text: string }[] | null = null;
  let match: ImportSourceResponse['match'] = null;
  if (content !== null && file.mime_type === 'application/pdf') {
    const prepared = JSON.parse(content) as PreparedPages;
    pages = prepared.pages
      .filter((each) => !each.isScan)
      .map((each) => ({ number: each.number, text: each.text }));
    const found = quote
      ? placeQuote(
          pages.map((each) => each.text),
          quote,
          near
        )
      : null;
    if (found) {
      const { start, end, parts } = found;
      match = { page: pages[found.textIndex]!.number, start, end, parts };
    }
  } else if (content !== null) {
    text = content;
    const found = quote ? placeQuote([content], quote, near) : null;
    if (found) match = { page: null, start: found.start, end: found.end, parts: found.parts };
  }
  return c.json(
    {
      fileId: file.id,
      uploadPath: file.upload_path,
      fileName: file.original_file_name,
      page,
      original: { url: originalUrl, mimeType: file.mime_type },
      derived: derivedUrl ? { url: derivedUrl, mimeType: derivedType } : null,
      text,
      pages,
      match,
      expiresInSeconds,
    },
    200
  );
};

export const confirmImport: RouteHandler<typeof confirmImportRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { version } = c.req.valid('json');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  const stored = storedProposal(row.proposal);
  if (row.status !== 'ready' || !stored) {
    throw conflict('The import is not ready for review.', importErrorReasons.notReady);
  }
  if (row.version !== version) throw decisionError({ code: 'IMP02' }, 'confirm import');
  const { payload, blockers } = toClientPayload({
    proposal: stored.proposal,
    changes: storedChanges(row.changes),
    intoExistingClient: row.into_existing_client,
    existing:
      row.into_existing_client && row.client_id
        ? await existingRecords(db, row.client_id)
        : noExistingRecords,
    registeredCompany: stored.registeredCompany,
  });
  if (blockers.length > 0) {
    throw new ApiError(
      'unprocessable',
      'Some values still need a decision.',
      blockers.map((blocker) => ({ path: blocker.path, message: blocker.code })),
      importErrorReasons.incomplete
    );
  }
  const { data, error } = await db.rpc('apply_client_import', {
    p_import_id: importId,
    p_expected_version: version,
    p_payload: JSON.parse(JSON.stringify(payload)),
  });
  if (error) throw decisionError(error, 'confirm import');
  const result = data as { client_id: string; files: unknown[] };
  try {
    await c.env.IMPORT_QUEUE?.send({ type: 'copy', importId });
  } catch (failure) {
    // The daily clean-up copies a folder left behind.
    console.error(
      `The folder of import ${importId} was not queued for copying: ${describe(failure)}`
    );
  }
  return c.json({ clientId: result.client_id, fileCount: result.files.length }, 200);
};

export const abandonImport: RouteHandler<typeof abandonImportRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { error } = await createDataClient(c).rpc('abandon_import', { p_import_id: importId });
  if (error?.code === 'IMP01') {
    throw conflict('The import is already confirmed or abandoned.', importErrorReasons.ended);
  }
  if (error) throw decisionError(error, 'abandon import');
  return c.body(null, 204);
};

function splitError(error: { code?: string | null }) {
  switch (error.code) {
    case 'IMP01':
      return conflict('This import cannot be split now.', importErrorReasons.ended);
    case 'IMP07':
      return new ApiError(
        'unprocessable',
        'Only files about another company are split off.',
        undefined,
        importErrorReasons.notOtherCompany
      );
    case 'IMP08':
      return conflict('These files were split off already.', importErrorReasons.alreadySplit);
  }
  return decisionError(error, 'split import');
}

export const splitImport: RouteHandler<typeof splitImportRoute, ApiEnv> = async (c) => {
  const queue = requireImportService(c);
  const { importId } = c.req.valid('param');
  const { fileIds } = c.req.valid('json');
  const db = createDataClient(c);
  const { data, error } = await db.rpc('split_import', {
    p_import_id: importId,
    p_file_ids: fileIds,
  });
  if (error) throw splitError(error);
  const split = data as {
    import_id: string;
    files: { source_path: string; target_path: string }[];
  };
  const admin = createAdminClient(c);
  const objects = createAdminFileStore(c);
  const copied: string[] = [];
  try {
    for (const file of split.files) {
      copied.push(file.target_path);
      await objects.copyImportObject(file.source_path, file.target_path, 'imports');
    }
    await beginReading(c, admin, queue, split.import_id, c.get('membership').organizationId);
  } catch (error) {
    // Abandoned instead of deleted when anything is left: its file rows are what the daily clean-up
    // finds the objects by, and an abandoned split no longer holds its files.
    const removed = await objects.removeImportObjects(copied).then(
      () => true,
      () => false
    );
    const deleted =
      removed && !(await admin.from('imports').delete().eq('id', split.import_id)).error;
    if (!deleted) await db.rpc('abandon_import', { p_import_id: split.import_id });
    throw error;
  }
  return c.json({ import: await summaryOf(db, split.import_id) }, 201);
};

// The documents are read together, so a file sent back is read with all of them again; the
// member's changes go, since the items they point at may not come back with the same ids.
export const readImportFile: RouteHandler<typeof readImportFileRoute, ApiEnv> = async (c) => {
  const queue = requireImportService(c);
  const { importId, fileId } = c.req.valid('param');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  if (row.status !== 'ready') {
    throw conflict('The import is not ready for review.', importErrorReasons.notReady);
  }
  const files = await listFilesOf(db, importId);
  const file = files.find((each) => each.id === fileId);
  if (!file) throw new ApiError('not_found', 'The import has no such file.');
  if (file.state !== 'set_aside') {
    throw new ApiError(
      'unprocessable',
      'Only a file set aside is sent back to be read.',
      undefined,
      importErrorReasons.notSetAside
    );
  }
  const objects = createAdminFileStore(c);
  const toRead = await Promise.all(
    files
      .filter((each) => each.state === 'read' || each === file)
      .map((each) => loadPrepared({ read: objects.readImportObject }, each))
  );
  const texts = toRead.map((entry) => ({
    name: entry.file.original_file_name,
    characters: entry.text.length,
  }));
  if (tooMuchText(texts)) {
    throw new ApiError(
      'unprocessable',
      'With this file the documents have more text than one import reads.',
      undefined,
      importErrorReasons.tooMuchText
    );
  }
  const scannedPages = toRead.reduce(
    (sum, entry) => sum + (entry.pages?.pages.filter((page) => page.isScan).length ?? 0),
    0
  );
  if (scannedPages > maxScannedPages) {
    throw new ApiError(
      'unprocessable',
      'With this file the documents have more scanned pages than one import reads.',
      undefined,
      importErrorReasons.tooManyScans
    );
  }
  const admin = createAdminClient(c);
  const moved = await admin
    .from('imports')
    .update({
      status: 'reading',
      proposal: null,
      changes: null,
      ready_at: null,
      version: row.version + 1,
      read_characters: characterCount(texts),
    })
    .eq('id', importId)
    .eq('status', 'ready')
    .eq('version', row.version)
    .select('id');
  if (moved.error) throw fromDatabaseError(moved.error, 'read a file set aside');
  if (moved.data.length === 0) throw decisionError({ code: 'IMP02' }, 'read a file set aside');
  const marked = await admin
    .from('import_files')
    .update({ state: file.is_scan ? 'prepared' : 'read', reason: null })
    .eq('id', fileId);
  const messages: ImportMessage[] = [
    ...(file.is_scan ? [{ type: 'scan' as const, importId, fileId }] : []),
    { type: 'read', importId, waits: 0 },
  ];
  try {
    if (marked.error) throw fromDatabaseError(marked.error, 'mark a file to read');
    await sendAll(queue, messages);
  } catch (error) {
    console.error(`Import ${importId} could not read ${fileId} again: ${describe(error)}`);
    await admin
      .from('import_files')
      .update({ state: 'set_aside', reason: file.reason })
      .eq('id', fileId);
    await admin
      .from('imports')
      .update({
        status: 'ready',
        proposal: row.proposal,
        changes: row.changes,
        ready_at: row.ready_at,
        version: row.version + 2,
        read_characters: row.read_characters,
      })
      .eq('id', importId)
      .eq('status', 'reading');
    throw unavailable();
  }
  return c.json({ import: await summaryOf(db, importId) }, 200);
};
