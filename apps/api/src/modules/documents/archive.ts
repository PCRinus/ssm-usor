import type { DocumentArchiveFormat, DocumentSet } from '@ssm-usor/contracts';
import { type Zippable, zipSync } from 'fflate';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import type { FileStore } from '../../lib/files';
import { withAnnexes } from './annexes';
import {
  documentFileName,
  type DocumentRow,
  fileNameOf,
  inSetOrder,
  readDocuments,
} from './documents';

const setNames: Record<DocumentSet, string> = { occupational_safety: 'SSM', fire_safety: 'SU' };

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

/**
 * One file per document of the set, numbered in the binder's order. A Word file holds its
 * annexes, as the PDF made at issuing does.
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

  const order = inSetOrder(set);
  const entries = (await readDocuments(db, clientId, set))
    .sort((a, b) => order(binderPlace(a), binderPlace(b)))
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

  const digits = Math.max(2, String(entries.length).length);
  const archived = entries.flatMap(({ document, revision }, index): ArchivedFile[] => {
    const name = `${String(index + 1).padStart(digits, '0')} ${documentFileName(document)} - rev. ${revision.revision}`;
    if (format === 'pdf') {
      return [{ name: `${name}.pdf`, read: () => files.readDocument(revision.pdf_path!) }];
    }
    const draft = revision.status === 'draft' ? ' - ciornă' : '';
    return [
      {
        name: `${name}${draft}.docx`,
        read: async () =>
          withAnnexes(
            db,
            document.type_key,
            revision.data_snapshot,
            await files.readDocument(revision.docx_path)
          ),
      },
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

const binderPlace = (document: DocumentRow) => ({
  typeKey: document.type_key,
  title: document.title,
  period: document.period,
});

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
