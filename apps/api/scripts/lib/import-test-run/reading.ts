import type { ExtractorService, ImportLibraryPart } from '@ssm-usor/contracts';
import {
  type EmployeeImportClient,
  type ExistingClient,
  GatewayError,
  ModelAnswerError,
  type ModelClient,
  type ModelId,
  noUsage,
  type ProviderIdentity,
  readingAnswer,
  sheetPageAnswer,
  sortingAnswer,
  type TrainingThemes,
  type Usage,
} from '@ssm-usor/import';

import { sha256 } from '../../../src/lib/docx';
import type { ImportMessage } from '../../../src/lib/env';
import {
  ImportFailure,
  type ImportObjects,
  type PipelineDeps,
  textPathOf,
} from '../../../src/modules/imports/pipeline';
import { recordFailure, runStep } from '../../../src/modules/imports/queue';
import type {
  ImportFileRow,
  ImportRow,
  ImportStore,
  LibraryPartRow,
} from '../../../src/modules/imports/store';
import type { CopySource, ImportCopyRecord, TestCase } from './cases';

// Read from the database, never written.
export interface CaseContext {
  provider(organizationId: string): Promise<ProviderIdentity>;
  client(clientId: string): Promise<ExistingClient | null>;
  trainingThemes(row: ImportRow, today: string): Promise<TrainingThemes>;
}

export interface Spent {
  usage: Usage;
  cost: number;
  requests: number;
}

export function testRunModel(model: ModelClient, rescan: boolean) {
  const byModel = new Map<ModelId, Spent>();
  const refused = { images: 0 };
  const count = (id: ModelId, usage: Usage, cost: number) => {
    const spent = byModel.get(id) ?? { usage: noUsage, cost: 0, requests: 0 };
    byModel.set(id, {
      usage: {
        input: spent.usage.input + usage.input,
        cachedInput: spent.usage.cachedInput + usage.cachedInput,
        output: spent.usage.output + usage.output,
      },
      cost: spent.cost + cost,
      requests: spent.requests + 1,
    });
  };
  // The steps that read a picture of a page; a risk reading sends its scanned pages too, but
  // that is the reading itself, whose stored answer a test run does not reuse.
  const scanAnswers = new Set([readingAnswer.name, sheetPageAnswer.name, sortingAnswer.name]);
  const client: ModelClient = {
    async complete(request) {
      const withImage = request.messages.some(
        (message) =>
          Array.isArray(message.content) &&
          message.content.some((part) => part.type === 'image_url')
      );
      if (!rescan && withImage && scanAnswers.has(request.answer.name)) {
        refused.images++;
        throw new GatewayError(
          'A test run reads a page image again only with --rescan.',
          400,
          noUsage,
          0
        );
      }
      try {
        const completion = await model.complete({
          ...request,
          metadata: { ...request.metadata, purpose: 'test-run' },
        });
        count(request.model, completion.usage, completion.cost);
        return completion;
      } catch (error) {
        if (error instanceof GatewayError || error instanceof ModelAnswerError) {
          count(request.model, error.usage, error.cost);
        }
        throw error;
      }
    },
  };
  return { client, byModel, refused };
}

const arrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/**
 * An employee import keeps each PDF page's image, found here by the PDF's hash; a client import
 * keeps none, so its scanned pages need the extractor.
 */
export function keptPageImages(
  record: ImportCopyRecord,
  objects: Pick<ImportObjects, 'read'>,
  folder: string,
  names: ReadonlySet<string>,
  fallback: ExtractorService | null
): ExtractorService {
  const fileOf = new Map(record.files.map((file) => [file.sha256, file.id]));
  const unavailable = (): never => {
    throw new ImportFailure('The copy keeps no image of this page; set EXTRACTOR_URL to draw it.');
  };
  return {
    async pdfPageImage(pdf, page) {
      const id = fileOf.get(await sha256(new Uint8Array(pdf)));
      const name = `${id}.page-${page}.jpg`;
      if (id && names.has(name)) return arrayBuffer(await objects.read(`${folder}/${name}`));
      return fallback ? fallback.pdfPageImage(pdf, page) : unavailable();
    },
    docToDocx: (doc) => (fallback ? fallback.docToDocx(doc) : unavailable()),
    pdfText: (pdf) => (fallback ? fallback.pdfText(pdf) : unavailable()),
    imageToJpeg: (image) => (fallback ? fallback.imageToJpeg(image) : unavailable()),
  };
}

