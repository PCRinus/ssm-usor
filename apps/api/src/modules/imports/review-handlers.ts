import type { RouteHandler } from '@hono/zod-openapi';
import {
  type EmployeeImportChanges,
  type ImportChanges,
  type ImportDetail,
  importErrorReasons,
  type ImportFileType,
  type ImportKind,
  type ImportUsage,
} from '@ssm-usor/contracts';
import { type EmployeeImportProposal, toEmployeePayload } from '@ssm-usor/import';
import type { Context } from 'hono';

import type { Json } from '../../database.types';
import { createAdminClient } from '../../lib/admin-db';
import { adminToolsAllowed } from '../../lib/auth';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { noticeEmployeesOverStepLater } from '../billing/employees-over-step-notices';
import { creditsStore } from '../credits/store';
import { importCreditsOf } from '../credits/usage';
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
  conflict,
  creatorNames,
  decisionError,
  existingRecords,
  findImport,
  listFilesOf,
  modelUsageOf,
  notFound,
  progressOf,
  queueEnded,
  storedChanges,
  storedProposal,
  toSummary,
  type UsageColumns,
  wrongKind,
} from './import-queries';
import { noExistingRecords, toClientPayload } from './payload';
import { describe } from './pipeline';
import type {
  confirmImportRoute,
  getImportRoute,
  saveEmployeeImportChangesRoute,
  saveImportChangesRoute,
} from './routes';
import { type ImportFileRow } from './store';

async function requireKind(db: DataClient, importId: string, kind: ImportKind) {
  const { data, error } = await db.from('imports').select('kind').eq('id', importId).maybeSingle();
  if (error) throw fromDatabaseError(error, 'find import');
  if (!data) throw notFound();
  if (data.kind !== kind) throw wrongKind();
}

function usageOf(row: UsageColumns & { read_characters: number | null; usage_by_step: unknown }) {
  const steps =
    row.usage_by_step && typeof row.usage_by_step === 'object' && !Array.isArray(row.usage_by_step)
      ? (row.usage_by_step as Record<string, UsageColumns | null | undefined>)
      : {};
  const bySteps: ImportUsage['bySteps'] = {};
  for (const step of [
    'sorting',
    'reading',
    'scanning',
    'locating',
    'instructions',
    'risks',
  ] as const) {
    const usage = steps[step];
    if (usage && typeof usage === 'object') bySteps[step] = modelUsageOf(usage);
  }
  return {
    ...modelUsageOf(row),
    readCharacters: row.read_characters,
    bySteps,
  } satisfies ImportUsage;
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
    documentDomain: file.document_domain,
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

// The ledger is the secret key's alone; the import was found under the caller's token first.
const creditsOfImport = async (c: Context<ApiEnv>, importId: string) =>
  importCreditsOf(await creditsStore(createAdminClient(c)).importEntries([importId]));

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
  const blockers =
    visible && row.status === 'ready'
      ? (await clientMapping(db, row, stored, changes)).blockers
      : [];
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
    credits: await creditsOfImport(c, row.id),
    ...(adminToolsAllowed(c) ? { usage: usageOf(row) } : {}),
  };
  return c.json({ import: detail }, 200);
};

type FoundImport = Awaited<ReturnType<typeof findImport>>;

async function clientMapping(
  db: DataClient,
  row: Pick<FoundImport, 'into_existing_client' | 'client_id'>,
  stored: NonNullable<ReturnType<typeof storedProposal>>,
  changes: ImportChanges | null
) {
  return toClientPayload({
    proposal: stored.proposal,
    changes,
    intoExistingClient: row.into_existing_client,
    existing:
      row.into_existing_client && row.client_id
        ? await existingRecords(db, row.client_id)
        : noExistingRecords,
    registeredCompany: stored.registeredCompany,
  });
}

async function employeeMapping(
  db: DataClient,
  clientId: string,
  proposal: EmployeeImportProposal,
  changes: EmployeeImportChanges | null
) {
  return toEmployeePayload({
    proposal,
    changes,
    records: await employeeImportClient(db, clientId),
    today: romanianToday(),
  });
}

async function employeeImportDetail(c: Context<ApiEnv>, db: DataClient, row: FoundImport) {
  const files = await listFilesOf(db, row.id);
  const reviewed = row.status === 'ready' || row.status === 'confirmed';
  const proposal = reviewed ? storedEmployeeProposal(row.proposal) : null;
  const changes = proposal ? storedEmployeeChanges(row.changes) : null;
  const states = proposal ? personStates(proposal, changes) : null;
  let blockers: ImportDetail['blockers'] = [];
  if (proposal && row.status === 'ready' && row.client_id) {
    blockers = (await employeeMapping(db, row.client_id, proposal, changes)).blockers;
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
    credits: await creditsOfImport(c, row.id),
    ...(adminToolsAllowed(c) ? { usage: usageOf(row) } : {}),
  };
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
  const { data: row, error } = await db
    .from('imports')
    .select('kind, proposal, into_existing_client, client_id')
    .eq('id', importId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find import');
  if (!row) throw notFound();
  if (row.kind !== 'client') throw wrongKind();
  const saved = await saveChanges(db, importId, version, changes);
  const stored = storedProposal(row.proposal);
  const blockers = stored ? (await clientMapping(db, row, stored, changes)).blockers : [];
  return c.json({ version: saved, blockers }, 200);
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
  const { payload, blockers } = await clientMapping(db, row, stored, storedChanges(row.changes));
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
  noticeEmployeesOverStepLater(c);
  await queueCopy(c, importId);
  await queueEnded(c, importId);
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
  const { payload, blockers } = await employeeMapping(
    db,
    row.client_id,
    proposal,
    storedEmployeeChanges(row.changes)
  );
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
  noticeEmployeesOverStepLater(c);
  await queueCopy(c, row.id);
  await queueEnded(c, row.id);
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
