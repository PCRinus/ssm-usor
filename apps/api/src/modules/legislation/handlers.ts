import type { RouteHandler } from '@hono/zod-openapi';
import {
  type LegalAct,
  type LegalActStatus,
  type LegalChangeOutcome,
  legalChangePassageSchema,
  type LegalCheckRun,
  type LegalCheckRunStatus,
  type WatchedLegalAct,
} from '@ssm-usor/contracts';
import { templateOfFile, templateOfType } from '@ssm-usor/document-engine/template-files';
import {
  storedAmendedUnitsSchema,
  storedAmendingActsSchema,
  storedHunksSchema,
  storedRunErrorsSchema,
} from '@ssm-usor/legislation-check/stored';

import type { Database } from '../../database.types';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { bundledActCitations, notCited } from './act-citations';
import type { getLatestLegalCheckRunRoute, listLegalActsRoute } from './routes';

type ActRow = Database['public']['Tables']['legal_acts']['Row'];
type PassageRow = Database['public']['Tables']['legal_change_passages']['Row'];
type RunRow = Database['public']['Tables']['legal_check_runs']['Row'];

const actColumns =
  'id, name, portal_id, portal_status, verified_consolidated_on, last_consolidated_on, last_amending_act, last_checked_at, checked_by_hand_on';
const runColumns =
  'id, started_at, finished_at, status, acts_checked, changes_found, acts_skipped, errors';

const collator = new Intl.Collator('ro');

// The casts below are safe: check constraints keep portal_status, outcome and status
// to these values.
const toAct = (
  row: Omit<
    ActRow,
    'created_at' | 'updated_at' | 'article_anchors' | 'anchors_consolidated_on' | 'anchors_read_at'
  >
): LegalAct => ({
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

export type StoredPassage = Omit<PassageRow, 'change_id' | 'manifest' | 'article'>;

export const toPassage = (row: StoredPassage) =>
  legalChangePassageSchema.parse({
    id: row.id,
    templateFile: row.template_file,
    document:
      (row.type_key ? templateOfType(row.type_key) : null) ?? templateOfFile(row.template_file),
    citationForm: row.citation_form,
    locator: row.locator,
    unit: row.unit_label,
    status: row.status,
    oldText: row.old_text,
    newText: row.new_text,
    hunks: storedHunksSchema.parse(row.hunks),
  });

export const passageOrder = (
  a: Pick<PassageRow, 'template_file' | 'paragraph' | 'unit_label'>,
  b: Pick<PassageRow, 'template_file' | 'paragraph' | 'unit_label'>
) =>
  a.template_file.localeCompare(b.template_file) ||
  a.paragraph - b.paragraph ||
  a.unit_label.localeCompare(b.unit_label);

export const amendingActsOf = (stored: unknown) =>
  storedAmendingActsSchema
    .parse(stored)
    .map((act) => ({ name: act.name, adoptedOn: act.date, portalId: act.portalId }));

export const amendedUnitsOf = (stored: unknown) =>
  storedAmendedUnitsSchema
    .parse(stored)
    .map(({ unit, operation, date, amendingAct }) => ({ unit, operation, date, amendingAct }));

export const listLegalActs: RouteHandler<typeof listLegalActsRoute, ApiEnv> = async (c) => {
  const client = createDataClient(c);
  const [acts, open] = await Promise.all([
    client.from('legal_acts').select(actColumns),
    client
      .from('legal_changes')
      .select('id, act_id, outcome')
      .eq('resolution', 'open')
      .order('consolidated_on', { ascending: false })
      .order('seen_at', { ascending: false })
      .order('id'),
  ]);
  if (acts.error) throw fromDatabaseError(acts.error, 'list legal acts');
  if (open.error) throw fromDatabaseError(open.error, 'list the open legal changes');
  const openChangeOf = new Map<string, WatchedLegalAct['openChange']>();
  for (const change of open.data) {
    if (!openChangeOf.has(change.act_id)) {
      openChangeOf.set(change.act_id, {
        id: change.id,
        outcome: change.outcome as LegalChangeOutcome | null,
      });
    }
  }
  const citations = bundledActCitations();
  const items = acts.data
    .map((row): WatchedLegalAct => ({
      ...toAct(row),
      ...(citations.get(row.id) ?? notCited),
      openChange: openChangeOf.get(row.id) ?? null,
    }))
    .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  return c.json({ items }, 200);
};

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
