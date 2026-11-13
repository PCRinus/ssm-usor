import {
  type AdminLegalAct,
  type AdminLegalActList,
  adminLegalAmendedUnitSchema,
  adminLegalChangeDetailSchema,
  adminLegalChangeLinkRequestSchema,
  type AdminLegalChangeList,
  type AdminLegalChangeListItem,
  adminLegalChangeListQuerySchema,
  adminLegalChangeNoImpactRequestSchema,
  adminLegalChangePassageSchema,
  type AdminLegalCheckRunList,
  adminLegalCheckRunListQuerySchema,
  adminLegislationErrorReasons,
  type AdminTemplateVersion,
  adminVerifiedFormRequestSchema,
  type LegalActStatus,
  type LegalChangeOutcome,
  type LegalChangeResolution,
  legalCheckRunErrorSchema,
  type LegalCheckRunStatus,
  pageRange,
  type TemplateVersionKind,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';
import { z } from 'zod';

import type { Database } from '../../database.types';
import { type AdminClient, createAdminClient } from '../../lib/admin-db';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';

type ActRow = Database['public']['Tables']['legal_acts']['Row'];
type ChangeRow = Database['public']['Tables']['legal_changes']['Row'];
type PassageRow = Database['public']['Tables']['legal_change_passages']['Row'];
type RunRow = Database['public']['Tables']['legal_check_runs']['Row'];

const actColumns =
  'id, name, portal_id, portal_status, verified_consolidated_on, last_consolidated_on, last_amending_act, last_checked_at, checked_by_hand_on';
const changeColumns =
  'id, act_id, seen_at, consolidated_on, compared_with, outcome, assessed_at, amending_act, amending_acts, resolution, resolved_at, resolved_by_note, act:legal_acts(id, name, portal_id)';
const versionColumns =
  'id, version, kind, note, created_at, template:document_templates!inner(type_key, title)';

const collator = new Intl.Collator('ro', { numeric: true });

// The legislation Worker writes these columns; a field it did not write reads as absent.
const storedAmendingActsSchema = z
  .array(
    z
      .object({
        name: z.string(),
        date: z.iso.date().nullable().catch(null),
        portalId: z.int().positive().nullable().catch(null),
      })
      .transform((act) => ({ name: act.name, adoptedOn: act.date, portalId: act.portalId }))
  )
  .catch([]);
const storedAmendedUnitsSchema = z
  .array(adminLegalAmendedUnitSchema.extend({ subject: z.string().nullable().catch(null) }))
  .catch([]);
const storedReviewSchema = z.array(z.string()).catch([]);
const storedHunksSchema = adminLegalChangePassageSchema.shape.hunks.catch([]);
const storedRunErrorsSchema = z.array(
  legalCheckRunErrorSchema.extend({ kind: legalCheckRunErrorSchema.shape.kind.catch('other') })
);

type ChangeSummaryRow = Pick<
  ChangeRow,
  | 'id'
  | 'act_id'
  | 'seen_at'
  | 'consolidated_on'
  | 'compared_with'
  | 'outcome'
  | 'assessed_at'
  | 'amending_act'
  | 'amending_acts'
  | 'resolution'
  | 'resolved_at'
  | 'resolved_by_note'
> & { act: Pick<ActRow, 'id' | 'name' | 'portal_id'> };

// The casts are safe: check constraints keep outcome, resolution, status and kind to these values.
const summaryOf = (row: ChangeSummaryRow) => ({
  id: row.id,
  act: { id: row.act.id, name: row.act.name, portalId: row.act.portal_id },
  seenAt: row.seen_at,
  consolidatedOn: row.consolidated_on,
  comparedWith: row.compared_with,
  outcome: row.outcome as LegalChangeOutcome | null,
  assessedAt: row.assessed_at,
  amendingAct: row.amending_act,
  amendingActs: storedAmendingActsSchema.parse(row.amending_acts ?? []),
  resolution: row.resolution as LegalChangeResolution,
  resolvedAt: row.resolved_at,
  resolvedByNote: row.resolved_by_note,
});

type VersionRow = Pick<
  Database['public']['Tables']['document_template_versions']['Row'],
  'id' | 'version' | 'kind' | 'note' | 'created_at'
> & { template: { type_key: string; title: string } };

const toVersion = (row: VersionRow): AdminTemplateVersion => ({
  id: row.id,
  typeKey: row.template.type_key,
  title: row.template.title,
  version: row.version,
  kind: row.kind as TemplateVersionKind,
  note: row.note,
  createdAt: row.created_at,
});

const toPassage = (row: Omit<PassageRow, 'change_id'>) =>
  adminLegalChangePassageSchema.parse({
    id: row.id,
    manifest: row.manifest,
    templateFile: row.template_file,
    typeKey: row.type_key,
    paragraph: row.paragraph,
    citationForm: row.citation_form,
    locator: row.locator,
    article: row.article,
    unit: row.unit_label,
    status: row.status,
    oldText: row.old_text,
    newText: row.new_text,
    hunks: storedHunksSchema.parse(row.hunks),
  });

const passageOrder = (
  a: Pick<PassageRow, 'template_file' | 'paragraph' | 'unit_label'>,
  b: Pick<PassageRow, 'template_file' | 'paragraph' | 'unit_label'>
) =>
  a.template_file.localeCompare(b.template_file) ||
  a.paragraph - b.paragraph ||
  a.unit_label.localeCompare(b.unit_label);

function parsed<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      'validation_error',
      undefined,
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      }))
    );
  }
  return result.data;
}

