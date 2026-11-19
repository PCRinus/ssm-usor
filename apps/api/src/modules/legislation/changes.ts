import type { RouteHandler } from '@hono/zod-openapi';
import {
  type AppliedLegalChange,
  type AppliedLegalChangeListResponse,
  documentSetOf,
  type LegalChangeAct,
  type LegalChangeBehind,
  type LegalChangeDetail,
  type LegalChangeDocument,
  type LegalChangeOutcome,
  type LegalChangeResolution,
  type LegalChangeUpdatedDocument,
  type OpenLegalChange,
  pageRange,
} from '@ssm-usor/contracts';
import { templateOfFile } from '@ssm-usor/document-engine/template-files';

import { createDataClient, type DataClient, everyRow, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { bundledActCitations, bundledCitingDocuments, documentOfType } from './act-citations';
import {
  amendedUnitsOf,
  amendingActsOf,
  passageOrder,
  type StoredPassage,
  toPassage,
} from './handlers';
import type {
  getLegalChangeRoute,
  listAppliedLegalChangesRoute,
  listOpenLegalChangesRoute,
} from './routes';

type StoredAct = { id: string; name: string; portal_id: number | null };
type StoredVersion = {
  id: string;
  version: number;
  note: string | null;
  created_at: string;
  template: { type_key: string; title: string };
};

const actEmbed = 'act:legal_acts(id, name, portal_id)';
const versionsEmbed =
  'versions:document_template_versions!template_version_legal_changes(id, version, note, created_at, template:document_templates(type_key, title))';

const collator = new Intl.Collator('ro');

const toAct = (act: StoredAct): LegalChangeAct => ({
  id: act.id,
  name: act.name,
  portalId: act.portal_id,
  subject: bundledActCitations().get(act.id)?.subject ?? null,
});

const citedBy = (actId: string) => bundledCitingDocuments().get(actId) ?? [];

// Registration links a later version to every form its manifest names, one an earlier version
// already answered included; the earliest is the one that brought the change in.
const updatedDocumentsOf = (versions: StoredVersion[]): LegalChangeUpdatedDocument[] => {
  const earliest = new Map<string, StoredVersion>();
  for (const each of versions) {
    const kept = earliest.get(each.template.type_key);
    if (!kept || kept.version > each.version) earliest.set(each.template.type_key, each);
  }
  return [...earliest.values()]
    .map((each) => ({
      typeKey: each.template.type_key,
      title: each.template.title,
      set: documentSetOf(each.template.type_key),
      version: each.version,
      note: each.note,
      registeredAt: each.created_at,
    }))
    .sort((a, b) => collator.compare(a.title, b.title));
};

type BehindRow = {
  type_key: string;
  client_id: string;
  document_id: string;
  revision_version: number;
};

async function behindRows(db: DataClient, organizationId: string, typeKeys: string[]) {
  if (typeKeys.length === 0) return [];
  const rows = await everyRow(
    (from, to) =>
      db
        .from('documents_behind')
        .select('type_key, client_id, document_id, revision_version')
        .eq('organization_id', organizationId)
        .eq('behind_template', true)
        .in('type_key', typeKeys)
        .order('document_id')
        .range(from, to),
    'documents behind the legal changes'
  );
  // The generated types make every view column nullable; these come from not-null columns.
  return rows as BehindRow[];
}

// Counted against the answering version rather than the template's newest, so a later correction
// of the same template does not hide the documents still missing the change.
function behindOf(updated: LegalChangeUpdatedDocument[], rows: BehindRow[]): LegalChangeBehind {
  const documents = new Set<string>();
  const clients = new Set<string>();
  const types: LegalChangeBehind['types'] = [];
  for (const document of updated) {
    const behind = rows.filter(
      (row) => row.type_key === document.typeKey && row.revision_version < document.version
    );
    if (behind.length === 0) continue;
    const typeClients = new Set(behind.map((row) => row.client_id));
    for (const row of behind) documents.add(row.document_id);
    for (const client of typeClients) clients.add(client);
    types.push({
      typeKey: document.typeKey,
      title: document.title,
      set: document.set,
      documents: new Set(behind.map((row) => row.document_id)).size,
      clients: typeClients.size,
    });
  }
  return { documents: documents.size, clients: clients.size, types };
}

type OpenRow = {
  id: string;
  seen_at: string;
  consolidated_on: string;
  outcome: string | null;
  act: StoredAct;
  passages: Pick<StoredPassage, 'template_file' | 'type_key' | 'paragraph' | 'unit_label'>[];
};

const toOpenChange = (row: OpenRow): OpenLegalChange => {
  const passages = [...row.passages].sort(passageOrder);
  const documents = new Map<string, LegalChangeDocument>();
  for (const passage of passages) {
    const typeKey = passage.type_key ?? templateOfFile(passage.template_file)?.typeKey;
    const document = typeKey ? documentOfType(typeKey) : null;
    if (document && !documents.has(document.typeKey)) documents.set(document.typeKey, document);
  }
  return {
    id: row.id,
    act: toAct(row.act),
    consolidatedOn: row.consolidated_on,
    seenAt: row.seen_at,
    // A check constraint keeps the outcome to these values.
    outcome: row.outcome as LegalChangeOutcome | null,
    touched: {
      documents: [...documents.values()],
      units: [...new Set(passages.map((passage) => passage.unit_label))],
    },
    citedBy: citedBy(row.act.id),
  };
};

export const listOpenLegalChanges: RouteHandler<typeof listOpenLegalChangesRoute, ApiEnv> = async (
  c
) => {
  const { data, error } = await createDataClient(c)
    .from('legal_changes')
    .select(
      `id, seen_at, consolidated_on, outcome, ${actEmbed}, passages:legal_change_passages(template_file, type_key, paragraph, unit_label)`
    )
    .eq('resolution', 'open')
    .order('consolidated_on', { ascending: false })
    .order('seen_at', { ascending: false })
    .order('id');
  if (error) throw fromDatabaseError(error, 'list the open legal changes');
  return c.json({ items: data.map(toOpenChange) }, 200);
};

export const listAppliedLegalChanges: RouteHandler<
  typeof listAppliedLegalChangesRoute,
  ApiEnv
> = async (c) => {
  const { page, pageSize } = c.req.valid('query');
  const db = createDataClient(c);
  const listed = () =>
    db
      .from('legal_changes')
      .select(
        `id, seen_at, consolidated_on, resolved_at, resolved_by_note, ${actEmbed}, ${versionsEmbed}`,
        {
          count: 'exact',
        }
      )
      .eq('resolution', 'template_version')
      .order('consolidated_on', { ascending: false })
      .order('seen_at', { ascending: false })
      .order('id');
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await listed().range(from, to);
  if (error?.code === 'PGRST103') {
    // PostgREST refuses a range past the last row, and counts nothing then.
    const recount = await listed().range(0, 0);
    if (recount.error) throw fromDatabaseError(recount.error, 'count the applied legal changes');
    return c.json(
      {
        items: [],
        page,
        pageSize,
        total: recount.count ?? 0,
      } satisfies AppliedLegalChangeListResponse,
      200
    );
  }
  if (error) throw fromDatabaseError(error, 'list the applied legal changes');

  const updated = data.map((row) => updatedDocumentsOf(row.versions));
  const rows = await behindRows(db, c.get('membership').organizationId, [
    ...new Set(updated.flat().map((document) => document.typeKey)),
  ]);
  const items = data.map((row, index): AppliedLegalChange => ({
    id: row.id,
    act: toAct(row.act),
    consolidatedOn: row.consolidated_on,
    seenAt: row.seen_at,
    appliedAt: row.resolved_at!,
    note: row.resolved_by_note,
    updatedDocuments: updated[index]!,
    behind: behindOf(updated[index]!, rows),
  }));
  return c.json({ items, page, pageSize, total: count ?? items.length }, 200);
};

export const getLegalChange: RouteHandler<typeof getLegalChangeRoute, ApiEnv> = async (c) => {
  const { changeId } = c.req.valid('param');
  const db = createDataClient(c);
  const { data: row, error } = await db
    .from('legal_changes')
    .select(
      `id, seen_at, consolidated_on, amending_act, resolution, resolved_at, resolved_by_note, outcome, compared_with, assessed_at, amending_acts, amended_units, ${actEmbed}, passages:legal_change_passages(id, template_file, type_key, paragraph, citation_form, locator, unit_label, status, old_text, new_text, hunks), ${versionsEmbed}`
    )
    .eq('id', changeId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read a legal change');
  if (!row) throw new ApiError('not_found', 'Modificarea nu există.');

  const updatedDocuments = updatedDocumentsOf(row.versions);
  const rows = await behindRows(
    db,
    c.get('membership').organizationId,
    updatedDocuments.map((document) => document.typeKey)
  );
  const change: LegalChangeDetail = {
    id: row.id,
    act: toAct(row.act),
    seenAt: row.seen_at,
    consolidatedOn: row.consolidated_on,
    amendingAct: row.amending_act,
    // Check constraints keep the resolution and the outcome to these values.
    resolution: row.resolution as LegalChangeResolution,
    resolvedAt: row.resolved_at,
    resolvedByNote: row.resolved_by_note,
    outcome: row.outcome as LegalChangeOutcome | null,
    comparedWith: row.compared_with,
    assessedAt: row.assessed_at,
    amendingActs: amendingActsOf(row.amending_acts),
    amendedUnits: amendedUnitsOf(row.amended_units),
    passages: [...row.passages].sort(passageOrder).map(toPassage),
    updatedDocuments,
    citedBy: citedBy(row.act.id),
    behind: behindOf(updatedDocuments, rows),
  };
  return c.json({ change }, 200);
};
