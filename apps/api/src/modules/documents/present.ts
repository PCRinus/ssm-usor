import {
  type ClientDocument,
  type DocumentAnnex,
  type DocumentRevision,
  type DocumentSet,
  documentSetTypeKeys,
  fireDecisionNumber,
  isDatedDocumentType,
  isDocumentEditable,
  type TemplateVersionKind,
} from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { stableJson } from '../../lib/json';
import { documentApplies } from './context';
import { loadDocumentFacts, loadFireYearRecords, type StoredDocumentFacts } from './facts';
import {
  type Actor,
  type DocumentRow,
  draftOf,
  issuedOf,
  lastGeneration,
  readDocument,
  readDocuments,
  readServiceContractRow,
  type RevisionRow,
} from './rows';
import { rulesOf, setOfGroup } from './sets';
import { annexDomainOf, annexedVersionIds, snapshotAnnexes } from './snapshot';

const typeOrders = Object.fromEntries(
  Object.entries(documentSetTypeKeys).map(([set, typeKeys]) => [
    set,
    new Map<string, number>(typeKeys.map((key, index) => [key, index])),
  ])
) as Record<DocumentSet, Map<string, number>>;

type ComparedDraft = RevisionRow & {
  data_snapshot: NonNullable<RevisionRow['data_snapshot']>;
  document_generations: NonNullable<RevisionRow['document_generations']>;
};

function isComparedDraft(document: DocumentRow, revision: RevisionRow): revision is ComparedDraft {
  return (
    setOfGroup(document.document_group) !== null &&
    revision.status === 'draft' &&
    Boolean(revision.data_snapshot) &&
    Boolean(revision.document_generations)
  );
}

/**
 * Whether the stored facts would print differently from what the draft was generated from.
 * Nothing to compare for an uploaded file. Data missing that this document prints changes it;
 * data missing elsewhere leaves the rest to compare with.
 */
function dataChanged(
  document: DocumentRow,
  revision: RevisionRow,
  facts: StoredDocumentFacts | null
) {
  if (!facts || !isComparedDraft(document, revision)) return false;
  if (setOfGroup(document.document_group) !== facts.set) return false;
  const rules = rulesOf(facts, {
    issueDate: revision.document_generations.issue_date,
    period: document.period,
    firstDecisionNumber:
      facts.set === 'fire_safety'
        ? (fireFirstDecisionNumber(document, revision.document_generations.first_decision_number) ??
          1)
        : 1,
  });
  // The snapshot holds what the document printed; the rest of the data is not its concern.
  const printed = revision.data_snapshot as Record<string, unknown>;
  const missing = rules.missing(document.type_key);
  if (missing.some((code) => rules.concerns(code, Object.keys(printed)))) return true;
  const current = rules.printedData(
    document.type_key,
    document.decision_number,
    Object.keys(printed)
  );
  return Object.entries(printed).some(
    ([name, value]) => stableJson(current[name]) !== stableJson(value)
  );
}

/**
 * What a fire-safety document was numbered from, null when nothing says. It prints every
 * decision's number in `fire` (ADR 018), so it is compared and generated again with the first
 * number it was made with, which a decision also carries as its own number. The occupational
 * safety set prints only a decision's own number, from `decision_number`.
 */
export function fireFirstDecisionNumber(
  document: Pick<DocumentRow, 'type_key' | 'decision_number'>,
  generationFirstNumber: number | null | undefined
) {
  const ordinalOffset = fireDecisionNumber(document.type_key, 1);
  if (ordinalOffset !== null && document.decision_number !== null) {
    return document.decision_number - ordinalOffset + 1;
  }
  return generationFirstNumber ?? null;
}

type ModuleVersion = { id: string; module_id: string; number: number; created_at: string };

type AnnexLookup = { annexed: Map<string, ModuleVersion>; current: Map<string, ModuleVersion> };

