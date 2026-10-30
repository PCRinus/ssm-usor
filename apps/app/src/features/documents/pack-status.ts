import type { DocumentSet } from '@ssm-usor/contracts';

import type { ClientDocument } from './document-labels';

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
