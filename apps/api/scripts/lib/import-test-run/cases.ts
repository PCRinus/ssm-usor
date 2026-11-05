import type { ImportKind, ImportLibraryPart } from '@ssm-usor/contracts';

import type { importCopyRecord, partCopyRecord } from '../../../src/modules/imports/copies';

export type ImportCopyRecord = ReturnType<typeof importCopyRecord>;
export type PartCopyRecord = ReturnType<typeof partCopyRecord>;

export interface KeptCopy {
  organizationId: string;
  importId: string;
  // Null for the import's own copy.
  part: ImportLibraryPart | null;
}

/** The `import-copies` bucket, read with the secret key; nothing of it is written to disk. */
export interface CopySource {
  // Newest first, the copies the 12-month clean-up has not removed.
  list(filter: { imports: string[]; organization: string | null }): Promise<KeptCopy[]>;
  read(path: string): Promise<Uint8Array>;
}

export type TestCase =
  | { type: 'import'; folder: string; record: ImportCopyRecord }
  | {
      type: 'part';
      folder: string;
      part: ImportLibraryPart;
      record: PartCopyRecord;
      // Its files and the client proposal whose posts it cites are in its import's copy.
      importRecord: ImportCopyRecord;
    };

export interface Selection {
  imports: string[];
  organization: string | null;
  kind: ImportKind | null;
  parts: ImportLibraryPart[];
  confirmedOnly: boolean;
  limit: number | null;
}

export class MissingObjectError extends Error {
  constructor(path: string) {
    super(`Object not found: ${path}`);
    this.name = 'MissingObjectError';
  }
}

const decoder = new TextDecoder();

export async function readJson<T>(source: CopySource, path: string): Promise<T> {
  return JSON.parse(decoder.decode(await source.read(path))) as T;
}

export const caseLabel = (testCase: TestCase) =>
  testCase.type === 'import'
    ? `${testCase.record.kind} import ${testCase.record.import}`
    : `${testCase.part} of import ${testCase.record.import}`;

export const readerOf = (testCase: TestCase) =>
  testCase.type === 'import' ? testCase.record.kind : testCase.part;

/**
 * `kind` alone picks imports, `parts` alone picks parts, and neither picks both. A part needs its
 * import's copy, which holds the files it read.
 */
export async function selectCases(
  source: CopySource,
  selection: Selection,
  warn: (line: string) => void
): Promise<TestCase[]> {
  const wantsImports = selection.kind !== null || selection.parts.length === 0;
  const wantsParts = selection.parts.length > 0 || selection.kind === null;
  // A record the clean-up removed leaves its copy out; one Storage could not give is said, so
  // an outage does not pass for an empty selection.
  const recordOf = <T>(path: string, label: string) =>
    readJson<T>(source, path).catch((error: unknown) => {
      if (!(error instanceof MissingObjectError)) {
        warn(`${label}: its record could not be read, so it is left out.`);
      }
      return null;
    });
  const importRecords = new Map<string, Promise<ImportCopyRecord | null>>();
  const importRecordOf = (copy: KeptCopy) => {
    const folder = `${copy.organizationId}/${copy.importId}`;
    let record = importRecords.get(folder);
    if (!record) {
      record = recordOf<ImportCopyRecord>(`${folder}/record.json`, `import ${copy.importId}`);
      importRecords.set(folder, record);
    }
    return record;
  };

  const cases: TestCase[] = [];
  for (const copy of await source.list(selection)) {
    if (selection.limit !== null && cases.length >= selection.limit) break;
    const folder = `${copy.organizationId}/${copy.importId}`;
    const importRecord = await importRecordOf(copy);
    if (copy.part === null) {
      if (!wantsImports || !importRecord) continue;
      if (selection.kind !== null && importRecord.kind !== selection.kind) continue;
      if (selection.confirmedOnly && importRecord.status !== 'confirmed') continue;
      cases.push({ type: 'import', folder, record: importRecord });
      continue;
    }
    if (!wantsParts) continue;
    if (selection.parts.length > 0 && !selection.parts.includes(copy.part)) continue;
    if (selection.kind === 'employees') continue;
    const record = await recordOf<PartCopyRecord>(
      `${folder}/parts/${copy.part}/record.json`,
      `${copy.part} of import ${copy.importId}`
    );
    if (!record) continue;
    if (selection.confirmedOnly && record.status !== 'confirmed') continue;
    if (!importRecord) {
      warn(
        `${copy.part} of import ${copy.importId}: its import's copy is gone, so it is left out.`
      );
      continue;
    }
    cases.push({ type: 'part', folder, part: copy.part, record, importRecord });
  }
  return cases;
}
