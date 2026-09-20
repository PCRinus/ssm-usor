import type { RouteHandler } from '@hono/zod-openapi';
import type { JobPosition, JobPositionRequest } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type {
  createJobPositionRoute,
  listJobPositionsRoute,
  removeJobPositionRoute,
  updateJobPositionRoute,
} from './routes';

// The posts a client employs people in (ADR 006). Row-level security scopes every query to
// the caller's organization, and the database holds the rules: one name per client, no
// archiving from under the people in a position, no deleting one an employee points at.

type JobPositionRow = Pick<
  Database['public']['Tables']['job_positions']['Row'],
  | 'id'
  | 'client_id'
  | 'name'
  | 'staff_category'
  | 'work_zone'
  | 'activities'
  | 'training_interval_months'
  | 'created_at'
  | 'updated_at'
>;

const jobPositionColumns =
  'id, client_id, name, staff_category, work_zone, activities, training_interval_months, created_at, updated_at';

const toJobPosition = (row: JobPositionRow, employeeCount: number): JobPosition => ({
  id: row.id,
  clientId: row.client_id,
  name: row.name,
  staffCategory: row.staff_category,
  workZone: row.work_zone,
  activities: row.activities,
  trainingIntervalMonths: row.training_interval_months,
  employeeCount,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRow = (body: JobPositionRequest) => ({
  name: body.name,
  staff_category: body.staffCategory,
  work_zone: body.workZone ?? null,
  activities: body.activities ?? null,
  training_interval_months: body.trainingIntervalMonths ?? null,
});

const noSuchJobPosition = () =>
  new ApiError('not_found', 'This job position does not exist under this client.');

const nameTaken = () =>
  new ApiError(
    'conflict',
    'This client already has a job position of this name.',
    [{ path: 'name', message: 'This client already has a job position of this name.' }],
    'job_position_name_taken'
  );

async function findClient(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('id, archived_at')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw new ApiError('not_found', 'This client does not exist in your organization.');
  return data;
}

/** How many current employees are in each of the client's positions. */
async function employeeCounts(db: DataClient, clientId: string, jobPositionId?: string) {
  // Counted by the database, one row per position, so a large client is not cut short by the
  // limit on rows a request returns.
  let query = db
    .from('job_positions')
    .select('id, employees(count)')
    .eq('client_id', clientId)
    .neq('employees.status', 'terminated')
    .is('employees.archived_at', null);
  if (jobPositionId) query = query.eq('id', jobPositionId);
  const { data, error } = await query.returns<{ id: string; employees: { count: number }[] }[]>();
  if (error) throw fromDatabaseError(error, 'count employees by job position');
  return new Map(data.map((row) => [row.id, row.employees[0]?.count ?? 0]));
}

export const listJobPositions: RouteHandler<typeof listJobPositionsRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const { data, error } = await db
    .from('job_positions')
    .select(jobPositionColumns)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .order('name')
    .order('id');
  if (error) throw fromDatabaseError(error, 'list job positions');
  const counts = await employeeCounts(db, clientId);
  return c.json({ items: data.map((row) => toJobPosition(row, counts.get(row.id) ?? 0)) }, 200);
};

export const createJobPosition: RouteHandler<typeof createJobPositionRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  const client = await findClient(db, clientId);
  if (client.archived_at) {
    throw new ApiError('conflict', 'This client is archived; job positions cannot be added.');
  }
  const { data, error } = await db
    .from('job_positions')
    .insert({
      ...toRow(c.req.valid('json')),
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      created_by: c.get('user').id,
    })
    .select(jobPositionColumns)
    .single();
  if (error)
    throw error.code === '23505' ? nameTaken() : fromDatabaseError(error, 'create job position');
  return c.json({ jobPosition: toJobPosition(data, 0) }, 201);
};

export const updateJobPosition: RouteHandler<typeof updateJobPositionRoute, ApiEnv> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const db = createDataClient(c);
  const { data, error } = await db
    .from('job_positions')
    .update(toRow(c.req.valid('json')))
    .eq('id', jobPositionId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .select(jobPositionColumns)
    .maybeSingle();
  if (error)
    throw error.code === '23505' ? nameTaken() : fromDatabaseError(error, 'update job position');
  if (!data) throw noSuchJobPosition();
  const counts = await employeeCounts(db, clientId, jobPositionId);
  return c.json({ jobPosition: toJobPosition(data, counts.get(jobPositionId) ?? 0) }, 200);
};

export const removeJobPosition: RouteHandler<typeof removeJobPositionRoute, ApiEnv> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const db = createDataClient(c);
  const found = await db
    .from('job_positions')
    .select('id')
    .eq('id', jobPositionId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .maybeSingle();
  if (found.error) throw fromDatabaseError(found.error, 'find job position');
  if (!found.data) throw noSuchJobPosition();

  const deleted = await db.from('job_positions').delete().eq('id', jobPositionId);
  if (!deleted.error) return c.body(null, 204);
  // 23503: an employee points at it, so it is kept and archived instead.
  if (deleted.error.code !== '23503') throw fromDatabaseError(deleted.error, 'delete job position');

  const archived = await db
    .from('job_positions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', jobPositionId);
  if (archived.error?.code === 'JOB01') {
    throw new ApiError(
      'conflict',
      'Employees are still in this job position. Move them to another one first.',
      undefined,
      'job_position_held'
    );
  }
  if (archived.error) throw fromDatabaseError(archived.error, 'archive job position');
  return c.body(null, 204);
};
