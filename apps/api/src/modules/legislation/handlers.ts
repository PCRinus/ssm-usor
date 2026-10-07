import type { RouteHandler } from '@hono/zod-openapi';
import type {
  LegalAct,
  LegalActStatus,
  LegalChange,
  LegalChangeResolution,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import type { listLegalActsRoute, listLegalChangesRoute } from './routes';

type ActRow = Database['public']['Tables']['legal_acts']['Row'];
type ChangeRow = Database['public']['Tables']['legal_changes']['Row'];

const actColumns =
  'id, name, portal_id, portal_status, verified_consolidated_on, last_consolidated_on, last_amending_act, last_checked_at, checked_by_hand_on';
const changeColumns =
  'id, seen_at, consolidated_on, amending_act, resolution, resolved_at, resolved_by_note, act:legal_acts(id, name, portal_id)';

const collator = new Intl.Collator('ro');

// The casts below are safe: check constraints keep portal_status and resolution to these values.
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
