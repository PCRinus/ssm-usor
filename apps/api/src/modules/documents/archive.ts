import type { DocumentArchiveFormat, DocumentSet, InstructionDomain } from '@ssm-usor/contracts';
import { type Zippable, zipSync } from 'fflate';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import {
  documentFileName,
  type DocumentRow,
  fileNameOf,
  readDocuments,
  type RevisionRow,
  typeOrders,
} from './documents';
import { annexDomainOf, snapshotAnnexes } from './snapshot';

const setNames: Record<DocumentSet, string> = { occupational_safety: 'SSM', fire_safety: 'PSI' };
const annexCodes: Record<InstructionDomain, string> = { ssm: 'I.P.S.S.M.', psi: 'I.P.S.U.' };

// A Worker opens at most six connections at once and queues the rest, while each read's timeout
// already runs: a whole set read at once could time out reads that never started.
const parallelReads = 6;

type ArchivedFile = { name: string; read: () => Promise<Uint8Array> };

/**
 * The issued revision is the one in force; a document with nothing issued yet comes as its
 * draft. A PDF is only ever the one made at issuing, so a document without one is left out.
 */
function archivedRevision(document: DocumentRow, format: DocumentArchiveFormat) {
  const issued = document.document_revisions.find((revision) => revision.status === 'issued');
  if (format === 'pdf') return issued?.pdf_path ? issued : null;
  return issued ?? document.document_revisions.find((revision) => revision.status === 'draft');
}

const inSetOrder = (set: DocumentSet) => (a: DocumentRow, b: DocumentRow) =>
  (typeOrders[set].get(a.type_key) ?? Infinity) - (typeOrders[set].get(b.type_key) ?? Infinity) ||
  a.title.localeCompare(b.title, 'ro') ||
  (b.period ?? 0) - (a.period ?? 0);

/**
 * One file per document of the set, numbered in the binder's order. A Word file's annexes
 * follow it as files of their own: the PDF made at issuing already holds them.
 */
export async function documentArchive(
  db: DataClient,
  files: FileStore,
  clientId: string,
  set: DocumentSet,
  format: DocumentArchiveFormat
) {
  const { data: client, error } = await db
    .from('clients')
    .select('legal_name')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client of document archive');
  if (!client) throw new ApiError('not_found', 'This client does not exist.');

  const entries = (await readDocuments(db, clientId, set))
    .sort(inSetOrder(set))
    .flatMap((document) => {
      const revision = archivedRevision(document, format);
      return revision ? [{ document, revision }] : [];
    });
  if (entries.length === 0) {
    throw new ApiError(
      'conflict',
      format === 'pdf'
        ? 'No document of this set has been issued with a PDF yet.'
        : 'No document of this set has been generated yet.',
      undefined,
      'nothing_to_archive'
    );
  }

  const modulePaths = format === 'docx' ? await annexModulePaths(db, entries) : new Map();
  const digits = Math.max(2, String(entries.length).length);
  const archived = entries.flatMap(({ document, revision }, index): ArchivedFile[] => {
    const name = `${String(index + 1).padStart(digits, '0')} ${documentFileName(document)} - rev. ${revision.revision}`;
    if (format === 'pdf') {
      return [{ name: `${name}.pdf`, read: () => files.readDocument(revision.pdf_path!) }];
    }
    const draft = revision.status === 'draft' ? ' - ciornă' : '';
    return [
      { name: `${name}${draft}.docx`, read: () => files.readDocument(revision.docx_path) },
      ...annexesOf(document, revision).map((annex) => {
        const path = modulePaths.get(annex.versionId);
        // A version row is never deleted, so a missing one is a snapshot from another
        // organization's module, which the policies keep out of reach.
        if (!path) throw new ApiError('conflict', 'An annexed instruction is not in the library.');
        return {
          name: `${name}${draft} - Anexa ${annex.number} - ${annexCodes[annexDomainOf(document.type_key)!]} ${fileNameOf(annex.title)}.docx`,
          read: () => files.readModule(path),
        };
      }),
    ];
  });

  const contents = await readAll(archived.map((file) => file.read));
  // Stored, not deflated: Word files and PDFs are compressed already.
  const zippable: Zippable = Object.fromEntries(
    archived.map((file, index) => [file.name, [contents[index]!, { level: 0 }]])
  );
  return {
    fileName: `${fileNameOf(client.legal_name)} - documentația ${setNames[set]} - ${format === 'pdf' ? 'PDF' : 'Word'}.zip`,
    bytes: zipSync(zippable),
  };
}

const annexesOf = (document: DocumentRow, revision: RevisionRow) =>
  annexDomainOf(document.type_key) ? (snapshotAnnexes(revision.data_snapshot) ?? []) : [];

async function annexModulePaths(
  db: DataClient,
  entries: { document: DocumentRow; revision: RevisionRow }[]
) {
  const versionIds = entries.flatMap(({ document, revision }) =>
    annexesOf(document, revision).map((annex) => annex.versionId)
  );
  if (versionIds.length === 0) return new Map<string, string>();
  const { data, error } = await db
    .from('instruction_module_versions')
    .select('id, docx_path')
    .in('id', versionIds);
  if (error) throw fromDatabaseError(error, 'read annexed module versions');
  return new Map(data.map((row) => [row.id, row.docx_path]));
}

async function readAll(reads: (() => Promise<Uint8Array>)[]) {
  const contents: Uint8Array[] = [];
  let next = 0;
  async function worker() {
    while (next < reads.length) {
      const index = next++;
      contents[index] = await reads[index]!();
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallelReads, reads.length) }, worker));
  return contents;
}
