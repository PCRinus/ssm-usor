import {
  type ClientDocument,
  type DocumentFileFormat,
  type DocumentRevision,
  documentTypeKeys,
  type GenerateDocumentsRequest,
  type IssueDocumentRequest,
  isUploadedDocumentType,
  type PackDocumentTypeKey,
  packDocumentTypeKeys,
  type RegenerateDocumentRequest,
  unfilledMark,
  uploadedDocumentTypes,
} from '@ssm-usor/contracts';
import { documentText, renderTemplate, TemplateError } from '@ssm-usor/document-engine';

import type { Database, Json } from '../../database.types';
import { archivedClientError, type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import type { PdfConverter } from '../../lib/pdf';
import {
  buildDocumentContext,
  decisionNumberOf,
  type DocumentContext,
  documentData,
  missingDocumentData,
  stableJson,
} from './context';
import { loadDocumentFacts, type StoredDocumentFacts } from './facts';

type Tables = Database['public']['Tables'];
type RevisionRow = Pick<
  Tables['document_revisions']['Row'],
  | 'id'
  | 'revision'
  | 'status'
  | 'docx_path'
  | 'pdf_path'
  | 'generation_id'
  | 'data_snapshot'
  | 'edited_at'
  | 'issued_at'
  | 'created_at'
> & { document_generations: { issue_date: string } | null };
type DocumentRow = Pick<
  Tables['client_documents']['Row'],
  'id' | 'client_id' | 'type_key' | 'title' | 'decision_number' | 'document_group'
> & { document_revisions: RevisionRow[] };

const documentColumns =
  'id, client_id, type_key, title, decision_number, document_group, document_revisions(id, revision, status, docx_path, pdf_path, generation_id, data_snapshot, edited_at, issued_at, created_at, document_generations(issue_date))';

const typeOrder = new Map<string, number>(packDocumentTypeKeys.map((key, index) => [key, index]));

export type Actor = { userId: string; organizationId: string; createdBy: string };

/**
 * Whether the stored facts would print differently from what the draft was generated from.
 * Nothing to compare for an uploaded file, and nothing to say while data is missing.
 */
function dataChanged(
  document: DocumentRow,
  revision: RevisionRow,
  facts: StoredDocumentFacts | null
) {
  if (
    !facts ||
    revision.status !== 'draft' ||
    !revision.data_snapshot ||
    !revision.document_generations
  ) {
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
  facts: StoredDocumentFacts | null
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
    createdAt: revision.created_at,
  };
}

// Without facts for a document that is not merged from them: the service contract.
function toDocument(document: DocumentRow, facts: StoredDocumentFacts | null): ClientDocument {
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

// The documentation set. The client's other documents have routes of their own (ADR 007).
async function readDocuments(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('client_documents')
    .select(documentColumns)
    .eq('client_id', clientId)
    .eq('document_group', 'documentation_set')
    .returns<DocumentRow[]>();
  if (error) throw fromDatabaseError(error, 'list client documents');
  return data;
}

export async function readOtherDocument(db: DataClient, clientId: string, typeKey: string) {
  const { data, error } = await db
    .from('client_documents')
    .select(documentColumns)
    .eq('client_id', clientId)
    .eq('type_key', typeKey)
    .returns<DocumentRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find other client document');
  return data ? toDocument(data, null) : null;
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

async function builtInTemplates(
  db: DataClient,
  typeKeys: readonly string[] = documentTypeKeys
): Promise<Template[]> {
  const { data, error } = await db
    .from('document_templates')
    .select('type_key, title, document_template_versions(id, version, storage_path)')
    .is('organization_id', null)
    .in('type_key', [...typeKeys]);
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

async function readDocument(db: DataClient, documentId: string) {
  const { data, error } = await db
    .from('client_documents')
    .select(documentColumns)
    .eq('id', documentId)
    .returns<DocumentRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client document');
  if (!data) throw new ApiError('not_found', 'This document does not exist.');
  return data;
}

// Asked before any file is touched: the database refuses the row too, but only after the
// file has been written or the PDF made.
async function requireActiveClient(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('archived_at')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client of document');
  if (data?.archived_at) throw archivedClientError();
}

const newest = (document: DocumentRow) =>
  document.document_revisions.reduce<RevisionRow | null>(
    (best, revision) => (!best || revision.revision > best.revision ? revision : best),
    null
  );

/**
 * A draft is overwritten, hand edits included, which is what the person asked for; an issued
 * document gets a new draft revision and stays as it is until that one is issued.
 */
export async function regenerateDocument(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  documentId: string,
  request: RegenerateDocumentRequest
) {
  const document = await readDocument(db, documentId);
  if (document.document_group !== 'documentation_set') {
    // It would be merged with the facts of the documentation set, which it does not print.
    throw new ApiError('conflict', 'This document is generated from its own page.');
  }
  const facts = await loadDocumentFacts(db, document.client_id, actor.userId);
  if (facts.clientArchived) {
    throw new ApiError('conflict', 'Documents are only generated for an active client.');
  }
  const latest = newest(document);
  const issueDate = request.issueDate ?? latest?.document_generations?.issue_date;
  if (!issueDate) {
    // An uploaded file has no generation to take the date from.
    throw new ApiError('validation_error', 'Say which date the document carries.', [
      { path: 'issueDate', message: 'Required for a document that was not generated before.' },
    ]);
  }
  const input = { ...facts, issueDate, firstDecisionNumber: 1 };
  const missing = missingDocumentData(input);
  if (missing.length > 0) {
    throw new ApiError(
      'conflict',
      `Data the documents print is missing: ${missing.join(', ')}.`,
      undefined,
      'missing_document_data'
    );
  }
  const [template] = await builtInTemplates(db, [document.type_key]);
  if (!template) {
    throw new ApiError('conflict', 'This document has no template to be generated from.');
  }
  const data = documentData(
    buildDocumentContext(input),
    document.type_key,
    document.decision_number
  );
  const { bytes, snapshot } = merge(
    await files.readTemplate(template.storagePath),
    data,
    document.type_key
  );

  // The form is filled in again from the last generation, so its first number carries over.
  const previous = await db
    .from('document_generations')
    .select('first_decision_number')
    .eq('client_id', document.client_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous.error) throw fromDatabaseError(previous.error, 'last document generation');
  const generation = await db
    .from('document_generations')
    .insert({
      organization_id: actor.organizationId,
      client_id: document.client_id,
      issue_date: issueDate,
      first_decision_number: previous.data?.first_decision_number ?? 1,
      created_by: actor.createdBy,
    })
    .select('id')
    .single();
  if (generation.error) throw fromDatabaseError(generation.error, 'create document generation');

  const draft = document.document_revisions.find((revision) => revision.status === 'draft');
  if (draft) {
    await files.writeDocument(draft.docx_path, bytes, { replace: true });
    const updated = await db
      .from('document_revisions')
      .update({
        template_version_id: template.versionId,
        generation_id: generation.data.id,
        data_snapshot: snapshot as Json,
        // As generated again: nothing of the edit is left.
        edited_at: null,
        edited_by: null,
      })
      .eq('id', draft.id);
    if (updated.error) throw fromDatabaseError(updated.error, 'update document revision');
  } else {
    const revisionNumber = (latest?.revision ?? 0) + 1;
    const path = `${actor.organizationId}/${document.client_id}/${document.id}/${revisionNumber}.docx`;
    const revision = await db
      .from('document_revisions')
      .insert({
        organization_id: actor.organizationId,
        document_id: document.id,
        revision: revisionNumber,
        template_version_id: template.versionId,
        generation_id: generation.data.id,
        docx_path: path,
        data_snapshot: snapshot as Json,
        created_by: actor.createdBy,
      })
      .select('id')
      .single();
    if (revision.error) throw fromDatabaseError(revision.error, 'create document revision');
    try {
      await files.writeDocument(path, bytes, { replace: true });
    } catch (error) {
      await db.from('document_revisions').delete().eq('id', revision.data.id);
      throw error;
    }
  }
  return toDocument(await readDocument(db, documentId), facts);
}

// The PDF lives beside the Word file, under its name; the database holds them to that.
const pdfPathOf = (docxPath: string) => docxPath.replace(/\.docx$/, '.pdf');

async function sha256(bytes: Uint8Array) {
  // A copy with a plain ArrayBuffer behind it, which is what the digest is typed to take.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Whether the file still reads the mark a person was meant to replace. Asked of the file
 * itself, when it matters, because a draft changes by more roads than generation: the editor,
 * a file edited elsewhere. A file that cannot be read as a `.docx` has nothing to find.
 */
function hasUnfilledText(bytes: Uint8Array) {
  try {
    return documentText(bytes).includes(unfilledMark);
  } catch {
    return false;
  }
}

/**
 * Issues the draft: the database supersedes the issued revision, if any, and locks this one
 * with the hash of its file, which from then on no policy lets anyone write. A file that still
 * has text to fill in is issued only when the person says so: an issued document is final.
 */
export async function issueDocument(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  documentId: string,
  input: IssueDocumentRequest = {},
  pdf: PdfConverter | null = null
) {
  const document = await readDocument(db, documentId);
  const draft = document.document_revisions.find((revision) => revision.status === 'draft');
  if (!draft) throw new ApiError('conflict', 'This document has no draft to issue.');
  await requireActiveClient(db, document.client_id);
  const bytes = await files.readDocument(draft.docx_path);
  if (!input.acceptUnfilled && hasUnfilledText(bytes)) {
    throw new ApiError(
      'conflict',
      `The draft still reads "${unfilledMark}". Fill it in, or issue it as it is with acceptUnfilled.`,
      undefined,
      'unfilled_text'
    );
  }
  const hash = await sha256(bytes);
  // The PDF is made from these same bytes and stored while the revision is still a draft,
  // which is what lets the policies accept it; issuing then locks both files at once. When
  // it cannot be made, nothing is issued: a set with some PDFs missing is worse than a
  // second try.
  let pdfFile: { path: string; hash: string } | null = null;
  if (pdf) {
    const converted = await pdf.convertDocx(bytes);
    const path = pdfPathOf(draft.docx_path);
    await files.writeDocument(path, converted, { replace: true });
    pdfFile = { path, hash: await sha256(converted) };
  }
  const { error } = await db.rpc('issue_document_revision', {
    p_revision_id: draft.id,
    p_docx_sha256: hash,
    ...(pdfFile ? { p_pdf_path: pdfFile.path, p_pdf_sha256: pdfFile.hash } : {}),
  });
  // Someone else issued or deleted it in the meantime.
  if (error?.code === 'DOC01') throw new ApiError('not_found', 'This draft no longer exists.');
  if (error?.code === 'DOC02') throw new ApiError('conflict', 'This draft was already issued.');
  if (error) throw fromDatabaseError(error, 'issue document revision');
  const facts = await loadDocumentFacts(db, document.client_id, actor.userId);
  return toDocument(await readDocument(db, documentId), facts);
}

const maxDraftBytes = 15 * 1024 * 1024;
const bytesOf = (text: string) => new TextEncoder().encode(text);
const zipSignature = [0x50, 0x4b, 0x03, 0x04];
const documentPart = bytesOf('word/document.xml');

function includes(haystack: Uint8Array, needle: Uint8Array) {
  outer: for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

// A zip that names the main part of a Word document. File names are stored as they are, so
// this needs no unzipping; it keeps a PDF or a picture out, not a determined forger.
const looksLikeDocx = (bytes: Uint8Array) =>
  zipSignature.every((byte, index) => bytes[index] === byte) && includes(bytes, documentPart);

function requireDocx(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > maxDraftBytes) {
    throw new ApiError('validation_error', 'The file is empty or larger than 15 MB.');
  }
  if (!looksLikeDocx(bytes)) {
    throw new ApiError('validation_error', 'The file is not a Word document (.docx).');
  }
}

/**
 * Stores what the editor saved, or a file edited elsewhere, as the draft's file. From then on
 * the draft is "edited": generating it again would discard this.
 */
export async function saveDraftFile(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  documentId: string,
  bytes: Uint8Array
) {
  requireDocx(bytes);
  const document = await readDocument(db, documentId);
  const draft = document.document_revisions.find((revision) => revision.status === 'draft');
  if (!draft) throw new ApiError('conflict', 'This document has no draft to save to.');
  await requireActiveClient(db, document.client_id);
  await files.writeDocument(draft.docx_path, bytes, { replace: true });
  const updated = await db
    .from('document_revisions')
    .update({ edited_at: new Date().toISOString(), edited_by: actor.createdBy })
    .eq('id', draft.id);
  if (updated.error) throw fromDatabaseError(updated.error, 'mark document revision edited');
  const facts = await loadDocumentFacts(db, document.client_id, actor.userId);
  return toDocument(await readDocument(db, documentId), facts);
}

/**
 * Takes a file written elsewhere as a document's draft. For a type the app cannot generate
 * yet this is how the document comes to exist; for any document it is the way around the
 * editor. A draft's file is replaced; beside an issued revision a new draft starts, and the
 * issued one stays in force until that is issued.
 */
export async function uploadDocumentFile(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  clientId: string,
  typeKey: PackDocumentTypeKey,
  bytes: Uint8Array
) {
  requireDocx(bytes);
  const facts = await loadDocumentFacts(db, clientId, actor.userId);
  if (facts.clientArchived) {
    throw new ApiError('conflict', 'Documents are only uploaded for an active client.');
  }
  const existing = (await readDocuments(db, clientId)).find(
    (document) => document.type_key === typeKey
  );
  if (existing?.document_revisions.some((revision) => revision.status === 'draft')) {
    return saveDraftFile(db, files, actor, existing.id, bytes);
  }

  let documentId = existing?.id;
  if (!documentId) {
    if (!isUploadedDocumentType(typeKey)) {
      // A generated document is numbered and dated by its generation; uploading over nothing
      // would skip both.
      throw new ApiError(
        'conflict',
        'This document is generated first; a file can then replace its draft.',
        undefined,
        'not_generated_yet'
      );
    }
    const document = await db
      .from('client_documents')
      .insert({
        organization_id: actor.organizationId,
        client_id: clientId,
        type_key: typeKey,
        title: uploadedDocumentTypes[typeKey],
        created_by: actor.createdBy,
      })
      .select('id')
      .single();
    if (document.error) throw fromDatabaseError(document.error, 'create client document');
    documentId = document.data.id;
  }

  const last = existing ? newest(existing) : null;
  const number = (last?.revision ?? 0) + 1;
  // The row before the file: the storage policies only accept the file of a draft revision.
  const path = `${actor.organizationId}/${clientId}/${documentId}/${number}.docx`;
  const now = new Date().toISOString();
  const revision = await db
    .from('document_revisions')
    .insert({
      organization_id: actor.organizationId,
      document_id: documentId,
      revision: number,
      // No template and no snapshot: nothing was merged. The generation stays, for a document
      // that had one, because it holds the date the document carries.
      generation_id: last?.generation_id ?? null,
      docx_path: path,
      edited_at: now,
      edited_by: actor.createdBy,
      created_by: actor.createdBy,
    })
    .select('id')
    .single();
  if (revision.error) throw fromDatabaseError(revision.error, 'create document revision');
  try {
    await files.writeDocument(path, bytes, { replace: true });
  } catch (error) {
    await db.from('document_revisions').delete().eq('id', revision.data.id);
    throw error;
  }
  return toDocument(await readDocument(db, documentId), facts);
}

/**
 * A correction that keeps what was written by hand: the next draft starts as a copy of the
 * issued file. Regenerating is the other way to one, from the template and today's data.
 */
export async function startDraftFromIssued(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  documentId: string
) {
  const document = await readDocument(db, documentId);
  if (document.document_revisions.some((revision) => revision.status === 'draft')) {
    throw new ApiError('conflict', 'This document already has a draft.', undefined, 'draft_exists');
  }
  const issued = document.document_revisions.find((revision) => revision.status === 'issued');
  if (!issued)
    throw new ApiError('conflict', 'This document has no issued revision to start from.');
  await requireActiveClient(db, document.client_id);

  const source = await db
    .from('document_revisions')
    .select('template_version_id, edited_at, edited_by')
    .eq('id', issued.id)
    .single();
  if (source.error) throw fromDatabaseError(source.error, 'read issued document revision');
  const bytes = await files.readDocument(issued.docx_path);

  const number = (newest(document)?.revision ?? 0) + 1;
  const path = `${actor.organizationId}/${document.client_id}/${document.id}/${number}.docx`;
  const revision = await db
    .from('document_revisions')
    .insert({
      organization_id: actor.organizationId,
      document_id: document.id,
      revision: number,
      // The same file, so the same origin: the snapshot keeps saying what the file prints,
      // and data changed since then shows on the draft as it would have on the issued one.
      template_version_id: source.data.template_version_id,
      generation_id: issued.generation_id,
      data_snapshot: issued.data_snapshot,
      edited_at: source.data.edited_at,
      edited_by: source.data.edited_by,
      docx_path: path,
      created_by: actor.createdBy,
    })
    .select('id')
    .single();
  if (revision.error) throw fromDatabaseError(revision.error, 'create document revision');
  try {
    await files.writeDocument(path, bytes, { replace: true });
  } catch (error) {
    await db.from('document_revisions').delete().eq('id', revision.data.id);
    throw error;
  }
  const facts = await loadDocumentFacts(db, document.client_id, actor.userId);
  return toDocument(await readDocument(db, documentId), facts);
}

/** What was issued before stays as it is. */
export async function deleteDraft(db: DataClient, files: FileStore, documentId: string) {
  const document = await readDocument(db, documentId);
  const draft = document.document_revisions.find((revision) => revision.status === 'draft');
  if (!draft) throw new ApiError('conflict', 'This document has no draft to delete.');
  await requireActiveClient(db, document.client_id);
  // The file while the policies still allow it: they follow the draft row.
  await files.removeDocument(draft.docx_path);
  // Left behind by an issuing that made the PDF and then failed. Removing nothing is fine.
  await files.removeDocument(pdfPathOf(draft.docx_path));
  const { error } = await db.from('document_revisions').delete().eq('id', draft.id);
  if (error) throw fromDatabaseError(error, 'delete document revision');
}

export async function documentDownloadLink(
  db: DataClient,
  files: FileStore,
  documentId: string,
  revisionId: string,
  format: DocumentFileFormat = 'docx'
) {
  const { data, error } = await db
    .from('document_revisions')
    .select('docx_path, pdf_path, revision, client_documents(title)')
    .eq('id', revisionId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find document revision');
  if (!data) throw new ApiError('not_found', 'This document revision does not exist.');
  const path = format === 'pdf' ? data.pdf_path : data.docx_path;
  if (!path) throw new ApiError('not_found', 'This revision has no PDF.');
  const expiresInSeconds = 60;
  // No parentheses: Storage percent-encodes them and browsers save the name as it comes.
  const fileName = `${fileNameOf(data.client_documents.title)} - rev. ${data.revision}.${format}`;
  return {
    url: await files.documentLink(path, fileName, expiresInSeconds),
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