async function annexLookup(db: DataClient, documents: DocumentRow[]): Promise<AnnexLookup> {
  const versionIds = [
    ...new Set(
      documents
        .filter((document) => annexDomainOf(document.type_key))
        .flatMap((document) =>
          document.document_revisions.flatMap((revision) =>
            annexedVersionIds(revision.data_snapshot)
          )
        )
    ),
  ];
  const lookup: AnnexLookup = { annexed: new Map(), current: new Map() };
  if (versionIds.length === 0) return lookup;
  const annexed = await db
    .from('instruction_module_versions')
    .select('id, module_id, number, created_at')
    .in('id', versionIds);
  if (annexed.error) throw fromDatabaseError(annexed.error, 'read annexed module versions');
  for (const version of annexed.data) lookup.annexed.set(version.id, version);
  const all = await db
    .from('instruction_module_versions')
    .select('id, module_id, number, created_at')
    .in('module_id', [...new Set(annexed.data.map((version) => version.module_id))])
    .order('number', { ascending: false });
  if (all.error) throw fromDatabaseError(all.error, 'read current module versions');
  for (const version of all.data) {
    if (!lookup.current.has(version.module_id)) lookup.current.set(version.module_id, version);
  }
  return lookup;
}

function toAnnexes(
  document: DocumentRow,
  revision: RevisionRow,
  lookup: AnnexLookup
): DocumentAnnex[] {
  if (!annexDomainOf(document.type_key)) return [];
  return (snapshotAnnexes(revision.data_snapshot) ?? []).flatMap((annex) => {
    const version = lookup.annexed.get(annex.versionId);
    // Out of reach only for a snapshot naming another organization's module.
    if (!version) return [];
    const current = lookup.current.get(version.module_id);
    return [
      {
        number: annex.number,
        title: annex.title,
        moduleId: version.module_id,
        version: { id: version.id, number: version.number, createdAt: version.created_at },
        newerVersion:
          current && current.number > version.number
            ? { number: current.number, createdAt: current.created_at }
            : null,
      },
    ];
  });
}

function toRevision(
  document: DocumentRow,
  revision: RevisionRow,
  facts: StoredDocumentFacts | null,
  lookup: AnnexLookup
): DocumentRevision {
  return {
    id: revision.id,
    revision: revision.revision,
    status: revision.status,
    issueDate: revision.document_generations?.issue_date ?? null,
    dataChanged: dataChanged(document, revision, facts),
    editedAt: revision.edited_at,
    issuedAt: revision.issued_at,
    hasPdf: revision.pdf_path !== null,
    hasSignedCopy: Boolean(revision.document_signed_copies?.confirmed_at),
    receivedCopy:
      revision.document_signed_copies && !revision.document_signed_copies.confirmed_at
        ? { uploadedAt: revision.document_signed_copies.uploaded_at }
        : null,
    templateVersion: revision.document_template_versions && {
      version: revision.document_template_versions.version,
      kind: revision.document_template_versions.kind as TemplateVersionKind,
      note: revision.document_template_versions.note,
    },
    annexes: toAnnexes(document, revision, lookup),
    createdAt: revision.created_at,
  };
}

// Without facts for a document that is not merged from them: the service contract.
function toDocument(
  document: DocumentRow,
  facts: StoredDocumentFacts | null,
  lookup: AnnexLookup
): ClientDocument {
  const presented = (revision: RevisionRow | undefined) =>
    revision ? toRevision(document, revision, facts, lookup) : null;
  return {
    id: document.id,
    clientId: document.client_id,
    typeKey: document.type_key,
    title: document.title,
    decisionNumber: document.decision_number,
    period: document.period,
    draft: presented(draftOf(document)),
    issued: presented(issuedOf(document)),
    editable: isDocumentEditable(document.type_key),
  };
}

