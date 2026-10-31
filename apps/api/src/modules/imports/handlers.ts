import type { RouteHandler } from '@hono/zod-openapi';
import {
  clientConflictReasons,
  confirmedListed,
  type EmployeeImportPeople,
  type FoundSheet,
  type ImportChanges,
  importChangesSchema,
  type ImportDetail,
  importErrorReasons,
  importFileExtensions,
  type ImportFileType,
  type ImportKind,
  type ImportLimits,
  importLimits,
  type ImportSourceResponse,
  type ImportSummary,
  type ImportUsage,
  isSystemPath,
  sheetFileTypes,
} from '@ssm-usor/contracts';
import {
  type EmployeeImportPayload,
  placeQuote,
  proposalSchema,
  toEmployeePayload,
} from '@ssm-usor/import';
import type { Context } from 'hono';

import type { Database, Json } from '../../database.types';
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
import { romanianDay } from '../documents/context';
import { uninvitedOfImports } from '../participants/handlers';
import {
  signedSheetContext,
  syncResultRows,
  syncTrainingRows,
} from '../signed-sheets/signed-sheets';
import {
  employeeImportClient,
  peopleCounts,
  personStates,
  romanianToday,
  storedEmployeeChanges,
  storedEmployeeProposal,
} from './employees';
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
  type PreparedPages,
  sendAll,
  textPathOf,
  tooMuchText,
} from './pipeline';
import type {
  abandonImportRoute,
  addFoundSheetsRoute,
  confirmImportRoute,
  createImportRoute,
  getImportRoute,
  getImportSourceRoute,
  listFoundSheetsRoute,
  listImportsRoute,
  readImportFileRoute,
  registerImportFilesRoute,
  saveEmployeeImportChangesRoute,
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
  | 'updated_at'
  | 'started_at'
  | 'ready_at'
  | 'failed_at'
  | 'confirmed_at'
> & {
  clients: { id: string; legal_name: string } | null;
  import_files: { count: number }[];
  last_file: { updated_at: string }[];
};

const summaryColumns =
  'id, kind, status, client_id, into_existing_client, company_name, company_cui, source_import_id, failure_reason, created_by, created_at, updated_at, started_at, ready_at, failed_at, confirmed_at, clients!imports_client_in_organization(id, legal_name), import_files(count), last_file:import_files(updated_at)';

// The clean-up fails an import uploading or ready with no change to it or its files for 14 days
// (fail_stalled_imports).
const leftForDays = 14;

const detailColumns = `${summaryColumns}, version, proposal, changes, proposal_dropped_at, read_characters, input_tokens, cached_input_tokens, output_tokens, cost_usd, usage_by_step`;

const runningStatuses: readonly string[] = ['preparing', 'sorting', 'reading', 'checking'];

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

function expiresAtOf(row: Pick<ImportRow, 'status' | 'updated_at' | 'last_file'>) {
  if (row.status !== 'uploading' && row.status !== 'ready') return null;
  const changed = Math.max(
    ...[row.updated_at, ...(row.last_file ?? []).map((file) => file.updated_at)].map((at) =>
      Date.parse(at)
    )
  );
  return new Date(changed + leftForDays * 24 * 60 * 60 * 1000).toISOString();
}

function toSummary(
  row: ImportRow,
  names: Map<string, string>,
  people: EmployeeImportPeople | null = null,
  uninvited: number | null = null,
  progress: ImportProgress | null = null
): ImportSummary {
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
    expiresAt: expiresAtOf(row),
    people,
    uninvited,
    progress,
  };
}

