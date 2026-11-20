import type { RouteHandler } from '@hono/zod-openapi';
import type { JobPositionRequest } from '@ssm-usor/contracts';

import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { byRomanianName } from '../../lib/romanian';
import { requireClient, requireWritableClient } from '../clients/lookup';
import {
  jobPositionColumns,
  jobPositionCounts,
  noSuchJobPosition,
  toJobPosition,
} from './positions';
import type {
  createJobPositionRoute,
  listJobPositionsRoute,
  removeJobPositionRoute,
  updateJobPositionRoute,
} from './routes';

// The posts a client employs people in (ADR 006). Row-level security scopes every query to
// the caller's organization, and the database holds the rules: one name per client, no
// archiving from under the people in a position, no deleting one an employee points at.

const toRow = (body: JobPositionRequest) => ({
  name: body.name,
  staff_category: body.staffCategory,
  work_zone: body.workZone ?? null,
  activities: body.activities ?? null,
  training_interval_months: body.trainingIntervalMonths ?? null,
});

const nameTaken = () =>
  new ApiError(
    'conflict',
    'This client already has a job position of this name.',
    [{ path: 'name', message: 'This client already has a job position of this name.' }],
    'job_position_name_taken'
  );

export const listJobPositions: RouteHandler<typeof listJobPositionsRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await requireClient(db, clientId);
  const { data, error } = await db
    .from('job_positions')
    .select(jobPositionColumns)
    .eq('client_id', clientId)
    .is('archived_at', null);
  if (error) throw fromDatabaseError(error, 'list job positions');
  const counts = await jobPositionCounts(db, clientId);
  return c.json(
    {
      items: [...data].sort(byRomanianName).map((row) => toJobPosition(row, counts.get(row.id))),
    },
    200
  );
};

export const createJobPosition: RouteHandler<typeof createJobPositionRoute, ApiEnv> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await requireWritableClient(db, clientId);
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
  return c.json({ jobPosition: toJobPosition(data) }, 201);
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
  const counts = await jobPositionCounts(db, clientId, jobPositionId);
  return c.json({ jobPosition: toJobPosition(data, counts.get(jobPositionId)) }, 200);
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
    throw ApiError.conflict(
      'job_position_held',
      'Employees are still in this job position. Move them to another one first.'
    );
  }
  if (archived.error) throw fromDatabaseError(archived.error, 'archive job position');
  return c.body(null, 204);
};