// A dated document's draft is compared with the records of its own year, which only it reads.
async function withYearRecords(
  db: DataClient,
  documents: DocumentRow[],
  facts: StoredDocumentFacts
): Promise<StoredDocumentFacts> {
  if (facts.set !== 'fire_safety') return facts;
  const periods = documents.flatMap((document) =>
    document.period !== null &&
    isDatedDocumentType(document.type_key) &&
    !(document.period in facts.fireSafety.yearRecords)
      ? [document.period]
      : []
  );
  if (periods.length === 0) return facts;
  const loaded = await loadFireYearRecords(db, documents[0]!.client_id, periods);
  return {
    ...facts,
    fireSafety: {
      ...facts.fireSafety,
      yearRecords: { ...facts.fireSafety.yearRecords, ...loaded },
    },
  };
}

export async function presentDocuments(
  db: DataClient,
  documents: DocumentRow[],
  facts: StoredDocumentFacts | null
) {
  const [lookup, complete] = await Promise.all([
    annexLookup(db, documents),
    facts && withYearRecords(db, documents, facts),
  ]);
  return documents.map((document) => toDocument(document, complete, lookup));
}

export async function presentDocument(
  db: DataClient,
  document: DocumentRow,
  facts: StoredDocumentFacts | null
) {
  const [presented] = await presentDocuments(db, [document], facts);
  return presented!;
}

export async function presentChanged(db: DataClient, actor: Actor, documentId: string) {
  const document = await readDocument(db, documentId);
  const set = setOfGroup(document.document_group);
  const facts =
    set && document.document_revisions.some((revision) => isComparedDraft(document, revision))
      ? await loadDocumentFacts(db, document.client_id, actor, set)
      : null;
  return presentDocument(db, document, facts);
}

// The pack's own order first, then anything a provider added, by title; a dated type's newest
// period first.
export const inSetOrder = (set: DocumentSet) => {
  const typeOrder = typeOrders[set];
  return (
    a: Pick<ClientDocument, 'typeKey' | 'title' | 'period'>,
    b: Pick<ClientDocument, 'typeKey' | 'title' | 'period'>
  ) =>
    (typeOrder.get(a.typeKey) ?? Infinity) - (typeOrder.get(b.typeKey) ?? Infinity) ||
    a.title.localeCompare(b.title, 'ro') ||
    (b.period ?? 0) - (a.period ?? 0);
};

/** With what its draft was merged from, for a caller that knows how to compare it. */
export async function readServiceContractDocument(db: DataClient, clientId: string) {
  const row = await readServiceContractRow(db, clientId);
  // Deleting its only draft leaves the row, for the next generation to write under. Without a
  // revision there is nothing to open, download or issue: the document is not generated.
  if (!row || row.document_revisions.length === 0) return { document: null, draftSnapshot: null };
  const draft = draftOf(row);
  return {
    document: await presentDocument(db, row, null),
    draftSnapshot: draft?.data_snapshot ?? null,
  };
}

export async function listClientDocuments(
  db: DataClient,
  actor: Actor,
  clientId: string,
  set: DocumentSet = 'occupational_safety'
) {
  const [facts, documents, generation] = await Promise.all([
    // Also answers 404 for a client of another organization.
    loadDocumentFacts(db, clientId, actor, set),
    readDocuments(db, clientId, set),
    lastGeneration(db, clientId, set),
  ]);
  if (generation.error) throw fromDatabaseError(generation.error, 'last document generation');
  return {
    items: (await presentDocuments(db, documents, facts)).sort(inSetOrder(set)),
    notApplicable: documentSetTypeKeys[set].filter(
      (typeKey) =>
        !documentApplies(facts, typeKey) &&
        !documents.some((document) => document.type_key === typeKey)
    ),
    currentEmployeeCount: facts.currentEmployeeCount,
    lastGeneration: generation.data
      ? {
          issueDate: generation.data.issue_date,
          firstDecisionNumber: generation.data.first_decision_number,
        }
      : null,
  };
}