async function summaryOf(db: DataClient, importId: string) {
  const { data, error } = await db
    .from('imports')
    .select(summaryColumns)
    .eq('id', importId)
    .order('updated_at', { referencedTable: 'last_file', ascending: false })
    .limit(1, { referencedTable: 'last_file' })
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
    .order('updated_at', { referencedTable: 'last_file', ascending: false })
    .limit(1, { referencedTable: 'last_file' })
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

const wrongKind = () => conflict('This import is of another kind.', importErrorReasons.wrongKind);

async function requireKind(db: DataClient, importId: string, kind: ImportKind) {
  const { data, error } = await db.from('imports').select('kind').eq('id', importId).maybeSingle();
  if (error) throw fromDatabaseError(error, 'find import');
  if (!data) throw notFound();
  if (data.kind !== kind) throw wrongKind();
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

type ImportProgress = NonNullable<ImportSummary['progress']>;

function progressOf(files: Pick<ImportFileRow, 'state' | 'is_scan'>[]): ImportProgress {
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
  const { clientId, kind = 'client', addFoundSheets } = c.req.valid('json');
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
  const found = addFoundSheets && clientId ? await offeredSheets(db, clientId) : [];
  if (addFoundSheets && found.length === 0) throw noFoundSheets();
  const admin = createAdminClient(c);
  const { data, error } = await admin
    .from('imports')
    .insert({
      organization_id: c.get('membership').organizationId,
      kind,
      client_id: clientId ?? null,
      into_existing_client: clientId !== undefined,
      created_by: c.get('user').id,
    })
    .select('id')
    .single();
  if (error) throw fromDatabaseError(error, 'create import');
  if (found.length > 0) {
    try {
      await copyFoundSheets(c, admin, data.id, found, []);
    } catch (failure) {
      await admin.from('imports').delete().eq('id', data.id);
      throw failure;
    }
  }
  return c.json({ import: await summaryOf(db, data.id) }, 201);
};

export const listImports: RouteHandler<typeof listImportsRoute, ApiEnv> = async (c) => {
  const { clientId, kind = 'client', status = 'open' } = c.req.valid('query');
  const db = createDataClient(c);
  const everyKind = db.from('imports').select(summaryColumns);
  const selected = kind === 'all' ? everyKind : everyKind.eq('kind', kind);
  const query = (
    status === 'confirmed'
      ? selected
          .eq('status', 'confirmed')
          .order('confirmed_at', { ascending: false })
          .limit(confirmedListed)
      : selected.in('status', [...openStatuses]).order('created_at', { ascending: false })
  )
    .order('updated_at', { referencedTable: 'last_file', ascending: false })
    .limit(1, { referencedTable: 'last_file' });
  const { data, error } = await (clientId ? query.eq('client_id', clientId) : query);
  if (error) throw fromDatabaseError(error, 'list imports');
  const countUninvited = status === 'confirmed' && kind === 'employees' && clientId;
  const [names, people, uninvited, progress] = await Promise.all([
    creatorNames(db, data),
    peopleOfReady(
      db,
      data.filter((row) => row.kind === 'employees' && row.status === 'ready').map((row) => row.id)
    ),
    countUninvited
      ? uninvitedOfImports(
          db,
          clientId,
          data.map((row) => row.id)
        )
      : null,
    progressOfRunning(
      db,
      data.filter((row) => runningStatuses.includes(row.status)).map((row) => row.id)
    ),
  ]);
  return c.json(
    {
      items: data.map((row) =>
        toSummary(
          row,
          names,
          people.get(row.id) ?? null,
          uninvited ? (uninvited.get(row.id) ?? 0) : null,
          progress.get(row.id) ?? null
        )
      ),
    },
    200
  );
};

async function progressOfRunning(db: DataClient, importIds: string[]) {
  const progress = new Map<string, ImportProgress>();
  if (importIds.length === 0) return progress;
  const { data, error } = await db
    .from('import_files')
    .select('import_id, state, is_scan')
    .in('import_id', importIds);
  if (error) throw fromDatabaseError(error, 'count the files of imports');
  for (const importId of importIds) {
    progress.set(importId, progressOf(data.filter((file) => file.import_id === importId)));
  }
  return progress;
}

// Only the proposal's people and the changes, not the whole proposal: a list holds several.
async function peopleOfReady(db: DataClient, importIds: string[]) {
  const counts = new Map<string, EmployeeImportPeople>();
  if (importIds.length === 0) return counts;
  const { data, error } = await db
    .from('imports')
    .select('id, people:proposal->people, changes')
    .in('id', importIds);
  if (error) throw fromDatabaseError(error, 'count the people of imports');
  for (const row of data) {
    const proposal = peopleIdsOf(row.people);
    if (proposal) {
      counts.set(row.id, peopleCounts(personStates(proposal, storedEmployeeChanges(row.changes))));
    }
  }
  return counts;
}

function peopleIdsOf(value: unknown) {
  if (!Array.isArray(value)) return null;
  const people = value.flatMap((person: unknown) =>
    person && typeof person === 'object' && typeof (person as { id?: unknown }).id === 'string'
      ? [{ id: (person as { id: string }).id }]
      : []
  );
  return { people };
}

export const getImport: RouteHandler<typeof getImportRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  if (row.kind === 'employees')
    return c.json({ import: await employeeImportDetail(c, db, row) }, 200);
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
    employees: null,
    ...(adminToolsAllowed(c) ? { usage: usageOf(row) } : {}),
  };
  return c.json({ import: detail }, 200);
};

