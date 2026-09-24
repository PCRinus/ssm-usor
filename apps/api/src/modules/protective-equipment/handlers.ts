import type { RouteHandler } from '@hono/zod-openapi';
import type { EquipmentEntry, EquipmentEntryRequest } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import {
  findJobPosition,
  jobPositionColumns,
  jobPositionCounts,
  toJobPosition,
} from '../job-positions/handlers';
import type {
  copyEquipmentRoute,
  createEquipmentEntryRoute,
  decideProtectiveEquipmentRoute,
  equipmentSuggestionsRoute,
  listEquipmentRoute,
  removeEquipmentEntryRoute,
  updateEquipmentEntryRoute,
} from './routes';

// The database keeps the position's decision in step with its entries and refuses the
// contradictions (ADR 011); the handlers only word them.

type EntryRow = Pick<
  Database['public']['Tables']['job_position_equipment']['Row'],
  | 'id'
  | 'job_position_id'
  | 'risk'
  | 'item'
  | 'quantity'
  | 'duration_months'
  | 'allocation'
  | 'created_at'
  | 'updated_at'
>;

const entryColumns =
  'id, job_position_id, risk, item, quantity, duration_months, allocation, created_at, updated_at';

const toEntry = (row: EntryRow): EquipmentEntry => ({
  id: row.id,
  jobPositionId: row.job_position_id,
  risk: row.risk,
  item: row.item,
  quantity: row.quantity,
  durationMonths: row.duration_months,
  allocation: row.allocation,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRow = (body: EquipmentEntryRequest) => ({
  risk: body.risk,
  item: body.item,
  quantity: body.quantity,
  duration_months: body.durationMonths ?? null,
  allocation: body.allocation,
});

const noSuchEntry = () =>
  new ApiError('not_found', 'This entry does not exist on this job position.');

async function listEntries(db: DataClient, jobPositionId: string) {
  const { data, error } = await db
    .from('job_position_equipment')
    .select(entryColumns)
    .eq('job_position_id', jobPositionId)
    .order('created_at')
    .order('id');
  if (error) throw fromDatabaseError(error, 'list equipment entries');
  return data.map(toEntry);
}

async function decisionOf(db: DataClient, jobPositionId: string) {
  const { data, error } = await db
    .from('job_positions')
    .select('needs_protective_equipment')
    .eq('id', jobPositionId)
    .single();
  if (error) throw fromDatabaseError(error, 'read equipment decision');
  return data.needs_protective_equipment;
}

export const listEquipment: RouteHandler<typeof listEquipmentRoute, ApiEnv> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const db = createDataClient(c);
  const position = await findJobPosition(db, clientId, jobPositionId);
  const items = await listEntries(db, jobPositionId);
  return c.json({ items, needsProtectiveEquipment: position.needs_protective_equipment }, 200);
};

export const createEquipmentEntry: RouteHandler<typeof createEquipmentEntryRoute, ApiEnv> = async (
  c
) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const { data, error } = await db
    .from('job_position_equipment')
    .insert({
      ...toRow(c.req.valid('json')),
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      job_position_id: jobPositionId,
      created_by: c.get('user').id,
    })
    .select(entryColumns)
    .single();
  if (error) throw fromDatabaseError(error, 'create equipment entry');
  return c.json({ entry: toEntry(data) }, 201);
};

export const updateEquipmentEntry: RouteHandler<typeof updateEquipmentEntryRoute, ApiEnv> = async (
  c
) => {
  const { clientId, jobPositionId, entryId } = c.req.valid('param');
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const { data, error } = await db
    .from('job_position_equipment')
    .update(toRow(c.req.valid('json')))
    .eq('id', entryId)
    .eq('job_position_id', jobPositionId)
    .select(entryColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'update equipment entry');
  if (!data) throw noSuchEntry();
  return c.json({ entry: toEntry(data) }, 200);
};

