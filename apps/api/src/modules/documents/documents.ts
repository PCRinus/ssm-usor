import {
  type ClientDocument,
  type DocumentRevision,
  documentTypeKeys,
  type GenerateDocumentsRequest,
} from '@ssm-usor/contracts';
import { renderTemplate, TemplateError } from '@ssm-usor/document-engine';

import type { Database, Json } from '../../database.types';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import {
  buildDocumentContext,
  decisionNumberOf,
  type DocumentContext,
  documentData,
  missingDocumentData,
  stableJson,
} from './context';
import { loadDocumentFacts, type StoredDocumentFacts } from './facts';

// A client's documentation set: listing it and generating what it does not have yet.

type Tables = Database['public']['Tables'];
type RevisionRow = Pick<
  Tables['document_revisions']['Row'],
  'id' | 'revision' | 'status' | 'data_snapshot' | 'edited_at' | 'issued_at' | 'created_at'
> & { document_generations: { issue_date: string } | null };
type DocumentRow = Pick<
  Tables['client_documents']['Row'],
  'id' | 'client_id' | 'type_key' | 'title' | 'decision_number'
> & { document_revisions: RevisionRow[] };

const documentColumns =
  'id, client_id, type_key, title, decision_number, document_revisions(id, revision, status, data_snapshot, edited_at, issued_at, created_at, document_generations(issue_date))';

const typeOrder = new Map<string, number>(documentTypeKeys.map((key, index) => [key, index]));

export type Actor = { userId: string; organizationId: string; createdBy: string };

/**
 * Whether the stored facts would print differently from what the draft was generated from.
 * Nothing to compare for an uploaded file, and nothing to say while data is missing.
 */
function dataChanged(document: DocumentRow, revision: RevisionRow, facts: StoredDocumentFacts) {
  if (revision.status !== 'draft' || !revision.data_snapshot || !revision.document_generations) {
    return false;
  }
  const input = {
    ...facts,
    issueDate: revision.document_generations.issue_date,
    firstDecisionNumber: 1,
  };
  if (missingDocumentData(input).length > 0) return true;
  const current: Record<string, unknown> = documentData(
    buildDocumentContext(input),
    document.type_key,
    document.decision_number
  );
  // The snapshot holds what the document printed; the rest of the data is not its concern.
  return Object.entries(revision.data_snapshot as Record<string, unknown>).some(
    ([name, printed]) => stableJson(current[name]) !== stableJson(printed)
  );
}

function toRevision(
  document: DocumentRow,
  revision: RevisionRow,
  facts: StoredDocumentFacts
): DocumentRevision {
  return {
    id: revision.id,
    revision: revision.revision,
    status: revision.status,
    issueDate: revision.document_generations?.issue_date ?? null,
    dataChanged: dataChanged(document, revision, facts),
    editedAt: revision.edited_at,
    issuedAt: revision.issued_at,
    createdAt: revision.created_at,
  };
}

function toDocument(document: DocumentRow, facts: StoredDocumentFacts): ClientDocument {
  const current = (status: RevisionRow['status']) => {
    const revision = document.document_revisions.find((item) => item.status === status);
    return revision ? toRevision(document, revision, facts) : null;
  };
  return {
    id: document.id,
    clientId: document.client_id,
    typeKey: document.type_key,
    title: document.title,
    decisionNumber: document.decision_number,
    draft: current('draft'),
    issued: current('issued'),
  };
}

// The pack's own order first, then anything a provider added, by title.
const byPackOrder = (a: ClientDocument, b: ClientDocument) =>
  (typeOrder.get(a.typeKey) ?? Infinity) - (typeOrder.get(b.typeKey) ?? Infinity) ||
  a.title.localeCompare(b.title, 'ro');

async function readDocuments(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('client_documents')
    .select(documentColumns)
    .eq('client_id', clientId)
    .returns<DocumentRow[]>();
  if (error) throw fromDatabaseError(error, 'list client documents');
  return data;
}

