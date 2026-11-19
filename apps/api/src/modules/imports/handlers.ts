import type { RouteHandler } from '@hono/zod-openapi';
import {
  confirmedListed,
  type EmployeeImportPeople,
  importErrorReasons,
} from '@ssm-usor/contracts';

import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { uninvitedOfImports } from '../participants/standings';
import { peopleCounts, personStates, storedEmployeeChanges } from './employees';
import {
  conflict,
  creatorNames,
  decisionError,
  type ImportProgress,
  progressOf,
  queueEnded,
  summaryColumns,
  toSummary,
} from './import-queries';
import type { abandonImportRoute, listImportsRoute } from './routes';

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
  const { clientId, kind = 'client', status = 'open' } = c.req.valid('query');
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

export const abandonImport: RouteHandler<typeof abandonImportRoute, ApiEnv> = async (c) => {
  const { importId } = c.req.valid('param');
  const { error } = await createDataClient(c).rpc('abandon_import', { p_import_id: importId });
  if (error?.code === 'IMP01') {
    throw conflict('The import is already confirmed or abandoned.', importErrorReasons.ended);
  }
  if (error) throw decisionError(error, 'abandon import');
  await queueEnded(c, importId);
  return c.body(null, 204);
};
