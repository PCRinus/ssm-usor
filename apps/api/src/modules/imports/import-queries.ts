import {
  type EmployeeImportPeople,
  type ImportChanges,
  importChangesSchema,
  importErrorReasons,
  type ImportKind,
  type ImportLibraryPart,
  type ImportSummary,
} from '@ssm-usor/contracts';
import { type EmployeeImportPayload, proposalSchema } from '@ssm-usor/import';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { type AdminClient, createAdminClient } from '../../lib/admin-db';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError, type BrokenConstraint } from '../../lib/errors';
import { blocksReporterOf } from '../extras/reporting';
import { libraryPartExpiry } from './library';
import { type ExistingRecords, type RegisteredCompany } from './payload';
import { describe } from './pipeline';
import { importFileColumns, type ImportFileRow, importStore } from './store';

// Members read imports through their own policies; every write is the secret key's, after the
// import was found under the caller's token, or one of the functions that check the caller
// themselves (ADR 030, docs/data-model.md).

export type UsageColumns = {
  input_tokens: unknown;
  cached_input_tokens: unknown;
  output_tokens: unknown;
  cost_usd: unknown;
};

// Postgres numeric and bigint may arrive as strings.
export const modelUsageOf = (row: UsageColumns) => ({
  costUsd: Number(row.cost_usd ?? 0),
  inputTokens: Number(row.input_tokens ?? 0),
  cachedInputTokens: Number(row.cached_input_tokens ?? 0),
  outputTokens: Number(row.output_tokens ?? 0),
});

export type ImportRow = Pick<
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
  import_library_parts: {
    part: ImportLibraryPart;
    status: Database['public']['Enums']['import_library_part_status'];
  }[];
};

export const summaryColumns =
  'id, kind, status, client_id, into_existing_client, company_name, company_cui, source_import_id, failure_reason, created_by, created_at, updated_at, started_at, ready_at, failed_at, confirmed_at, clients!imports_client_in_organization(id, legal_name), import_files(count), last_file:import_files(updated_at), import_library_parts(part, status)';

// The clean-up fails an import uploading or ready with no change to it or its files for 14 days
// (fail_stalled_imports).
export const leftForDays = 14;

export const detailColumns = `${summaryColumns}, version, proposal, changes, proposal_dropped_at, read_characters, input_tokens, cached_input_tokens, output_tokens, cost_usd, usage_by_step`;

export const conflict = (message: string, reason: string) =>
  new ApiError('conflict', message, undefined, reason);

export const notFound = () =>
  new ApiError('not_found', 'This import does not exist in your organization.');

export async function creatorNames(db: DataClient, rows: { created_by: string | null }[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.created_by ? [row.created_by] : [])))];
  if (ids.length === 0) return new Map<string, string>();
  const { data, error } = await db.from('profiles').select('user_id, full_name').in('user_id', ids);
  if (error) throw fromDatabaseError(error, 'read import creators');
  return new Map(data.map((profile) => [profile.user_id, profile.full_name]));
}

export function expiresAtOf(row: Pick<ImportRow, 'status' | 'updated_at' | 'last_file'>) {
  if (row.status !== 'uploading' && row.status !== 'ready') return null;
  const changed = Math.max(
    ...[row.updated_at, ...(row.last_file ?? []).map((file) => file.updated_at)].map((at) =>
      Date.parse(at)
    )
  );
  return new Date(changed + leftForDays * 24 * 60 * 60 * 1000).toISOString();
}

export function toSummary(
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
    libraryParts: (row.import_library_parts ?? []).map((part) => ({
      part: part.part,
      status: part.status,
      expiresAt: libraryPartExpiry(row.confirmed_at),
    })),
  };
}