// import_files.storage_path in the database names a file's object by its type alone.
const storageExtensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heic',
};

const derivedExtensions: Record<string, string> = {
  'application/msword': 'docx',
  'image/jpeg': 'jpeg',
};

const scanClaim = /\.(?:scan(?:-\d+)?|claim)\.json$/;
const pageReading = /\.page-\d+\.json$/;

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * The import's files as the pipeline's rows. An import read again starts each file as prepared,
 * from its kept text; a part reads them as its import left them.
 */
export function fileRows(record: ImportCopyRecord, folder: string, asLeft: boolean) {
  const names = new Set<string>();
  const files = record.files.map((file): ImportFileRow => {
    const own = file.objects.map(nameOf);
    for (const name of own) names.add(name);
    const storagePath = `${folder}/${file.id}.${storageExtensions[file.mimeType] ?? 'bin'}`;
    const textPath = textPathOf({ storage_path: storagePath, mime_type: file.mimeType });
    const derived = `${file.id}.${derivedExtensions[file.mimeType] ?? 'jpg'}`;
    const hasText = own.includes(nameOf(textPath));
    return {
      id: file.id,
      import_id: record.import,
      upload_path: file.uploadPath,
      original_file_name: nameOf(file.uploadPath),
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      sha256: file.sha256,
      storage_path: storagePath,
      state: asLeft ? file.state : hasText ? 'prepared' : 'failed',
      document_kind: asLeft ? file.kind : null,
      reason: asLeft || !hasText ? file.reason : null,
      company_name: asLeft ? (file.company?.name ?? null) : null,
      company_cui: asLeft ? (file.company?.cui ?? null) : null,
      page_count: file.pageCount,
      is_scan: file.isScan,
      text_path: hasText ? textPath : null,
      derived_path:
        own.includes(derived) && derived !== nameOf(storagePath) ? `${folder}/${derived}` : null,
      declared_pages: null,
      document_domain: asLeft ? file.domain : null,
    };
  });
  return { files, names };
}

const unused = (name: string) => () => {
  throw new Error(`A test run does not ${name}.`);
};

function memoryObjects(
  folder: string,
  names: ReadonlySet<string>,
  load: (name: string) => Promise<Uint8Array>,
  rescan: boolean
): ImportObjects {
  const written = new Map<string, Uint8Array>();
  const loaded = new Map<string, Promise<Uint8Array>>();
  // A claim of the first run would stop this one's steps, and with --rescan a page reading kept
  // would stand in for reading the page again.
  const kept = new Set(
    [...names].filter((name) => !scanClaim.test(name) && !(rescan && pageReading.test(name)))
  );
  const nameIn = (path: string) => (path.startsWith(`${folder}/`) ? nameOf(path) : null);
  const exists = (path: string) => {
    const name = nameIn(path);
    return written.has(path) || (name !== null && kept.has(name));
  };
  return {
    async read(path) {
      const own = written.get(path);
      if (own) return own;
      const name = nameIn(path);
      if (name === null || !kept.has(name)) throw new Error(`Object not found: ${path}`);
      let bytes = loaded.get(name);
      if (!bytes) {
        bytes = load(name);
        loaded.set(name, bytes);
      }
      return bytes;
    },
    async write(path, bytes) {
      written.set(path, bytes);
    },
    async create(path, bytes) {
      if (exists(path)) return false;
      written.set(path, bytes);
      return true;
    },
    async list(prefix) {
      const own = [...written.keys()].filter((path) => path.startsWith(`${prefix}/`)).map(nameOf);
      return [...new Set([...(prefix === folder ? kept : []), ...own])];
    },
    copy: unused('copy objects'),
    remove: unused('remove objects'),
  };
}

