import {
  type BuiltInDocumentTypeKey,
  confirmSignedCopyConflictReason,
  documentSetOf,
  dutiesAcknowledgementErrorReasons,
  isDocumentEditable,
  type IssueDocumentRequest,
  unfilledMark,
} from '@ssm-usor/contracts';
import { documentText } from '@ssm-usor/document-engine';

import { archivedClientError, type DataClient, fromDatabaseError } from '../../lib/db';
import { maxDocxBytes, requireDocx } from '../../lib/docx';
import { ApiError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import { sha256 } from '../../lib/hash';
import { requireOffersFor } from '../../lib/offers';
import { isPdf, type PdfConverter } from '../../lib/pdf';
import { clientNotFound, requireWritableClient } from '../clients/lookup';
import { renderSnapshotAnnexes } from './annexes';
import { presentChanged } from './present';
import {
  type Actor,
  draftOf,
  issuedOf,
  newest,
  nextRevision,
  readDocument,
  readDocuments,
  type Tables,
} from './rows';

// Asked before any file is touched: the database refuses the row too, but only after the
// file has been written or the PDF made.
async function requireActiveClient(db: DataClient, clientId: string) {
  await requireOffersFor(db, await requireWritableClient(db, clientId));
}

type RevisionFields = Omit<
  Tables['document_revisions']['Insert'],
  'organization_id' | 'document_id' | 'revision' | 'docx_path' | 'created_by'
>;

/**
 * The row before the file: the storage policies only accept the file of a draft revision. A
 * revision without a file is worse than no revision, so the row goes when the file cannot be
 * written.
 */
export async function addRevision(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  target: { documentId: string; clientId: string; revision: number },
  fields: RevisionFields,
  bytes: Uint8Array
) {
  const path = `${actor.organizationId}/${target.clientId}/${target.documentId}/${target.revision}.docx`;
  const revision = await db
    .from('document_revisions')
    .insert({
      organization_id: actor.organizationId,
      document_id: target.documentId,
      revision: target.revision,
      ...fields,
      docx_path: path,
      created_by: actor.createdBy,
    })
    .select('id')
    .single();
  if (revision.error) throw fromDatabaseError(revision.error, 'create document revision');
  try {
    // Replacing covers a file left behind by a revision that was deleted without it.
    await files.writeDocument(path, bytes, { replace: true });
  } catch (error) {
    await db.from('document_revisions').delete().eq('id', revision.data.id);
    throw error;
  }
}

// The PDF lives beside the Word file, under its name; the database holds them to that.
const pdfPathOf = (docxPath: string) => docxPath.replace(/\.docx$/, '.pdf');

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
  const draft = draftOf(document);
  if (!draft) throw new ApiError('conflict', 'This document has no draft to issue.');
  await requireActiveClient(db, document.client_id);
  const bytes = await files.readDocument(draft.docx_path);
  if (!input.acceptUnfilled && hasUnfilledText(bytes)) {
    throw ApiError.conflict(
      'unfilled_text',
      `The draft still reads "${unfilledMark}". Fill it in, or issue it as it is with acceptUnfilled.`
    );
  }
  const hash = await sha256(bytes);
  // The PDF is made from these same bytes and stored while the revision is still a draft,
  // which is what lets the policies accept it; issuing then locks both files at once. When
  // it cannot be made, nothing is issued: a set with some PDFs missing is worse than a
  // second try.
  let pdfFile: { path: string; hash: string } | null = null;
  if (pdf) {
    const annexes = await renderSnapshotAnnexes(db, document.type_key, draft.data_snapshot);
    const converted = await pdf.convertDocuments([bytes, ...annexes]);
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
  return presentChanged(db, actor, documentId);
}

/**
 * Stores what the editor saved, or a file edited elsewhere, as the draft's file. From then on
 * the draft is "edited": generating it again would discard this.
 */
// Document 13 is read back by the acknowledgement sheets from what its data built (ADR 046): a
// hand edit would reach neither them nor a regeneration.
function requireEditable(typeKey: string) {
  if (!isDocumentEditable(typeKey)) {
    throw ApiError.conflict(
      dutiesAcknowledgementErrorReasons.documentNotEditable,
      'This document is built from the data alone: regenerate it instead.'
    );
  }
}

export async function saveDraftFile(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  documentId: string,
  bytes: Uint8Array
) {
  requireDocx(bytes);
  const document = await readDocument(db, documentId);
  requireEditable(document.type_key);
  const draft = draftOf(document);
  if (!draft) throw new ApiError('conflict', 'This document has no draft to save to.');
  await requireActiveClient(db, document.client_id);
  await files.writeDocument(draft.docx_path, bytes, { replace: true });
  const updated = await db
    .from('document_revisions')
    .update({ edited_at: new Date().toISOString(), edited_by: actor.createdBy })
    .eq('id', draft.id);
  if (updated.error) throw fromDatabaseError(updated.error, 'mark document revision edited');
  return presentChanged(db, actor, documentId);
}

/**
 * Takes a file written elsewhere as a document's draft, the way around the editor. A draft's
 * file is replaced; beside an issued revision a new draft starts, and the issued one stays in
 * force until that is issued.
 */
export async function uploadDocumentFile(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  clientId: string,
  typeKey: BuiltInDocumentTypeKey,
  bytes: Uint8Array,
  period?: number
) {
  requireEditable(typeKey);
  requireDocx(bytes);
  const [client, documents] = await Promise.all([
    db.from('clients').select('archived_at').eq('id', clientId).maybeSingle(),
    readDocuments(db, clientId, documentSetOf(typeKey)),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'find client of upload');
  if (!client.data) throw clientNotFound();
  if (client.data.archived_at) throw archivedClientError();
  // Without a period, a dated type's newest one.
  const existing = documents
    .filter(
      (document) =>
        document.type_key === typeKey && (period === undefined || document.period === period)
    )
    .sort((a, b) => (b.period ?? 0) - (a.period ?? 0))[0];
  if (existing && draftOf(existing)) {
    return saveDraftFile(db, files, actor, existing.id, bytes);
  }

  if (!existing) {
    // A document is numbered and dated by its generation; uploading over nothing would skip both.
    throw ApiError.conflict(
      'not_generated_yet',
      'This document is generated first; a file can then replace its draft.'
    );
  }

  const now = new Date().toISOString();
  await addRevision(
    db,
    files,
    actor,
    { documentId: existing.id, clientId, revision: nextRevision(existing) },
    {
      // No template and no snapshot: nothing was merged. The generation stays, for a document
      // that had one, because it holds the date the document carries.
      generation_id: newest(existing)?.generation_id ?? null,
      edited_at: now,
      edited_by: actor.createdBy,
    },
    bytes
  );
  return presentChanged(db, actor, existing.id);
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
  requireEditable(document.type_key);
  if (draftOf(document)) {
    throw ApiError.conflict('draft_exists', 'This document already has a draft.');
  }
  const issued = issuedOf(document);
  if (!issued)
    throw new ApiError('conflict', 'This document has no issued revision to start from.');
  await requireActiveClient(db, document.client_id);

  const source = await db
    .from('document_revisions')
    .select('template_version_id, edited_at, edited_by, duty_fingerprints')
    .eq('id', issued.id)
    .single();
  if (source.error) throw fromDatabaseError(source.error, 'read issued document revision');
  const bytes = await files.readDocument(issued.docx_path);

  await addRevision(
    db,
    files,
    actor,
    { documentId: document.id, clientId: document.client_id, revision: nextRevision(document) },
    {
      // The same file, so the same origin: the snapshot keeps saying what the file prints,
      // and data changed since then shows on the draft as it would have on the issued one.
      template_version_id: source.data.template_version_id,
      generation_id: issued.generation_id,
      data_snapshot: issued.data_snapshot,
      duty_fingerprints: source.data.duty_fingerprints,
      edited_at: source.data.edited_at,
      edited_by: source.data.edited_by,
    },
    bytes
  );
  return presentChanged(db, actor, documentId);
}

/** What was issued before stays as it is. */
export async function deleteDraft(db: DataClient, files: FileStore, documentId: string) {
  const document = await readDocument(db, documentId);
  const draft = draftOf(document);
  if (!draft) throw new ApiError('conflict', 'This document has no draft to delete.');
  await requireActiveClient(db, document.client_id);
  // The file while the policies still allow it: they follow the draft row.
  await files.removeDocument(draft.docx_path);
  // Left behind by an issuing that made the PDF and then failed. Removing nothing is fine.
  await files.removeDocument(pdfPathOf(draft.docx_path));
  const { error } = await db.from('document_revisions').delete().eq('id', draft.id);
  if (error) throw fromDatabaseError(error, 'delete document revision');
}

export function requireSignedCopy(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > maxDocxBytes) {
    throw new ApiError('validation_error', 'The file is empty or larger than 15 MB.');
  }
  if (!isPdf(bytes)) throw new ApiError('validation_error', 'The signed copy is a PDF.');
}

const signedCopyPathOf = (docxPath: string) => docxPath.replace(/\.docx$/, '.signed.pdf');

/**
 * The row first, with the hash of the file, because the policies let a file be written only
 * where a row says it lives.
 */
export async function recordSignedCopy(
  db: DataClient,
  files: FileStore,
  copy: {
    revision: { id: string; docxPath: string; hasCopy: boolean };
    documentId: string;
    organizationId: string;
    bytes: Uint8Array;
    uploadedBy: string | null;
    source: 'owner' | 'client';
    context: string;
  }
) {
  const { revision, bytes } = copy;
  const path = signedCopyPathOf(revision.docxPath);
  const uploadedAt = new Date().toISOString();
  // An owner looked at what they attach; a copy from the return link waits for one.
  const confirmed = copy.source === 'owner';
  const recorded = await db.from('document_signed_copies').upsert(
    {
      revision_id: revision.id,
      organization_id: copy.organizationId,
      document_id: copy.documentId,
      storage_path: path,
      sha256: await sha256(bytes),
      uploaded_by: copy.uploadedBy,
      uploaded_at: uploadedAt,
      source: copy.source,
      confirmed_at: confirmed ? uploadedAt : null,
      confirmed_by: confirmed ? copy.uploadedBy : null,
    },
    { onConflict: 'revision_id' }
  );
  if (recorded.error) throw fromDatabaseError(recorded.error, copy.context);
  try {
    await files.writeDocument(path, bytes, { replace: true });
  } catch (error) {
    // Only a first copy: after a failed replacement the row still describes the earlier file,
    // under a hash the next attempt corrects. Only this attempt's row: an owner and the return
    // link write the same row, and the other may have replaced it and stored its file meanwhile.
    if (!revision.hasCopy) {
      await db
        .from('document_signed_copies')
        .delete()
        .eq('revision_id', revision.id)
        .eq('uploaded_at', uploadedAt);
    }
    throw error;
  }
  return uploadedAt;
}

/** Attaches what came back signed to the issued revision, or replaces what was attached. */
export async function attachSignedCopy(
  db: DataClient,
  files: FileStore,
  actor: Actor,
  documentId: string,
  bytes: Uint8Array
) {
  requireSignedCopy(bytes);
  const document = await readDocument(db, documentId);
  const issued = issuedOf(document);
  if (!issued) {
    throw ApiError.conflict('not_issued', 'Only an issued document has a signed copy.');
  }
  await requireActiveClient(db, document.client_id);
  await recordSignedCopy(db, files, {
    revision: {
      id: issued.id,
      docxPath: issued.docx_path,
      hasCopy: Boolean(issued.document_signed_copies),
    },
    documentId: document.id,
    organizationId: actor.organizationId,
    bytes,
    uploadedBy: actor.createdBy,
    source: 'owner',
    context: 'record signed copy',
  });
  return presentChanged(db, actor, documentId);
}

/** The owner accepts what came through the return link as the signed copy. */
export async function confirmSignedCopy(db: DataClient, actor: Actor, documentId: string) {
  const document = await readDocument(db, documentId);
  const issued = issuedOf(document);
  if (!issued?.document_signed_copies || issued.document_signed_copies.confirmed_at) {
    throw ApiError.conflict(
      confirmSignedCopyConflictReason,
      'This document has no received copy to confirm.'
    );
  }
  await requireActiveClient(db, document.client_id);
  const { error } = await db
    .from('document_signed_copies')
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: actor.createdBy })
    .eq('revision_id', issued.id);
  if (error) throw fromDatabaseError(error, 'confirm signed copy');
  return presentChanged(db, actor, documentId);
}

export async function removeSignedCopy(db: DataClient, files: FileStore, documentId: string) {
  const document = await readDocument(db, documentId);
  const issued = issuedOf(document);
  if (!issued?.document_signed_copies) {
    throw new ApiError('conflict', 'This document has no signed copy to remove.');
  }
  await requireActiveClient(db, document.client_id);
  // The file while the policies still allow it: they follow the row.
  await files.removeDocument(signedCopyPathOf(issued.docx_path));
  const { error } = await db.from('document_signed_copies').delete().eq('revision_id', issued.id);
  if (error) throw fromDatabaseError(error, 'remove signed copy');
}