type FoundImport = Awaited<ReturnType<typeof findImport>>;

async function employeeImportDetail(c: Context<ApiEnv>, db: DataClient, row: FoundImport) {
  const files = await listFilesOf(db, row.id);
  const reviewed = row.status === 'ready' || row.status === 'confirmed';
  const proposal = reviewed ? storedEmployeeProposal(row.proposal) : null;
  const changes = proposal ? storedEmployeeChanges(row.changes) : null;
  const states = proposal ? personStates(proposal, changes) : null;
  let blockers: ImportDetail['blockers'] = [];
  if (proposal && row.status === 'ready' && row.client_id) {
    blockers = toEmployeePayload({
      proposal,
      changes,
      records: await employeeImportClient(db, row.client_id),
      today: romanianToday(),
    }).blockers;
  }
  return {
    ...toSummary(
      row,
      await creatorNames(db, [row]),
      states && row.status === 'ready' ? peopleCounts(states) : null
    ),
    version: row.version,
    files: files.map(presentFile),
    progress: progressOf(files),
    otherCompanies: [],
    registeredCompany: null,
    changes: null,
    blockers,
    proposalDroppedAt: row.proposal_dropped_at,
    proposal: null,
    employees: proposal && states ? { proposal, changes, states } : null,
    ...(adminToolsAllowed(c) ? { usage: usageOf(row) } : {}),
  };
}

