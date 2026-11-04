import type { RouteHandler } from '@hono/zod-openapi';
import type { ImportLibraryPart } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { createAdminClient } from '../../lib/admin-db';
import { alertSender } from '../../lib/alerts';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { later } from './handlers';
import { reportAlert, reportAlertMinutes } from './import-alerts';
import type { reportImportLibraryPartRoute, reportImportRoute } from './routes';

async function reportedImport(c: Context<ApiEnv>, importId: string) {
  const { data, error } = await createDataClient(c)
    .from('imports')
    .select('id, kind, organization_id, cost_usd')
    .eq('id', importId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find reported import');
  if (!data) throw new ApiError('not_found', 'This import does not exist in your organization.');
  return data;
}

// The update that only a quiet row takes decides who alerts, so two reports at once alert once.
async function record(c: Context<ApiEnv>, importId: string, part: ImportLibraryPart | null) {
  const admin = createAdminClient(c);
  const report = { reported_at: new Date().toISOString(), reported_by: c.get('user').id };
  const quiet = `reported_at.is.null,reported_at.lt.${new Date(Date.now() - reportAlertMinutes * 60_000).toISOString()}`;
  if (part) {
    const first = await admin
      .from('import_library_parts')
      .update(report)
      .eq('import_id', importId)
      .eq('part', part)
      .or(quiet)
      .select('part');
    if (first.error) throw fromDatabaseError(first.error, 'report library part');
    if (first.data.length > 0) return true;
    const again = await admin
      .from('import_library_parts')
      .update(report)
      .eq('import_id', importId)
      .eq('part', part);
    if (again.error) throw fromDatabaseError(again.error, 'report library part');
    return false;
  }
  const first = await admin
    .from('imports')
    .update(report)
    .eq('id', importId)
    .or(quiet)
    .select('id');
  if (first.error) throw fromDatabaseError(first.error, 'report import');
  if (first.data.length > 0) return true;
  const again = await admin.from('imports').update(report).eq('id', importId);
  if (again.error) throw fromDatabaseError(again.error, 'report import');
  return false;
}

async function report(c: Context<ApiEnv>, importId: string, part: ImportLibraryPart | null) {
  const row = await reportedImport(c, importId);
  if (part) {
    const { data, error } = await createDataClient(c)
      .from('import_library_parts')
      .select('part')
      .eq('import_id', importId)
      .eq('part', part)
      .maybeSingle();
    if (error) throw fromDatabaseError(error, 'find reported library part');
    if (!data)
      throw new ApiError('not_found', 'This import has no such part in your organization.');
  }
  if (!(await record(c, importId, part))) return;
  later(
    c,
    alertSender(c.env).send(
      reportAlert(
        {
          importId,
          organizationId: row.organization_id,
          kind: row.kind,
          part,
          costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
        },
        c.get('user').id
      )
    )
  );
}

export const reportImport: RouteHandler<typeof reportImportRoute, ApiEnv> = async (c) => {
  await report(c, c.req.valid('param').importId, null);
  return c.body(null, 204);
};

export const reportImportLibraryPart: RouteHandler<
  typeof reportImportLibraryPartRoute,
  ApiEnv
> = async (c) => {
  const { importId, part } = c.req.valid('param');
  await report(c, importId, part);
  return c.body(null, 204);
};