const changeIdSchema = z.uuid();

function changeIdOf(c: Context<ApiEnv>) {
  const id = changeIdSchema.safeParse(c.req.param('id'));
  if (!id.success) throw new ApiError('not_found', 'No such legal change.');
  return id.data;
}

export async function listChanges(c: Context<ApiEnv>) {
  const query = parsed(adminLegalChangeListQuerySchema, c.req.query());
  let request = createAdminClient(c)
    .from('legal_changes')
    .select(`${changeColumns}, passages:legal_change_passages(count)`)
    .order('seen_at', { ascending: false })
    .order('consolidated_on', { ascending: false })
    .order('id');
  if (query.status === 'open') request = request.eq('resolution', 'open');
  if (query.status === 'resolved') request = request.neq('resolution', 'open');
  if (query.outcome === 'unassessed') request = request.is('outcome', null);
  else if (query.outcome) request = request.eq('outcome', query.outcome);
  const { data, error } = await request;
  if (error) throw fromDatabaseError(error, 'list legal changes');
  return c.json({
    items: data.map((row): AdminLegalChangeListItem => ({
      ...summaryOf(row),
      passageCount: row.passages[0]?.count ?? 0,
    })),
  } satisfies AdminLegalChangeList);
}

async function candidatesOf(db: AdminClient, change: ChangeSummaryRow, typeKeys: string[]) {
  if (change.resolution !== 'open' || typeKeys.length === 0) return [];
  const { data, error } = await db
    .from('document_template_versions')
    .select(versionColumns)
    .is('template.organization_id', null)
    .in('template.type_key', typeKeys)
    .is('resolves_legal_change_id', null)
    .neq('kind', 'layout')
    .gt('created_at', change.seen_at)
    .order('created_at', { ascending: false });
  if (error) throw fromDatabaseError(error, 'list the versions that can answer a legal change');
  return data.map(toVersion);
}

async function detailOf(db: AdminClient, id: string) {
  const [change, passages, resolving] = await Promise.all([
    db
      .from('legal_changes')
      .select(`${changeColumns}, amended_units, review`)
      .eq('id', id)
      .maybeSingle(),
    db
      .from('legal_change_passages')
      .select(
        'id, manifest, template_file, type_key, paragraph, citation_form, locator, article, unit_label, status, old_text, new_text, hunks'
      )
      .eq('change_id', id),
    db.from('document_template_versions').select(versionColumns).eq('resolves_legal_change_id', id),
  ]);
  if (change.error) throw fromDatabaseError(change.error, 'read legal change');
  if (passages.error) throw fromDatabaseError(passages.error, 'read legal change passages');
  if (resolving.error) throw fromDatabaseError(resolving.error, 'read resolving version');
  if (!change.data) throw new ApiError('not_found', 'No such legal change.');
  const typeKeys = [
    ...new Set(passages.data.flatMap((passage) => (passage.type_key ? [passage.type_key] : []))),
  ];
  return adminLegalChangeDetailSchema.parse({
    ...summaryOf(change.data),
    amendedUnits: storedAmendedUnitsSchema.parse(change.data.amended_units ?? []),
    review: storedReviewSchema.parse(change.data.review ?? []),
    passages: [...passages.data].sort(passageOrder).map(toPassage),
    resolvingVersion: resolving.data[0] ? toVersion(resolving.data[0]) : null,
    candidateVersions: await candidatesOf(db, change.data, typeKeys),
  });
}

export async function getChange(c: Context<ApiEnv>) {
  return c.json(await detailOf(createAdminClient(c), changeIdOf(c)));
}

function writeRefusal(error: { code?: string | null; message?: string }, context: string) {
  switch (error.code) {
    case 'P0002':
      return new ApiError('not_found', error.message);
    case 'LGA01':
      return new ApiError(
        'conflict',
        'The legal change is already resolved.',
        undefined,
        adminLegislationErrorReasons.changeNotOpen
      );
    case 'LGA02':
      return new ApiError(
        'unprocessable',
        'The template version cannot answer this legal change.',
        undefined,
        adminLegislationErrorReasons.versionCannotAnswer
      );
    case 'LGA03':
      return new ApiError(
        'unprocessable',
        'The form was not seen on the portal.',
        undefined,
        adminLegislationErrorReasons.formNotSeen
      );
    case 'LGA04':
      return new ApiError(
        'unprocessable',
        'A change of the act at or before this form is still open.',
        undefined,
        adminLegislationErrorReasons.openChangesAtOrBefore
      );
    case '22023':
      return new ApiError('validation_error', undefined, [
        { path: 'note', message: 'The note has 2 to 500 characters.' },
      ]);
  }
  return fromDatabaseError(error, context);
}