export const removeEquipmentEntry: RouteHandler<typeof removeEquipmentEntryRoute, ApiEnv> = async (
  c
) => {
  const { clientId, jobPositionId, entryId } = c.req.valid('param');
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const { data, error } = await db
    .from('job_position_equipment')
    .delete()
    .eq('id', entryId)
    .eq('job_position_id', jobPositionId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete equipment entry');
  if (data.length === 0) throw noSuchEntry();
  return c.body(null, 204);
};

export const copyEquipment: RouteHandler<typeof copyEquipmentRoute, ApiEnv> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const { fromJobPositionId } = c.req.valid('json');
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  if (fromJobPositionId === jobPositionId) {
    throw new ApiError('validation_error', 'A position cannot copy its own entries.', [
      { path: 'fromJobPositionId', message: 'Choose another position of this client.' },
    ]);
  }
  const source = await db
    .from('job_positions')
    .select('id')
    .eq('id', fromJobPositionId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (source.error) throw fromDatabaseError(source.error, 'find source job position');
  if (!source.data) {
    throw new ApiError('validation_error', 'The source is not a position of this client.', [
      { path: 'fromJobPositionId', message: 'Choose another position of this client.' },
    ]);
  }
  const entries = await listEntries(db, fromJobPositionId);
  if (entries.length > 0) {
    const { error } = await db.from('job_position_equipment').insert(
      entries.map((entry) => ({
        risk: entry.risk,
        item: entry.item,
        quantity: entry.quantity,
        duration_months: entry.durationMonths,
        allocation: entry.allocation,
        organization_id: c.get('membership').organizationId,
        client_id: clientId,
        job_position_id: jobPositionId,
        created_by: c.get('user').id,
      }))
    );
    if (error) throw fromDatabaseError(error, 'copy equipment entries');
  }
  const items = await listEntries(db, jobPositionId);
  return c.json({ items, needsProtectiveEquipment: await decisionOf(db, jobPositionId) }, 200);
};

export const decideProtectiveEquipment: RouteHandler<
  typeof decideProtectiveEquipmentRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const { needsProtectiveEquipment } = c.req.valid('json');
  if (needsProtectiveEquipment === true) {
    throw new ApiError(
      'validation_error',
      'Adding an equipment entry says that the position needs equipment.',
      [{ path: 'needsProtectiveEquipment', message: 'Add an entry instead.' }],
      'equipment_decided_by_entries'
    );
  }
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const { data, error } = await db
    .from('job_positions')
    .update({ needs_protective_equipment: needsProtectiveEquipment })
    .eq('id', jobPositionId)
    .eq('client_id', clientId)
    .select(jobPositionColumns)
    .single();
  if (error?.code === 'EQP01') {
    throw new ApiError(
      'conflict',
      'The position has equipment entries; remove them before saying it needs none.',
      undefined,
      'equipment_entries_exist'
    );
  }
  if (error) throw fromDatabaseError(error, 'decide protective equipment');
  const counts = await jobPositionCounts(db, clientId, jobPositionId);
  return c.json({ jobPosition: toJobPosition(data, counts.get(jobPositionId)) }, 200);
};

const suggestionLimit = 20;

export const listEquipmentSuggestions: RouteHandler<
  typeof equipmentSuggestionsRoute,
  ApiEnv
> = async (c) => {
  const { field, query } = c.req.valid('query');
  const db = createDataClient(c);
  // Filtered here, not in the query: a typed `%` or `,` would otherwise become part of the
  // PostgREST filter, and an organization's entries are a few hundred rows at most.
  const { data, error } = await db
    .from('job_position_equipment')
    .select(`${field}, updated_at`)
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (error) throw fromDatabaseError(error, 'list equipment suggestions');
  const needle = query.toLocaleLowerCase('ro');
  const seen = new Set<string>();
  const items: string[] = [];
  for (const row of data as unknown as Record<string, string>[]) {
    const value = row[field]!;
    const key = value.toLocaleLowerCase('ro');
    if (seen.has(key) || !key.includes(needle)) continue;
    seen.add(key);
    items.push(value);
    if (items.length === suggestionLimit) break;
  }
  return c.json({ items }, 200);
};