const emptyEmployeeClient: EmployeeImportClient = {
  jobPositions: [],
  workplaces: [],
  employees: [],
};

interface CaseState {
  row: ImportRow & Record<string, unknown>;
  files: ImportFileRow[];
  part: (LibraryPartRow & Record<string, unknown>) | null;
}

/**
 * The client's library, its sheets and its employees are left empty: after the confirm they hold
 * what this very import wrote, which would make the reading look identical to the answer.
 */
function memoryStore(state: CaseState, context: CaseContext): ImportStore {
  const row = () => state.row;
  return {
    getImport: async () => row(),
    listFiles: async () => state.files,
    async updateFile(fileId, patch, from) {
      const file = state.files.find((each) => each.id === fileId);
      if (!file || (from && file.state !== from)) return false;
      Object.assign(file, patch);
      return true;
    },
    async advance(_importId, from, patch) {
      if (row().status !== from) return false;
      Object.assign(row(), patch);
      return true;
    },
    recordUsage: async () => {},
    chargeScannedPage: async () => {},
    settleSheetPages: async () => true,
    openLibraryParts: async () => [],
    getLibraryPart: async (_importId, part) => (state.part?.part === part ? state.part : null),
    async updateLibraryPart(_importId, part, attempt, patch) {
      const current = state.part;
      if (!current || current.part !== part || current.status !== 'reading') return false;
      if (current.attempt !== attempt) return false;
      Object.assign(current, patch);
      return true;
    },
    recordLibraryPartUsage: async () => {},
    chargeLibraryPart: async () => {},
    libraryModules: async () => [],
    riskLibrary: async () => ({ entries: [], names: [] }),
    clientSheets: async () => ({ jobPositions: [], sensitiveGroups: 0, other: {} }),
    provider: (organizationId) => context.provider(organizationId),
    client: (clientId) => context.client(clientId),
    employeeImportClient: async () => emptyEmployeeClient,
    trainingThemes: (importRow, today) => context.trainingThemes(importRow, today),
    keepPageImage: async () => {},
    folderCopies: unused('copy a folder'),
    markCopied: unused('copy a folder'),
    uncopiedImports: unused('clean up'),
    failStalled: unused('clean up'),
    failStalledLibraryParts: unused('clean up'),
    listAbandoned: unused('clean up'),
    deleteAbandoned: unused('clean up'),
    dropProposals: unused('clean up'),
    listObjectsToRemove: unused('clean up'),
    markObjectsRemoved: unused('clean up'),
    listExpiredCopies: unused('clean up'),
    markCopiesRemoved: unused('clean up'),
  };
}

// Messages past the reading: the copy, the alerts and the folder's copy for a confirm.
const afterReading = new Set<ImportMessage['type']>(['keep', 'ended', 'copy']);
const maxSteps = 5_000;

export interface CaseReading {
  proposal: unknown;
  failure: string | null;
}

export interface ReadAgainInput {
  testCase: TestCase;
  source: CopySource;
  context: CaseContext;
  model: ModelClient;
  extractor: ExtractorService | null;
  rescan: boolean;
}