// The admin's own token: the database lets only a platform admin past his second factor make
// these writes, and names him in the audit event they record.
export async function resolveNoImpact(c: Context<ApiEnv>) {
  const id = changeIdOf(c);
  const body = parsed(adminLegalChangeNoImpactRequestSchema, await c.req.json().catch(() => null));
  const { error } = await createDataClient(c).rpc('admin_resolve_legal_change_no_impact', {
    p_change_id: id,
    p_note: body.note,
  });
  if (error) throw writeRefusal(error, 'resolve legal change as no impact');
  return c.json(await detailOf(createAdminClient(c), id));
}

export async function linkTemplateVersion(c: Context<ApiEnv>) {
  const id = changeIdOf(c);
  const body = parsed(adminLegalChangeLinkRequestSchema, await c.req.json().catch(() => null));
  const { error } = await createDataClient(c).rpc('admin_link_legal_change', {
    p_change_id: id,
    p_template_version_id: body.templateVersionId,
  });
  if (error) throw writeRefusal(error, 'link legal change to template version');
  return c.json(await detailOf(createAdminClient(c), id));
}

const toAct = (
  row: Omit<ActRow, 'created_at' | 'updated_at'>,
  openChanges: number
): AdminLegalAct => ({
  id: row.id,
  name: row.name,
  portalId: row.portal_id,
  portalStatus: row.portal_status as LegalActStatus | null,
  verifiedConsolidatedOn: row.verified_consolidated_on,
  lastConsolidatedOn: row.last_consolidated_on,
  lastAmendingAct: row.last_amending_act,
  lastCheckedAt: row.last_checked_at,
  checkedByHandOn: row.checked_by_hand_on,
  openChanges,
});

export async function listActs(c: Context<ApiEnv>) {
  const db = createAdminClient(c);
  const [acts, open] = await Promise.all([
    db.from('legal_acts').select(actColumns),
    db.from('legal_changes').select('act_id').eq('resolution', 'open'),
  ]);
  if (acts.error) throw fromDatabaseError(acts.error, 'list legal acts');
  if (open.error) throw fromDatabaseError(open.error, 'count open legal changes');
  const counts = new Map<string, number>();
  for (const row of open.data) counts.set(row.act_id, (counts.get(row.act_id) ?? 0) + 1);
  const items = acts.data
    .map((row) => toAct(row, counts.get(row.id) ?? 0))
    .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  return c.json({ items } satisfies AdminLegalActList);
}

export async function recordVerifiedForm(c: Context<ApiEnv>) {
  const actId = c.req.param('id') ?? '';
  const body = parsed(adminVerifiedFormRequestSchema, await c.req.json().catch(() => null));
  const { data, error } = await createDataClient(c).rpc('admin_record_verified_form', {
    p_act_id: actId,
    p_consolidated_on: body.consolidatedOn,
  });
  if (error) throw writeRefusal(error, 'record verified form');
  const open = await createAdminClient(c)
    .from('legal_changes')
    .select('id', { count: 'exact', head: true })
    .eq('act_id', data.id)
    .eq('resolution', 'open');
  if (open.error) throw fromDatabaseError(open.error, 'count open legal changes');
  return c.json(toAct(data, open.count ?? 0));
}

const toRun = (row: RunRow) => ({
  id: row.id,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  status: row.status as LegalCheckRunStatus,
  actsChecked: row.acts_checked,
  changesFound: row.changes_found,
  actsSkipped: row.acts_skipped,
  errors: row.errors === null ? null : storedRunErrorsSchema.parse(row.errors),
});

export async function listRuns(c: Context<ApiEnv>) {
  const { page, pageSize } = parsed(adminLegalCheckRunListQuerySchema, c.req.query());
  const db = createAdminClient(c);
  const listed = () =>
    db
      .from('legal_check_runs')
      .select('*', { count: 'exact' })
      .order('started_at', { ascending: false })
      .order('id');
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await listed().range(from, to);
  if (error?.code === 'PGRST103') {
    // PostgREST refuses a range past the last row, and counts nothing then.
    const recount = await listed().range(0, 0);
    if (recount.error) throw fromDatabaseError(recount.error, 'count legislation check runs');
    return c.json({
      items: [],
      page,
      pageSize,
      total: recount.count ?? 0,
    } satisfies AdminLegalCheckRunList);
  }
  if (error) throw fromDatabaseError(error, 'list legislation check runs');
  return c.json({
    items: data.map(toRun),
    page,
    pageSize,
    total: count ?? data.length,
  } satisfies AdminLegalCheckRunList);
}