export async function findImport(db: DataClient, importId: string) {
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

export const wrongKind = () =>
  conflict('This import is of another kind.', importErrorReasons.wrongKind);

export async function listFilesOf(db: DataClient, importId: string) {
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
  const [client, fireSafety, workplaces, positions, employees, persons, substances] =
    await Promise.all([
      db.from('clients').select('*').eq('id', clientId).maybeSingle(),
      db.from('client_fire_safety').select('*').eq('client_id', clientId).maybeSingle(),
      db
        .from('client_workplaces')
        .select(
          'id, name, address_line, is_registered_office, office_has_activity, assembly_point, extinguisher_norm, combustible_materials, ignition_sources, fire_risk_equipment, specific_measures'
        )
        .eq('client_id', clientId)
        .is('archived_at', null),
      db
        .from('job_positions')
        .select('id, name, staff_category')
        .eq('client_id', clientId)
        .is('archived_at', null),
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
      db.from('fire_substances').select('name').eq('client_id', clientId),
    ]);
  for (const answer of [
    client,
    fireSafety,
    workplaces,
    positions,
    employees,
    persons,
    substances,
  ]) {
    if (answer.error) throw fromDatabaseError(answer.error, 'read the client of an import');
  }
  return {
    client: client.data as Record<string, unknown> | null,
    fireSafety: fireSafety.data as Record<string, unknown> | null,
    workplaces: workplaces.data ?? [],
    jobPositions: positions.data ?? [],
    employees: employees.data ?? [],
    responsiblePersons: persons.data ?? [],
    substances: substances.data ?? [],
  };
}

export function storedProposal(value: unknown) {
  if (value === null || typeof value !== 'object') return null;
  const proposal = proposalSchema.safeParse(value);
  if (!proposal.success) return null;
  const registered = (value as { registeredCompany?: RegisteredCompany | null }).registeredCompany;
  return { proposal: proposal.data, registeredCompany: registered ?? null };
}

export function storedChanges(value: unknown): ImportChanges | null {
  if (value === null) return null;
  const changes = importChangesSchema.safeParse(value);
  return changes.success ? changes.data : null;
}

export type ImportProgress = NonNullable<ImportSummary['progress']>;

export function progressOf(files: Pick<ImportFileRow, 'state' | 'is_scan'>[]): ImportProgress {
  const scans = files.filter((file) => file.is_scan);
  return {
    files: files.length,
    prepared: files.filter((file) => !['uploading', 'uploaded'].includes(file.state)).length,
    scans: scans.length,
    scansRead: scans.filter((file) => file.state !== 'prepared').length,
  };
}

// Built from the request, so that its writes name the member as their audit actor.
export const adminImportStore = (c: Context<ApiEnv>, admin: AdminClient = createAdminClient(c)) =>
  importStore(admin, blocksReporterOf(c));

export const proposalListOfTable: Record<ImportKind, Record<string, string>> = {
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
    fire_substances: 'substances',
  },
  employees: {
    employees: 'people',
    trainings: 'rows',
    training_records: 'rows',
    test_results: 'rows',
    client_files: 'pages',
  },
};

export const registeredOfficeKey = 'client_workplaces_registered_office_key';

export const employeeKeys: Record<string, { column: 'cnp' | 'employee_number'; field: string }> = {
  employees_client_cnp_key: { column: 'cnp', field: 'cnp' },
  employees_client_employee_number_key: { column: 'employee_number', field: 'employeeNumber' },
};

export function proposalPathOf(constraint: BrokenConstraint, kind: ImportKind) {
  const lists = proposalListOfTable[kind];
  const table =
    constraint.table ?? Object.keys(lists).find((name) => constraint.name.startsWith(`${name}_`));
  return (table && lists[table]) ?? table ?? constraint.name;
}

export type DatabaseFailure = { code?: string | null; message?: string; details?: string | null };

// Postgres names the duplicate value only in the error's details, which are never logged.
export function duplicatePersonPath(
  error: DatabaseFailure,
  name: string,
  payload: EmployeeImportPayload
) {
  const key = employeeKeys[name]!;
  const value = /=\([^,]*, (.*)\) already exists/.exec(error.details ?? '')?.[1];
  const person = payload.employees.find((employee) => employee[key.column] === value);
  return person ? `people.${person.key}.fields.${key.field}` : 'people';
}

export function decisionError(
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
    // Another member listed or removed the client's substances, or changed its workplaces or
    // employees, since the review was read.
    case 'SUB01':
    case 'SUB02':
    case 'WPL01':
    case 'WPL02':
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

// A message lost here loses only its alerts (ADR 037): the daily clean-up writes the copy.
export async function queueEnded(c: Context<ApiEnv>, importId: string, part?: ImportLibraryPart) {
  try {
    await c.env.IMPORT_QUEUE?.send({ type: 'ended', importId, ...(part ? { part } : {}) });
  } catch (failure) {
    console.error(`The end of import ${importId} was not queued: ${describe(failure)}`);
  }
}