export async function readAgain(input: ReadAgainInput): Promise<CaseReading> {
  const { testCase, rescan } = input;
  const importRecord = testCase.type === 'import' ? testCase.record : testCase.importRecord;
  const folder = testCase.folder;
  const { files, names } = fileRows(importRecord, folder, testCase.type === 'part');
  const objects = memoryObjects(
    folder,
    names,
    (name) => input.source.read(`${folder}/files/${name}`),
    rescan
  );
  const forClient = importRecord.kind === 'client';
  const state: CaseState = {
    row: {
      id: importRecord.import,
      organization_id: importRecord.organization,
      kind: importRecord.kind,
      // A new client's import names the client its confirm made, which its reading never saw.
      client_id: !forClient || importRecord.intoExistingClient ? importRecord.clientId : null,
      into_existing_client: importRecord.intoExistingClient,
      status: testCase.type === 'import' ? 'sorting' : 'confirmed',
      company_name: null,
      company_cui: null,
      proposal: testCase.type === 'import' ? null : importRecord.proposal,
      files_copied_at: null,
      created_by: null,
    },
    files,
    part:
      testCase.type === 'part'
        ? {
            import_id: importRecord.import,
            part: testCase.part,
            status: 'reading',
            attempt: 1,
            proposal: null,
          }
        : null,
  };
  const queue: ImportMessage[] = [];
  const deps: PipelineDeps = {
    store: memoryStore(state, input.context),
    objects,
    copies: {
      list: unused('list copies'),
      remove: unused('remove copies'),
      copyIn: unused('write a copy'),
      write: unused('write a copy'),
    },
    extractor: keptPageImages(importRecord, objects, folder, names, input.extractor),
    model: input.model,
    registry: {
      lookup: async () => {
        throw new Error('A test run does not ask ANAF.');
      },
    },
    queue: {
      send: async (body) => queue.push(body),
      sendBatch: async (messages) => {
        for (const { body } of messages) queue.push(body);
      },
    },
    records: {
      get: unused('read records'),
      recordCopy: unused('write a copy'),
      uncopied: unused('write a copy'),
      activity: unused('read records'),
      between: unused('read records'),
    },
    alerts: { enabled: false, send: async () => false },
  };

  queue.push(firstMessage(testCase));
  for (let step = 1; queue.length > 0; step++) {
    if (step > maxSteps) throw new Error(`The reading did not end within ${maxSteps} steps.`);
    const message = queue.shift()!;
    if (afterReading.has(message.type)) continue;
    if (!rescan && message.type === 'scan' && !message.pages) {
      keepFirstSorting(state, importRecord, message.fileId);
    }
    try {
      await runStep(deps, message, `test-run-${step}`);
    } catch (error) {
      await recordFailure(deps, message, error);
    }
  }
  return outcomeOf(state);
}

function firstMessage(testCase: TestCase): ImportMessage {
  const importId = testCase.record.import;
  if (testCase.type === 'import') return { type: 'sort', importId };
  const part: ImportLibraryPart = testCase.part;
  return part === 'risk_evaluations'
    ? { type: 'read-risks', importId, attempt: 1 }
    : { type: 'read-instructions', importId, part, attempt: 1 };
}

// A file with no text is sorted from a picture of its first page, which a run without --rescan
// does not send again: it takes the kind the first run gave.
function keepFirstSorting(state: CaseState, record: ImportCopyRecord, fileId: string) {
  const file = state.files.find((each) => each.id === fileId);
  const first = record.files.find((each) => each.id === fileId);
  if (!file || !first || file.state !== 'prepared' || file.document_kind !== null) return;
  if (first.state === 'set_aside' || first.state === 'for_employees') {
    Object.assign(file, { state: first.state, document_kind: first.kind, reason: first.reason });
    return;
  }
  file.document_kind = first.kind;
}

function outcomeOf(state: CaseState): CaseReading {
  if (state.part) {
    const { status, proposal, failure_reason: reason } = state.part;
    if (status === 'to_review' || status === 'nothing_new') return { proposal, failure: null };
    return { proposal: null, failure: String(reason ?? `The part stopped at ${status}.`) };
  }
  const { status, proposal, failure_reason: reason } = state.row;
  if (status === 'ready') return { proposal, failure: null };
  return { proposal: null, failure: String(reason ?? `The import stopped at ${status}.`) };
}
