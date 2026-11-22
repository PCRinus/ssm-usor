import { type DocumentFileFormat, numberedTitle } from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { requireDocx } from '../../lib/docx';
import { ApiError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import type { PdfConverter } from '../../lib/pdf';
import { fileNameOf } from '../../lib/text';
import { renderSnapshotAnnexes, withAnnexes } from './annexes';
import { newest, readDocument } from './rows';
import { annexDomainOf, snapshotAnnexes } from './snapshot';

/**
 * A PDF of a Word file of the document, made to be printed and not kept. The file is sent
 * rather than read from Storage because the editor prints what it shows, unsaved edits included.
 */
export async function printDocument(
  db: DataClient,
  pdf: PdfConverter,
  documentId: string,
  bytes: Uint8Array
) {
  requireDocx(bytes);
  const document = await readDocument(db, documentId);
  // The draft's annexes, or the issued revision's when there is no draft: what the binder
  // holds, printed with the file as shown.
  const revision = newest(document);
  const annexes = await renderSnapshotAnnexes(
    db,
    document.type_key,
    revision?.data_snapshot ?? null
  );
  return pdf.convertDocuments([bytes, ...annexes]);
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
    .select(
      'docx_path, pdf_path, revision, client_documents(title, period, type_key), document_signed_copies(storage_path)'
    )
    .eq('id', revisionId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find document revision');
  if (!data) throw new ApiError('not_found', 'This document revision does not exist.');
  const path =
    format === 'signed'
      ? data.document_signed_copies?.storage_path
      : format === 'pdf'
        ? data.pdf_path
        : data.docx_path;
  if (!path) {
    throw new ApiError(
      'not_found',
      format === 'signed' ? 'This revision has no signed copy.' : 'This revision has no PDF.'
    );
  }
  const expiresInSeconds = 60;
  const name = documentFileName(data.client_documents);
  // No parentheses: Storage percent-encodes them and browsers save the name as it comes.
  const fileName =
    format === 'signed'
      ? `${name} - rev. ${data.revision} - semnat.pdf`
      : `${name} - rev. ${data.revision}.${format}`;
  return {
    url: await files.documentLink(path, expiresInSeconds),
    fileName,
    expiresInSeconds,
  };
}

async function readRevision(db: DataClient, documentId: string, revisionId: string) {
  const { data, error } = await db
    .from('document_revisions')
    .select('docx_path, data_snapshot, revision, client_documents(title, period, type_key)')
    .eq('id', revisionId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find document revision');
  if (!data?.client_documents) {
    throw new ApiError('not_found', 'This document revision does not exist.');
  }
  return { ...data, document: data.client_documents };
}

export async function documentWordFile(
  db: DataClient,
  files: FileStore,
  documentId: string,
  revisionId: string
) {
  const revision = await readRevision(db, documentId, revisionId);
  const common = await files.readDocument(revision.docx_path);
  return {
    fileName: `${documentFileName(revision.document)} - rev. ${revision.revision}.docx`,
    bytes: await withAnnexes(db, revision.document.type_key, revision.data_snapshot, common),
  };
}

export async function documentAnnexFile(
  db: DataClient,
  documentId: string,
  revisionId: string,
  number: number
) {
  const revision = await readRevision(db, documentId, revisionId);
  const domain = annexDomainOf(revision.document.type_key);
  const annex = (snapshotAnnexes(revision.data_snapshot) ?? []).find(
    (each) => each.number === number
  );
  const [bytes] = domain
    ? await renderSnapshotAnnexes(db, revision.document.type_key, revision.data_snapshot, {
        number,
      })
    : [];
  if (!domain || !annex || !bytes) {
    throw new ApiError('not_found', 'This revision has no such annex.');
  }
  return {
    fileName: `${documentFileName(revision.document)} - rev. ${revision.revision} - Anexa ${number} - ${annexCodes[domain]} ${fileNameOf(annex.title)}.docx`,
    bytes,
  };
}

const annexCodes = { ssm: 'I.P.S.S.M.', su: 'I.P.S.U.' } as const;

// A dated document's year tells its files apart from the other years'.
export const documentFileName = (document: {
  type_key: string;
  title: string;
  period: number | null;
}) =>
  fileNameOf(
    numberedTitle(document.type_key, [document.title, document.period].filter(Boolean).join(' '))
  );