function checkedPaths(files: { uploadPath: string; mimeType: ImportFileType }[]) {
  const seen = new Set<string>();
  for (const [index, file] of files.entries()) {
    if (seen.has(file.uploadPath)) {
      throw conflict('The same path is in the upload twice.', importErrorReasons.duplicatePath);
    }
    seen.add(file.uploadPath);
    if (isSystemPath(file.uploadPath)) {
      throw new ApiError(
        'validation_error',
        'The file is one the system or Word leaves beside the documents.',
        [{ path: `files.${index}.uploadPath`, message: 'The file is not a document.' }],
        importErrorReasons.systemFile
      );
    }
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

function onlySheets(files: { mimeType: ImportFileType }[]) {
  for (const [index, file] of files.entries()) {
    if (!(sheetFileTypes as readonly string[]).includes(file.mimeType)) {
      throw new ApiError(
        'validation_error',
        'An employee import reads only photographs and PDFs of the training sheets.',
        [{ path: `files.${index}.mimeType`, message: 'The file is not a photograph or a PDF.' }],
        importErrorReasons.photosOnly
      );
    }
  }
}

const mebibytes = (bytes: number) => bytes / (1024 * 1024);

const tooLarge = (limits: ImportLimits) =>
  new ApiError(
    'unprocessable',
    `An import of this kind holds at most ${limits.files} files and ${mebibytes(limits.totalBytes)} MiB, each file at most ${mebibytes(limits.fileBytes)} MiB.`,
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
  if (row.kind === 'employees') onlySheets(files);
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
  const limits = importLimits[row.kind];
  if (
    known.length + files.length > limits.files ||
    bytes > limits.totalBytes ||
    files.some((file) => file.sizeBytes > limits.fileBytes)
  ) {
    throw tooLarge(limits);
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
  if (error?.code === 'IMP05') throw tooLarge(limits);
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

const proposalListOfTable: Record<ImportKind, Record<string, string>> = {
  client: {
    clients: 'client',
    client_fire_safety: 'fireSafety',
    client_workplaces: 'workplaces',
    job_positions: 'jobPositions',
    job_position_equipment: 'protectiveEquipment',
    client_responsible_persons: 'responsiblePersons',
    employees: 'employees',
    fire_equipment: 'fireEquipment',
    fire_installations: 'fireInstallations',
  },
  employees: {
    employees: 'people',
    trainings: 'rows',
    training_records: 'rows',
    test_results: 'rows',
    client_files: 'pages',
  },
};

const registeredOfficeKey = 'client_workplaces_registered_office_key';

const employeeKeys: Record<string, { column: 'cnp' | 'employee_number'; field: string }> = {
  employees_client_cnp_key: { column: 'cnp', field: 'cnp' },
  employees_client_employee_number_key: { column: 'employee_number', field: 'employeeNumber' },
};

function proposalPathOf(constraint: BrokenConstraint, kind: ImportKind) {
  const lists = proposalListOfTable[kind];
  const table =
    constraint.table ?? Object.keys(lists).find((name) => constraint.name.startsWith(`${name}_`));
  return (table && lists[table]) ?? table ?? constraint.name;
}

type DatabaseFailure = { code?: string | null; message?: string; details?: string | null };

// Postgres names the duplicate value only in the error's details, which are never logged.
function duplicatePersonPath(error: DatabaseFailure, name: string, payload: EmployeeImportPayload) {
  const key = employeeKeys[name]!;
  const value = /=\([^,]*, (.*)\) already exists/.exec(error.details ?? '')?.[1];
  const person = payload.employees.find((employee) => employee[key.column] === value);
  return person ? `people.${person.key}.fields.${key.field}` : 'people';
}

function decisionError(
  error: DatabaseFailure,
  context: string,
  refusal: { kind: ImportKind; payload?: EmployeeImportPayload } = { kind: 'client' }
) {
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
  const constraint = refused.constraint;
  // The payload's checks mirror the tables' rules; one they miss still names the section. The
  // payload cannot see an existing client's registered office, which the unique index guards,
  // nor an employee another member gave the same CNP since the review was read.
  const duplicatePerson =
    error.code === '23505' &&
    refusal.payload !== undefined &&
    constraint !== undefined &&
    constraint.name in employeeKeys;
  const refusedRule =
    error.code === '23514' ||
    error.code === '23502' ||
    (error.code === '23505' && constraint?.name === registeredOfficeKey) ||
    duplicatePerson;
  if (refusedRule && constraint) {
    return new ApiError(
      'unprocessable',
      'The client refused a value of the import.',
      [
        {
          path: duplicatePerson
            ? duplicatePersonPath(error, constraint.name, refusal.payload!)
            : proposalPathOf(constraint, refusal.kind),
          message: constraint.name,
        },
      ],
      importErrorReasons.refused
    );
  }
  return refused;
}

async function saveChanges(db: DataClient, importId: string, version: number, changes: Json) {
  const { data, error } = await db.rpc('save_import_changes', {
    p_import_id: importId,
    p_expected_version: version,
    p_changes: changes,
  });
  if (error) throw decisionError(error, 'save import changes');
  return data;
}

export const saveImportChanges: RouteHandler<typeof saveImportChangesRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { version, changes } = c.req.valid('json');
  const db = createDataClient(c);
  await requireKind(db, importId, 'client');
  return c.json({ version: await saveChanges(db, importId, version, changes) }, 200);
};

// Each save is a change to the import, so it restarts the 14 days an import is kept untouched.
export const saveEmployeeImportChanges: RouteHandler<
  typeof saveEmployeeImportChangesRoute,
  ApiEnv
> = async (c) => {
  const { importId } = c.req.valid('param');
  const { version, changes } = c.req.valid('json');
  const db = createDataClient(c);
  await requireKind(db, importId, 'employees');
  return c.json({ version: await saveChanges(db, importId, version, changes) }, 200);
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

const incomplete = (issues: { path: string; message: string }[]) =>
  new ApiError(
    'unprocessable',
    'Some values still need a decision.',
    issues,
    importErrorReasons.incomplete
  );

export const confirmImport: RouteHandler<typeof confirmImportRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { version } = c.req.valid('json');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  if (row.kind === 'employees')
    return c.json(await confirmEmployeeImport(c, db, row, version), 200);
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
    throw incomplete(blockers.map((blocker) => ({ path: blocker.path, message: blocker.code })));
  }
  const { data, error } = await db.rpc('apply_client_import', {
    p_import_id: importId,
    p_expected_version: version,
    p_payload: JSON.parse(JSON.stringify(payload)),
  });
  if (error) throw decisionError(error, 'confirm import');
  const result = data as { client_id: string; files: unknown[] };
  await queueCopy(c, importId);
  return c.json({ clientId: result.client_id, fileCount: result.files.length }, 200);
};

async function queueCopy(c: Context<ApiEnv>, importId: string) {
  try {
    await c.env.IMPORT_QUEUE?.send({ type: 'copy', importId });
  } catch (failure) {
    // The daily clean-up copies a folder left behind.
    console.error(
      `The folder of import ${importId} was not queued for copying: ${describe(failure)}`
    );
  }
}

/**
 * Only the people marked checked are written; those still to check are left out, which the app
 * warns about by name before it confirms (ADR 032).
 */
async function confirmEmployeeImport(
  c: Context<ApiEnv>,
  db: DataClient,
  row: FoundImport,
  version: number
) {
  const proposal = storedEmployeeProposal(row.proposal);
  if (row.status !== 'ready' || !proposal || !row.client_id) {
    throw conflict('The import is not ready for review.', importErrorReasons.notReady);
  }
  if (row.version !== version) throw decisionError({ code: 'IMP02' }, 'confirm import');
  const { payload, blockers } = toEmployeePayload({
    proposal,
    changes: storedEmployeeChanges(row.changes),
    records: await employeeImportClient(db, row.client_id),
    today: romanianToday(),
  });
  if (blockers.length > 0) {
    throw incomplete(blockers.map((blocker) => ({ path: blocker.path, message: blocker.code })));
  }
  if (payload.employees.length === 0) throw incomplete([{ path: 'people', message: 'missing' }]);
  const { data, error } = await db.rpc('apply_employee_import', {
    p_import_id: row.id,
    p_expected_version: version,
    p_payload: JSON.parse(JSON.stringify(payload)),
  });
  if (error) throw decisionError(error, 'confirm import', { kind: 'employees', payload });
  const result = data as {
    client_id: string;
    employees: Record<string, string>;
    training_record_ids: string[];
    test_result_ids: string[];
    files: unknown[];
  };
  await syncSignedSheets(c, row.id, result);
  await queueCopy(c, row.id);
  return {
    clientId: result.client_id,
    fileCount: result.files.length,
    employeeIds: [...new Set(Object.values(result.employees))],
  };
}

// Best effort, as after a training saved by hand: an employee's stored signed sheets take the
// imported rows now or before their next signature. An employee without a stored sheet is left
// alone; their first sheet prints every row.
async function syncSignedSheets(
  c: Context<ApiEnv>,
  importId: string,
  result: { training_record_ids: string[]; test_result_ids: string[] }
) {
  try {
    const ctx = signedSheetContext(c);
    await syncTrainingRows(ctx, result.training_record_ids);
    await syncResultRows(ctx, result.test_result_ids);
  } catch (error) {
    console.error(
      `Signed sheet rows of import ${importId} not brought up to date: ${describe(error)}`
    );
  }
}

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
  if (row.kind !== 'client') throw wrongKind();
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
  if (scannedPages > importLimits[row.kind].scannedPages) {
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

const noFoundSheets = () =>
  new ApiError(
    'unprocessable',
    'The client has no sheet photographs found in its documentation that an import has not taken.',
    undefined,
    importErrorReasons.noFoundSheets
  );

const foundSheetTypes = sheetFileTypes.filter((type) => !type.startsWith('image/hei'));

type OfferedSheet = Awaited<ReturnType<typeof offeredSheets>>[number];

// A file only owners see is never offered, even to an owner: its copy would be an import file,
// which every member reads, and would become the employee's file for every member to see.
async function offeredSheets(db: DataClient, clientId: string) {
  const [found, taken] = await Promise.all([
    db
      .from('import_files')
      .select(
        'id, upload_path, imports!inner(id, kind, status, client_id, confirmed_at, files_copied_at), client_file:client_files!import_files_client_file_id_fkey!inner(id, storage_path, original_file_name, mime_type, size_bytes, sha256)'
      )
      .eq('state', 'for_employees')
      .eq('imports.kind', 'client')
      .eq('imports.status', 'confirmed')
      .eq('imports.client_id', clientId)
      .not('imports.files_copied_at', 'is', null)
      .in('client_file.mime_type', foundSheetTypes)
      .eq('client_file.owners_only', false)
      .order('upload_path')
      .order('id'),
    db
      .from('import_files')
      .select('source_file_id, sha256, imports!inner(kind, status, client_id)')
      .not('source_file_id', 'is', null)
      .eq('imports.kind', 'employees')
      .eq('imports.client_id', clientId)
      .not('imports.status', 'in', '(abandoned,failed)'),
  ]);
  if (found.error) throw fromDatabaseError(found.error, 'list found sheets');
  if (taken.error) throw fromDatabaseError(taken.error, 'list taken sheets');
  const takenIds = new Set(taken.data.map((file) => file.source_file_id));
  // Two client imports of one pack hold the same photograph; reading it twice pays twice.
  const seen = new Set(taken.data.map((file) => file.sha256));
  return found.data
    .filter((file) => {
      if (takenIds.has(file.id) || seen.has(file.client_file.sha256)) return false;
      seen.add(file.client_file.sha256);
      return true;
    })
    .map((file) => ({
      id: file.id,
      uploadPath: file.upload_path,
      importId: file.imports.id,
      confirmedAt: file.imports.confirmed_at!,
      clientFile: file.client_file,
    }));
}

const day = (timestamp: string) => romanianDay(timestamp).split('-').reverse().join('.');

const maxUploadPath = 1024;

function numbered(path: string, copy: number) {
  if (copy === 1) return path;
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/')
    ? `${path.slice(0, dot)} (${copy})${path.slice(dot)}`
    : `${path} (${copy})`;
}

// The documentation's own folders are kept under one of the import's, so a person's pages stay
// together and in order, as the upload orders them.
function foundSheetPath(sheet: OfferedSheet, copy: number) {
  const folder = `Din documentația importată pe ${day(sheet.confirmedAt)}`;
  const path = `${folder}/${numbered(sheet.uploadPath, copy)}`;
  return path.length <= maxUploadPath
    ? path
    : `${folder}/${numbered(sheet.clientFile.original_file_name, copy)}`;
}

function foundSheetPaths(sheets: OfferedSheet[], known: Pick<ImportFileRow, 'upload_path'>[]) {
  const used = new Set(known.map((file) => file.upload_path));
  return sheets.map((sheet) => {
    let copy = 1;
    while (used.has(foundSheetPath(sheet, copy))) copy++;
    const path = foundSheetPath(sheet, copy);
    used.add(path);
    return path;
  });
}

// Copies rather than references, so the import holds them as an upload, under its bucket's
// policies, caps and clean-up, and the client's files keep theirs whatever becomes of the import.
async function copyFoundSheets(
  c: Context<ApiEnv>,
  admin: AdminClient,
  importId: string,
  sheets: OfferedSheet[],
  known: Pick<ImportFileRow, 'upload_path'>[]
) {
  const paths = foundSheetPaths(sheets, known);
  const { data, error } = await admin
    .from('import_files')
    .insert(
      sheets.map((sheet, index) => ({
        import_id: importId,
        organization_id: c.get('membership').organizationId,
        upload_path: paths[index]!,
        original_file_name: sheet.clientFile.original_file_name,
        mime_type: sheet.clientFile.mime_type,
        size_bytes: sheet.clientFile.size_bytes,
        sha256: sheet.clientFile.sha256,
        source_file_id: sheet.id,
      }))
    )
    .select('id, storage_path, source_file_id');
  if (error?.code === 'IMP05') throw tooLarge(importLimits.employees);
  if (error?.code === 'IMP01') throw notUploading();
  if (error) throw fromDatabaseError(error, 'add found sheets');
  const objects = createAdminFileStore(c);
  const copied: string[] = [];
  const takeBack = async () => {
    await objects.removeImportObjects(copied).catch(() => undefined);
    await admin
      .from('import_files')
      .delete()
      .in(
        'id',
        data.map((file) => file.id)
      );
  };
  try {
    for (const file of data) {
      const sheet = sheets.find((each) => each.id === file.source_file_id)!;
      copied.push(file.storage_path);
      await objects.copyClientFileToImports(sheet.clientFile.storage_path, file.storage_path);
    }
  } catch (failure) {
    console.error(`Found sheets of import ${importId} were not copied: ${describe(failure)}`);
    await takeBack();
    throw unavailable();
  }
  const marked = await admin.rpc('mark_found_sheets_uploaded', {
    p_import_id: importId,
    p_file_ids: data.map((file) => file.id),
  });
  if (marked.error?.code === 'IMP01') {
    await takeBack();
    throw notUploading();
  }
  if (marked.error) throw fromDatabaseError(marked.error, 'mark found sheets uploaded');
}

export const listFoundSheets: RouteHandler<typeof listFoundSheetsRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const offered = await offeredSheets(createDataClient(c), clientId);
  const byImport = new Map<
    string,
    { importId: string; confirmedAt: string; sheets: FoundSheet[] }
  >();
  for (const sheet of offered) {
    const group = byImport.get(sheet.importId) ?? {
      importId: sheet.importId,
      confirmedAt: sheet.confirmedAt,
      sheets: [],
    };
    group.sheets.push({
      id: sheet.id,
      clientFileId: sheet.clientFile.id,
      uploadPath: sheet.uploadPath,
      fileName: sheet.clientFile.original_file_name,
      mimeType: sheet.clientFile.mime_type as FoundSheet['mimeType'],
      sizeBytes: sheet.clientFile.size_bytes,
    });
    byImport.set(sheet.importId, group);
  }
  const items = [...byImport.values()].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt));
  return c.json({ items, total: offered.length }, 200);
};

export const addFoundSheets: RouteHandler<typeof addFoundSheetsRoute, ApiEnv> = async (c) => {
  requireImportService(c);
  const { importId } = c.req.valid('param');
  const { fileIds } = c.req.valid('json');
  const db = createDataClient(c);
  const row = await findImport(db, importId);
  if (row.kind !== 'employees' || !row.client_id) throw wrongKind();
  if (row.status !== 'uploading') throw notUploading();
  const offered = await offeredSheets(db, row.client_id);
  const chosen = fileIds ? offered.filter((sheet) => fileIds.includes(sheet.id)) : offered;
  if (chosen.length === 0 || (fileIds && chosen.length !== new Set(fileIds).size)) {
    throw noFoundSheets();
  }
  const admin = createAdminClient(c);
  await copyFoundSheets(c, admin, importId, chosen, await listFilesOf(admin, importId));
  return c.json({ import: await summaryOf(db, importId) }, 201);
};
