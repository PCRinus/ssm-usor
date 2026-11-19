import type { RouteHandler } from '@hono/zod-openapi';
import {
  confirmedListed,
  type EmployeeImportPeople,
  importErrorReasons,
  libraryPartDays,
} from '@ssm-usor/contracts';

import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { listPage } from '../../lib/list-page';
import { uninvitedOfImports } from '../participants/standings';
import { peopleCounts, personStates, storedEmployeeChanges } from './employees';
import {
  creatorNames,
  decisionError,
  type ImportProgress,
  type ImportRow,
  progressOf,
  queueEnded,
  summaryColumns,
  toSummary,
} from './import-queries';
import type { abandonImportRoute, listClosedImportsRoute, listImportsRoute } from './routes';

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

export const listImports: RouteHandler<typeof listImportsRoute, ApiEnv> = async (c) => {
  const { clientId, kind = 'client', status = 'open', withOpenParts } = c.req.valid('query');
  const db = createDataClient(c);
  const everyKind = db.from('imports').select(summaryColumns);
  const selected = kind === 'all' ? everyKind : everyKind.eq('kind', kind);
  const lastConfirmed = () => {
    const latest = selected.eq('status', 'confirmed').order('confirmed_at', { ascending: false });
    // A client gets a client import only when a member re-imports its pack, so its own are few.
    return clientId && kind === 'client' ? latest : latest.limit(confirmedListed);
  };
  const query = (
    status === 'confirmed'
      ? lastConfirmed()
      : selected.in('status', [...openStatuses]).order('created_at', { ascending: false })
  )
    .order('updated_at', { referencedTable: 'last_file', ascending: false })
    .limit(1, { referencedTable: 'last_file' });
  const withParts = status === 'open' && withOpenParts === true && kind !== 'employees';
  const [{ data, error }, partsOpen] = await Promise.all([
    clientId ? query.eq('client_id', clientId) : query,
    withParts ? confirmedWithOpenParts(db, clientId) : null,
  ]);
  if (error) throw fromDatabaseError(error, 'list imports');
  const rows = partsOpen ? [...data, ...partsOpen].sort(newestFirst) : data;
  const countUninvited = status === 'confirmed' && kind === 'employees' && clientId;
  return c.json({ items: await summariesOf(db, rows, countUninvited ? clientId : null) }, 200);
};

export const listClosedImports: RouteHandler<typeof listClosedImportsRoute, ApiEnv> = async (c) => {
  const { kind, page, pageSize } = c.req.valid('query');
  const db = createDataClient(c);
  const { rows, total } = await listPage({
    page,
    pageSize,
    rows: (from, to) =>
      db
        .from('imports')
        .select(summaryColumns, { count: 'exact' })
        .eq('kind', kind)
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: false })
        .order('id', { ascending: false })
        .order('updated_at', { referencedTable: 'last_file', ascending: false })
        .limit(1, { referencedTable: 'last_file' })
        .range(from, to),
    recount: () =>
      db
        .from('imports')
        .select('id', { count: 'exact', head: true })
        .eq('kind', kind)
        .not('closed_at', 'is', null),
    what: 'closed imports',
  });
  return c.json({ items: await summariesOf(db, rows, null), page, pageSize, total }, 200);
};

const openPartStatuses: readonly string[] = ['reading', 'to_review'];

// A part can be confirmed until libraryPartDays after its import was (ILP04), so only those
// imports are read, and their open parts picked here: an inner join would drop the other parts.
async function confirmedWithOpenParts(db: DataClient, clientId: string | undefined) {
  const since = new Date(Date.now() - libraryPartDays * 24 * 60 * 60 * 1000).toISOString();
  const query = db
    .from('imports')
    .select(summaryColumns)
    .eq('kind', 'client')
    .eq('status', 'confirmed')
    .gt('confirmed_at', since)
    .order('updated_at', { referencedTable: 'last_file', ascending: false })
    .limit(1, { referencedTable: 'last_file' });
  const { data, error } = await (clientId ? query.eq('client_id', clientId) : query);
  if (error) throw fromDatabaseError(error, 'list imports with open library parts');
  return data.filter((row) =>
    row.import_library_parts.some((part) => openPartStatuses.includes(part.status))
  );
}

const newestFirst = (one: ImportRow, other: ImportRow) =>
  Date.parse(other.created_at) - Date.parse(one.created_at) || other.id.localeCompare(one.id);

async function summariesOf(db: DataClient, rows: ImportRow[], uninvitedOf: string | null) {
  const [names, people, uninvited, progress] = await Promise.all([
    creatorNames(db, rows),
    peopleOfReady(
      db,
      rows.filter((row) => row.kind === 'employees' && row.status === 'ready').map((row) => row.id)
    ),
    uninvitedOf
      ? uninvitedOfImports(
          db,
          uninvitedOf,
          rows.map((row) => row.id)
        )
      : null,
    progressOfRunning(
      db,
      rows.filter((row) => runningStatuses.includes(row.status)).map((row) => row.id)
    ),
  ]);
  return rows.map((row) =>
    toSummary(
      row,
      names,
      people.get(row.id) ?? null,
      uninvited ? (uninvited.get(row.id) ?? 0) : null,
      progress.get(row.id) ?? null
    )
  );
}

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

export const abandonImport: RouteHandler<typeof abandonImportRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { error } = await createDataClient(c).rpc('abandon_import', { p_import_id: importId });
  if (error?.code === 'IMP01') {
    throw ApiError.conflict(
      importErrorReasons.ended,
      'The import is already confirmed or abandoned.'
    );
  }
  if (error) throw decisionError(error, 'abandon import');
  await queueEnded(c, importId);
  return c.body(null, 204);
};