export async function listClientDocuments(db: DataClient, actor: Actor, clientId: string) {
  // Also answers 404 for a client of another organization.
  const facts = await loadDocumentFacts(db, clientId, actor.userId);
  const [documents, generation] = await Promise.all([
    readDocuments(db, clientId),
    db
      .from('document_generations')
      .select('issue_date, first_decision_number')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (generation.error) throw fromDatabaseError(generation.error, 'last document generation');
  return {
    items: documents.map((document) => toDocument(document, facts)).sort(byPackOrder),
    lastGeneration: generation.data
      ? {
          issueDate: generation.data.issue_date,
          firstDecisionNumber: generation.data.first_decision_number,
        }
      : null,
  };
}

type Template = { typeKey: string; title: string; versionId: string; storagePath: string };

/** The newest registered version of every built-in template that can be generated. */
async function builtInTemplates(db: DataClient): Promise<Template[]> {
  const { data, error } = await db
    .from('document_templates')
    .select('type_key, title, document_template_versions(id, version, storage_path)')
    .is('organization_id', null)
    .in('type_key', [...documentTypeKeys]);
  if (error) throw fromDatabaseError(error, 'built-in templates');
  return data.flatMap((template) => {
    const newest = template.document_template_versions.reduce<
      (typeof template.document_template_versions)[number] | null
    >((best, version) => (!best || version.version > best.version ? version : best), null);
    return newest
      ? [
          {
            typeKey: template.type_key,
            title: template.title,
            versionId: newest.id,
            storagePath: newest.storage_path,
          },
        ]
      : [];
  });
}

/**
 * The merged file, and the part of the data it printed. That part is the revision's snapshot:
 * a new first-aider then marks the first aid decision as out of date, not the whole set.
 */
export function merge(template: Uint8Array, data: Record<string, unknown>, typeKey: string) {
  try {
    const { document, usedNames } = renderTemplate(template, data);
    return {
      bytes: document,
      snapshot: Object.fromEntries(usedNames.map((name) => [name, data[name]])),
    };
  } catch (error) {
    // The readiness check should make this unreachable: a template asks for a name the
    // context does not have.
    if (error instanceof TemplateError) {
      console.error(`Template ${typeKey} could not be merged: ${error.message}`);
      throw new ApiError('internal_error', 'A document template could not be filled in.');
    }
    throw error;
  }
}

/**
 * Generates every document type the client does not have yet, as revision 1 in draft.
 * Documents that exist are left alone: generating one again is asked for one document at a
 * time, because it discards what was edited by hand.
 */
export async function generateClientDocuments(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  clientId: string,
  request: GenerateDocumentsRequest
) {
  const facts = await loadDocumentFacts(db, clientId, actor.userId);
  if (facts.clientArchived) {
    throw new ApiError('conflict', 'Documents are only generated for an active client.');
  }
  const input = { ...facts, ...request };
  const missing = missingDocumentData(input);
  if (missing.length > 0) {
    throw new ApiError(
      'conflict',
      `Data the documents print is missing: ${missing.join(', ')}.`,
      undefined,
      'missing_document_data'
    );
  }
  const context = buildDocumentContext(input);

  const [templates, existing] = await Promise.all([
    builtInTemplates(db),
    readDocuments(db, clientId),
  ]);
  if (templates.length === 0) {
    console.error('No built-in templates are registered: run pnpm templates:register.');
    throw new ApiError('service_unavailable', 'The document templates are not available yet.');
  }
  // A document without a revision is what a failed generation leaves behind: finish it.
  const complete = new Set(
    existing.filter((document) => document.document_revisions.length > 0).map((d) => d.type_key)
  );
  const wanted = templates.filter((template) => !complete.has(template.typeKey));
  if (wanted.length === 0) return { created: [], skipped: [...complete] };

  const generation = await db
    .from('document_generations')
    .insert({
      organization_id: actor.organizationId,
      client_id: clientId,
      issue_date: request.issueDate,
      first_decision_number: request.firstDecisionNumber,
      created_by: actor.createdBy,
    })
    .select('id')
    .single();
  if (generation.error) throw fromDatabaseError(generation.error, 'create document generation');

  // A few at a time: a Worker holds six connections open at once.
  const createdIds: string[] = [];
  for (let start = 0; start < wanted.length; start += 4) {
    const batch = wanted.slice(start, start + 4).map((template) =>
      createDocument(db, files, actor, clientId, generation.data.id, template, context, {
        existingId: existing.find((document) => document.type_key === template.typeKey)?.id,
      })
    );
    createdIds.push(...(await Promise.all(batch)));
  }

  const documents = await readDocuments(db, clientId);
  return {
    created: documents
      .filter((document) => createdIds.includes(document.id))
      .map((document) => toDocument(document, facts))
      .sort(byPackOrder),
    skipped: [...complete],
  };
}

async function createDocument(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  clientId: string,
  generationId: string,
  template: Template,
  context: DocumentContext,
  options: { existingId?: string }
) {
  const decisionNumber = decisionNumberOf(context, template.typeKey);
  const data = documentData(context, template.typeKey, decisionNumber);
  const { bytes, snapshot } = merge(
    await files.readTemplate(template.storagePath),
    data,
    template.typeKey
  );

  let documentId = options.existingId;
  if (!documentId) {
    const document = await db
      .from('client_documents')
      .insert({
        organization_id: actor.organizationId,
        client_id: clientId,
        type_key: template.typeKey,
        title: template.title,
        decision_number: decisionNumber,
        created_by: actor.createdBy,
      })
      .select('id')
      .single();
    if (document.error) throw fromDatabaseError(document.error, 'create client document');
    documentId = document.data.id;
  }

  // The row before the file: the storage policies only accept the file of a draft revision.
  const path = `${actor.organizationId}/${clientId}/${documentId}/1.docx`;
  const revision = await db
    .from('document_revisions')
    .insert({
      organization_id: actor.organizationId,
      document_id: documentId,
      revision: 1,
      template_version_id: template.versionId,
      generation_id: generationId,
      docx_path: path,
      data_snapshot: snapshot as Json,
      created_by: actor.createdBy,
    })
    .select('id')
    .single();
  if (revision.error) throw fromDatabaseError(revision.error, 'create document revision');
  try {
    // Replacing covers a file left behind by a revision that was deleted without it.
    await files.writeDocument(path, bytes, { replace: true });
  } catch (error) {
    // A revision without a file is worse than no revision: the next generation makes it again.
    await db.from('document_revisions').delete().eq('id', revision.data.id);
    throw error;
  }
  return documentId;
}

/** A link to the Word file of one revision, named after the document. */
export async function documentDownloadLink(
  db: DataClient,
  files: FileStore,
  documentId: string,
  revisionId: string
) {
  const { data, error } = await db
    .from('document_revisions')
    .select('docx_path, revision, client_documents(title)')
    .eq('id', revisionId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find document revision');
  if (!data) throw new ApiError('not_found', 'This document revision does not exist.');
  const expiresInSeconds = 60;
  const fileName = `${fileNameOf(data.client_documents.title)} (rev. ${data.revision}).docx`;
  return {
    url: await files.documentLink(data.docx_path, fileName, expiresInSeconds),
    fileName,
    expiresInSeconds,
  };
}

// What a file system accepts; the dash of a cover's title becomes a plain hyphen.
const fileNameOf = (title: string) =>
  title
    .replace(/[–—]/g, '-')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
