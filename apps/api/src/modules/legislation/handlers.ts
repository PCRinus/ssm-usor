import type { RouteHandler } from '@hono/zod-openapi';
import {
  type LegalAct,
  type LegalActStatus,
  type LegalChange,
  type LegalChangeResolution,
  type LegalCheckRun,
  legalCheckRunErrorSchema,
  type LegalCheckRunStatus,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { Database } from '../../database.types';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import type {
  getLatestLegalCheckRunRoute,
  listLegalActsRoute,
  listLegalChangesRoute,
} from './routes';

type ActRow = Database['public']['Tables']['legal_acts']['Row'];
type ChangeRow = Database['public']['Tables']['legal_changes']['Row'];
type RunRow = Database['public']['Tables']['legal_check_runs']['Row'];

const actColumns =
  'id, name, portal_id, portal_status, verified_consolidated_on, last_consolidated_on, last_amending_act, last_checked_at, checked_by_hand_on';
const changeColumns =
  'id, seen_at, consolidated_on, amending_act, resolution, resolved_at, resolved_by_note, act:legal_acts(id, name, portal_id)';

const runColumns =
  'id, started_at, finished_at, status, acts_checked, changes_found, acts_skipped, errors';

const collator = new Intl.Collator('ro');

// The casts below are safe: check constraints keep portal_status, resolution and status to these
// values.
const toAct = (row: Omit<ActRow, 'created_at' | 'updated_at'>): LegalAct => ({
  id: row.id,
  name: row.name,
  portalId: row.portal_id,
  portalStatus: row.portal_status as LegalActStatus | null,
  verifiedConsolidatedOn: row.verified_consolidated_on,
  lastConsolidatedOn: row.last_consolidated_on,
  lastAmendingAct: row.last_amending_act,
  lastCheckedAt: row.last_checked_at,
  checkedByHandOn: row.checked_by_hand_on,
});

const toChange = (
  row: Omit<ChangeRow, 'act_id'> & { act: Pick<ActRow, 'id' | 'name' | 'portal_id'> }
): LegalChange => ({
  id: row.id,
  act: { id: row.act.id, name: row.act.name, portalId: row.act.portal_id },
  seenAt: row.seen_at,
  consolidatedOn: row.consolidated_on,
  amendingAct: row.amending_act,
  resolution: row.resolution as LegalChangeResolution,
  resolvedAt: row.resolved_at,
  resolvedByNote: row.resolved_by_note,
});

export const listLegalActs: RouteHandler<typeof listLegalActsRoute, ApiEnv> = async (c) => {
  const { data, error } = await createDataClient(c).from('legal_acts').select(actColumns);
  if (error) throw fromDatabaseError(error, 'list legal acts');
  const items = data
    .map(toAct)
    .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  return c.json({ items }, 200);
};

export const listLegalChanges: RouteHandler<typeof listLegalChangesRoute, ApiEnv> = async (c) => {
  const { data, error } = await createDataClient(c)
    .from('legal_changes')
    .select(changeColumns)
    .order('seen_at', { ascending: false })
    .order('consolidated_on', { ascending: false })
    .order('id');
  if (error) throw fromDatabaseError(error, 'list legal changes');
  return c.json({ items: data.map(toChange) }, 200);
};

// Runs recorded before the errors had a kind carry only the act and the message.
const storedRunErrorsSchema = z.array(
  legalCheckRunErrorSchema.extend({
    kind: legalCheckRunErrorSchema.shape.kind.catch('other'),
  })
);

const toRun = (row: RunRow): LegalCheckRun => ({
  id: row.id,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  status: row.status as LegalCheckRunStatus,
  actsChecked: row.acts_checked,
  changesFound: row.changes_found,
  actsSkipped: row.acts_skipped,
  errors: row.errors === null ? null : storedRunErrorsSchema.parse(row.errors),
});

export const getLatestLegalCheckRun: RouteHandler<
  typeof getLatestLegalCheckRunRoute,
  ApiEnv
> = async (c) => {
  const { data, error } = await createDataClient(c)
    .from('legal_check_runs')
    .select(runColumns)
    .order('started_at', { ascending: false })
    .order('id')
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read the latest legislation check run');
  return c.json({ run: data && toRun(data) }, 200);
};
