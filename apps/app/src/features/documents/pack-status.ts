import {
  type BuiltInDocumentTypeKey,
  type DocumentSet,
  isDatedDocumentType,
} from '@ssm-usor/contracts';

import { type ClientDocument, datedTitle, notGeneratedTitles } from './document-labels';
import { setSections } from './document-sections';

/**
 * A document counts once, under its most pressing state: to update (its draft's data changed, or
 * a newer template or newer instructions wait for it), then draft (also a newer draft over an
 * issued revision), then issued. A document of the pack that does not exist yet is missing.
 */
export type DocumentStatus = 'update' | 'draft' | 'issued' | 'missing';

export type StatusCounts = Record<DocumentStatus, number>;

export type PackRow =
  | {
      kind: 'document';
      key: string;
      title: string;
      document: ClientDocument;
      status: Exclude<DocumentStatus, 'missing'>;
      // A dated type's earlier years, newest first (ADR 020); only the newest counts.
      earlier?: ClientDocument[];
    }
  | { kind: 'missing'; key: string; title: string; document: null; status: 'missing' };

export type PackSection = {
  id: string;
  // Null for the section holding document types this build of the app does not know yet.
  number: string | null;
  title: string;
  rows: PackRow[];
  counts: StatusCounts;
};

export type Pack = {
  sections: PackSection[];
  counts: StatusCounts;
};

export type BuildPackInput = {
  set: DocumentSet;
  items: readonly ClientDocument[];
  notApplicable: readonly string[];
  isBehind: (document: ClientDocument) => boolean;
};

export function documentStatus(
  document: ClientDocument,
  behind: boolean
): Exclude<DocumentStatus, 'missing'> {
  if (document.draft?.dataChanged || behind) return 'update';
  return document.draft ? 'draft' : 'issued';
}

function countRows(rows: readonly PackRow[]) {
  const counts: StatusCounts = { update: 0, draft: 0, issued: 0, missing: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export function buildPack({ set, items, notApplicable, isBehind }: BuildPackInput): Pack {
  const { sections, other } = setSections[set];
  const documentRow = (
    document: ClientDocument,
    title: string,
    earlier?: ClientDocument[]
  ): PackRow => ({
    kind: 'document',
    key: document.typeKey,
    title,
    document,
    status: documentStatus(document, isBehind(document)),
    ...(earlier && { earlier }),
  });

  const rowsOf = (typeKey: string): PackRow[] => {
    // The API lists a dated type's newest year first.
    const [document, ...earlier] = items.filter((item) => item.typeKey === typeKey);
    if (document) {
      return [
        isDatedDocumentType(typeKey)
          ? documentRow(document, datedTitle(document), earlier)
          : documentRow(document, document.title),
      ];
    }
    if (notApplicable.includes(typeKey)) return [];
    return [
      {
        kind: 'missing',
        key: typeKey,
        // The section lists hold only built-in types.
        title: notGeneratedTitles[typeKey as BuiltInDocumentTypeKey],
        document: null,
        status: 'missing',
      },
    ];
  };

  const known = new Set(sections.flatMap((section) => section.typeKeys));
  const otherRows = items
    .filter((item) => !known.has(item.typeKey))
    .map((document) => documentRow(document, document.title));
  const packSection = (
    id: string,
    number: string | null,
    title: string,
    rows: PackRow[]
  ): PackSection => ({ id, number, title, rows, counts: countRows(rows) });
  const packSections = [
    ...sections.map((section) =>
      packSection(section.id, section.number, section.title, section.typeKeys.flatMap(rowsOf))
    ),
    packSection(other.id, null, other.title, otherRows),
  ].filter((section) => section.rows.length > 0);

  return {
    sections: packSections,
    counts: countRows(packSections.flatMap((section) => section.rows)),
  };
}
