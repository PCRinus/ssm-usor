import { importCredits, type ImportKind, type PdfPageText } from '@ssm-usor/contracts';
import {
  type ChatMessage,
  type DocumentKind,
  docxToText,
  fileHeader,
  GatewayError,
  identityMessage,
  ModelAnswerError,
  type Reading,
  readingAnswer,
  readingMessages,
  readingModel,
  setAsideKinds,
  type SheetPage,
  sheetPageAnswer,
  sheetPageMessages,
  sortingAnswer,
  sortingModel,
  sortingSystemPrompt,
} from '@ssm-usor/import';

import { sha256 } from '../../lib/docx';
import type { ImportMessage } from '../../lib/env';
import {
  ask,
  failImport,
  fileFailureReason,
  fileReasons,
  type FileToRead,
  identityOf,
  ImportFailure,
  type ImportObjects,
  importReasons,
  isTransient,
  permanentFileFailure,
  type PipelineDeps,
  readingOutputTokens,
  requireQueue,
  scanBatchPages,
  sendAll,
  sheetOutputTokens,
  sortingOutputTokens,
  transition,
} from './pipeline';
import { readingVersion } from './reading-version';
import {
  asJson,
  type ImportFileRow,
  type ImportFileUpdate,
  ImportLimitError,
  type ImportRow,
} from './store';

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const wordTypes = new Set(['application/msword', docxType]);

const isWord = (file: Pick<ImportFileRow, 'mime_type'>) => wordTypes.has(file.mime_type);
export const isImage = (file: Pick<ImportFileRow, 'mime_type'>) =>
  file.mime_type.startsWith('image/');
/**
 * What starting an import charges for a file it holds (ADR 030): a photograph is always read, and
 * an employee import reads every page of a PDF, as many as the browser counted. A client's PDF
 * is covered by the reading's 25 until its scanned pages are found.
 */
export function startCreditsOf(
  file: Pick<ImportFileRow, 'mime_type' | 'declared_pages'>,
  kind: ImportKind = 'employees'
) {
  if (isImage(file)) return importCredits.perPage;
  if (kind === 'client' || file.mime_type !== 'application/pdf') return 0;
  return (file.declared_pages ?? 1) * importCredits.perPage;
}

export const isSheetFile = (file: Pick<ImportFileRow, 'mime_type'>) =>
  isImage(file) || file.mime_type === 'application/pdf';

export const textPathOf = (file: Pick<ImportFileRow, 'storage_path' | 'mime_type'>) =>
  file.storage_path.replace(/\.[a-z]+$/, isWord(file) ? '.txt' : '.json');

const basePathOf = (file: Pick<ImportFileRow, 'storage_path'>) =>
  file.storage_path.replace(/\.[a-z]+$/, '');

export const folderOf = (row: Pick<ImportRow, 'organization_id' | 'id'>) =>
  `${row.organization_id}/${row.id}`;

export const pageReadingPathOf = (file: Pick<ImportFileRow, 'storage_path'>, page: number) =>
  `${basePathOf(file)}.page-${page}.json`;

export const pageReadingName = /^[0-9a-f-]{36}\.page-\d+\.json$/;

export const pageLocationsPathOf = (file: Pick<ImportFileRow, 'storage_path'>, page: number) =>
  `${basePathOf(file)}.page-${page}.locations.json`;

// import_folder_copies in the database names a page's image the same way.
export const pageImagePathOf = (file: Pick<ImportFileRow, 'storage_path'>, page: number) =>
  `${basePathOf(file)}.page-${page}.jpg`;

// Null for the step that sorts a scan and sends its pages; a batch's first page otherwise.
const scanClaimPathOf = (file: Pick<ImportFileRow, 'storage_path'>, firstPage: number | null) =>
  `${basePathOf(file)}.${firstPage === null ? 'scan' : `scan-${firstPage}`}.json`;

// A JPEG's own object already ends in .jpg, and a second dot would not pass the bucket's policy.
const derivedExtension: Record<string, string> = {
  'application/msword': '.docx',
  'image/jpeg': '.jpeg',
};

const derivedPathOf = (file: Pick<ImportFileRow, 'storage_path' | 'mime_type'>) =>
  file.storage_path.replace(/\.[a-z]+$/, derivedExtension[file.mime_type] ?? '.jpg');

/** A page read as an image is named apart from its file, so its quotes are not searched in the text. */
export const pageLabel = (file: Pick<ImportFileRow, 'upload_path' | 'mime_type'>, page: number) =>
  isImage(file) ? file.upload_path : `${file.upload_path} (pagina ${page})`;

/** What a PDF or a photograph keeps at its `text_path`; a photograph is one scanned page. */
export interface PreparedPages {
  pageCount: number;
  pages: PdfPageText[];
  // By page label, what the model read on each scanned page, once every one of them is read.
  readings?: Record<string, Reading>;
  // An employee import's: by page number, what the model read on each page; null for a page it
  // could not read.
  sheets?: Record<string, SheetPage | null>;
}

export interface LoadedFile {
  file: ImportFileRow;
  // A Word file's text, or a PDF's pages that are not scans.
  text: string;
  pages: PreparedPages | null;
}

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export const fileToRead = (entry: LoadedFile): FileToRead => ({
  name: entry.file.original_file_name,
  characters: entry.text.length,
  scannedPages: entry.pages?.pages.filter((page) => page.isScan).length ?? 0,
});

export async function loadPrepared(
  objects: Pick<ImportObjects, 'read'>,
  file: ImportFileRow
): Promise<LoadedFile> {
  const path = file.text_path ?? textPathOf(file);
  const bytes = await objects.read(path);
  if (isWord(file)) return { file, text: decoder.decode(bytes), pages: null };
  const pages = JSON.parse(decoder.decode(bytes)) as PreparedPages;
  return {
    file,
    text: pages.pages
      .filter((page) => !page.isScan)
      .map((page) => page.text)
      .join('\n\n'),
    pages,
  };
}

const arrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

function base64(bytes: Uint8Array) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export const dataUrl = (bytes: Uint8Array, type: string) => `data:${type};base64,${base64(bytes)}`;

function requireExtractor(deps: PipelineDeps) {
  if (!deps.extractor) throw new ImportFailure(importReasons.notConfigured);
  return deps.extractor;
}

export async function prepareFile(deps: PipelineDeps, importId: string, fileId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'preparing') return;
  const file = (await deps.store.listFiles(importId)).find((each) => each.id === fileId);
  if (file?.state === 'uploaded') {
    try {
      await deps.store.updateFile(file.id, await prepare(deps, file), 'uploaded');
    } catch (error) {
      if (error instanceof ImportLimitError) {
        await failImport(deps, importId, 'preparing', importReasons.overLimits[row.kind]);
        return;
      }
      if (!permanentFileFailure(error)) throw error;
      await deps.store.updateFile(
        file.id,
        { state: 'failed', reason: fileFailureReason(error) },
        'uploaded'
      );
    }
  }
  await afterPreparing(deps, importId);
}

export async function afterPreparing(deps: PipelineDeps, importId: string) {
  const files = await deps.store.listFiles(importId);
  if (files.some((file) => file.state === 'uploaded')) return;
  const row = await deps.store.getImport(importId);
  if (!row) return;
  await transition(
    deps,
    importId,
    'preparing',
    { status: 'sorting', reading_version: asJson(await readingVersion(row.kind)) },
    [{ type: 'sort', importId }]
  );
}

async function prepare(deps: PipelineDeps, file: ImportFileRow): Promise<ImportFileUpdate> {
  const bytes = await deps.objects.read(file.storage_path);
  const digest = await sha256(bytes);
  // The browser declared the size the caps counted; the stored bytes are what the import folder
  // will hold. Their real size is written even on a failed file, so the caps see it (IMP05).
  if (bytes.length !== file.size_bytes) {
    return {
      state: 'failed',
      reason: fileReasons.sizeMismatch,
      size_bytes: bytes.length,
      sha256: digest,
    };
  }
  const textPath = textPathOf(file);
  const patch: ImportFileUpdate = { state: 'prepared', reason: null, text_path: textPath };
  if (digest !== file.sha256) patch.sha256 = digest;
  const keepDerived = async (derived: Uint8Array, type: string) => {
    const path = derivedPathOf(file);
    await deps.objects.write(path, derived, type);
    patch.derived_path = path;
    patch.derived_size_bytes = derived.length;
    patch.derived_sha256 = await sha256(derived);
  };
  const writePages = (pages: PreparedPages) =>
    deps.objects.write(textPath, encoder.encode(JSON.stringify(pages)), 'application/json');

  if (file.mime_type === docxType) {
    await deps.objects.write(textPath, encoder.encode(docxToText(bytes)), 'text/plain');
  } else if (file.mime_type === 'application/msword') {
    const docx = new Uint8Array(await requireExtractor(deps).docToDocx(arrayBuffer(bytes)));
    await keepDerived(docx, docxType);
    await deps.objects.write(textPath, encoder.encode(docxToText(docx)), 'text/plain');
  } else if (file.mime_type === 'application/pdf') {
    const pdf = await requireExtractor(deps).pdfText(arrayBuffer(bytes));
    await writePages({ pageCount: pdf.pageCount, pages: pdf.pages });
    patch.page_count = pdf.pageCount >= 1 ? pdf.pageCount : null;
    patch.is_scan = pdf.pages.some((page) => page.isScan);
  } else {
    await keepDerived(
      new Uint8Array(await requireExtractor(deps).imageToJpeg(arrayBuffer(bytes))),
      'image/jpeg'
    );
    await writePages({ pageCount: 1, pages: [{ number: 1, text: '', isScan: true }] });
    patch.page_count = 1;
    patch.is_scan = true;
  }
  return patch;
}

// A set-aside file the member sent back to be read is read for the library too.
const libraryStates = new Set(['set_aside', 'read', 'prepared']);

export const isLibraryFile = (file: ImportFileRow) =>
  file.document_domain !== null &&
  libraryStates.has(file.state) &&
  (file.document_kind === 'own_instructions' || file.document_kind === 'training_themes');

// Read by the client reading too, for the posts and the evaluation team (ADR 030).
export const isRiskFile = (file: ImportFileRow) =>
  file.document_kind === 'risk_assessment' && file.state === 'read';

export const sortedStates = new Set([
  'prepared',
  'read',
  'set_aside',
  'for_employees',
  'other_company',
]);

export function setAsideReason(kind: DocumentKind) {
  if (kind === 'cover') return fileReasons.coverOrIndex;
  if (kind === 'blank_form') return fileReasons.blankForm;
  if (kind === 'generic_text') return fileReasons.genericText;
  if (kind === 'own_instructions') return fileReasons.ownInstructions;
  if (kind === 'training_material') return fileReasons.trainingMaterial;
  return fileReasons.noClientData;
}

// Every page of an employee import's file is read as an image; a client import's PDF has its
// text taken out, so only its scanned pages are.
const pagesToRead = (row: Pick<ImportRow, 'kind'>, prepared: PreparedPages) =>
  prepared.pages
    .filter((page) => row.kind === 'employees' || page.isScan)
    .map((page) => page.number);

// A claim is an object created only when absent, so a scan's step or a batch of its pages sent
// twice (a step retried after sending part of its messages) is paid for once. The owner is the
// queue message: its own redelivery takes the work up again, which the claim lets through.
export async function claimed(deps: PipelineDeps, path: string, owner: string) {
  const claim = JSON.stringify({ owner });
  if (await deps.objects.create(path, encoder.encode(claim), 'application/json')) return true;
  return decoder.decode(await deps.objects.read(path)) === claim;
}

async function scanning(deps: PipelineDeps, importId: string, fileId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'reading') return null;
  const file = (await deps.store.listFiles(importId)).find((each) => each.id === fileId);
  if (!file || file.state !== 'prepared') return null;
  return { row, file };
}

async function failScan(deps: PipelineDeps, file: ImportFileRow, error: unknown) {
  if (!permanentFileFailure(error)) throw error;
  await deps.store.updateFile(
    file.id,
    { state: 'failed', reason: fileFailureReason(error) },
    'prepared'
  );
}

export async function pageImage(deps: PipelineDeps, file: ImportFileRow) {
  let original: Uint8Array | null = null;
  return async (page: number) => {
    if (file.derived_path && isImage(file)) {
      return { bytes: await deps.objects.read(file.derived_path), type: 'image/jpeg' };
    }
    original ??= await deps.objects.read(file.storage_path);
    // A JPEG or PNG prepared before photographs were converted, in an import still running.
    if (isImage(file)) return { bytes: original, type: file.mime_type };
    const jpeg = await requireExtractor(deps).pdfPageImage(arrayBuffer(original), page);
    return { bytes: new Uint8Array(jpeg), type: 'image/jpeg' };
  };
}

/**
 * Sorts a photograph or a PDF with no text from its first page, then sends its scanned pages to
 * be read in batches, each in a message of its own.
 */
export async function scanFile(
  deps: PipelineDeps,
  importId: string,
  fileId: string,
  owner: string
) {
  const found = await scanning(deps, importId, fileId);
  if (!found) return;
  const { row, file } = found;
  if (!(await claimed(deps, scanClaimPathOf(file, null), owner))) return;
  try {
    const prepared = (await loadPrepared(deps.objects, file)).pages!;
    const scanned = pagesToRead(row, prepared);
    if (
      row.kind === 'client' &&
      file.document_kind === null &&
      scanned.length === prepared.pages.length &&
      scanned[0]
    ) {
      const settled = await triageScan(deps, row, file, scanned[0]);
      if (settled) {
        await deps.store.updateFile(file.id, settled, 'prepared');
        return;
      }
    }
    if (scanned.length === 0) {
      await finishScan(deps, row, file);
      return;
    }
    const batches: ImportMessage[] = [];
    for (let start = 0; start < scanned.length; start += scanBatchPages) {
      batches.push({
        type: 'scan',
        importId,
        fileId,
        pages: scanned.slice(start, start + scanBatchPages),
      });
    }
    await sendAll(requireQueue(deps), batches);
  } catch (error) {
    await failScan(deps, file, error);
  }
}

async function triageScan(
  deps: PipelineDeps,
  row: ImportRow,
  file: ImportFileRow,
  firstPage: number
): Promise<ImportFileUpdate | null> {
  const { provider } = await identityOf(deps, row);
  const first = await (await pageImage(deps, file))(firstPage);
  const messages: ChatMessage[] = [
    { role: 'system', content: sortingSystemPrompt },
    identityMessage(provider),
    {
      role: 'user',
      content: [
        { type: 'text', text: fileHeader(file.upload_path) },
        { type: 'image_url', image_url: { url: dataUrl(first.bytes, first.type) } },
      ],
    },
  ];
  const triage = (
    await ask(deps, row, file.id, 'sorting', {
      model: sortingModel,
      messages,
      answer: sortingAnswer,
      reasoningEffort: 'low',
      maxCompletionTokens: sortingOutputTokens,
    })
  ).files[0];
  if (!triage) return null;
  const kind = triage.kind;
  if (kind === 'training_sheet') {
    return { state: 'for_employees', document_kind: kind, reason: fileReasons.trainingSheet };
  }
  if (setAsideKinds.includes(kind) || !triage.carriesClientData) {
    return {
      state: 'set_aside',
      document_kind: kind,
      reason: setAsideKinds.includes(kind) ? setAsideReason(kind) : fileReasons.noClientData,
    };
  }
  // Kept now, so a redelivery of this step does not ask again.
  await deps.store.updateFile(file.id, { document_kind: kind }, 'prepared');
  return null;
}

/** Reads a batch of a scan's pages, each kept as it comes, so a retry pays only for the rest. */
export async function scanPages(
  deps: PipelineDeps,
  importId: string,
  fileId: string,
  pages: number[],
  owner: string
) {
  const found = await scanning(deps, importId, fileId);
  if (!found) return;
  const { row, file } = found;
  if (!(await claimed(deps, scanClaimPathOf(file, pages[0]!), owner))) return;
  try {
    const read = await readPageNumbers(deps, row, file);
    const image = await pageImage(deps, file);
    const readPage =
      row.kind === 'employees'
        ? sheetPageReader(deps, row, file)
        : await documentPageReader(deps, row, file);
    for (const page of pages) {
      if (read.has(page)) continue;
      if (row.kind === 'client' && !isImage(file)) {
        await deps.store.chargeScannedPage(row, file.id, page);
      }
      const picture = await image(page);
      if (row.kind === 'employees' && !isImage(file)) {
        await keepPageImage(deps, file, page, picture.bytes);
      }
      const reading = await readPage(pageLabel(file, page), dataUrl(picture.bytes, picture.type));
      await deps.objects.write(
        pageReadingPathOf(file, page),
        encoder.encode(JSON.stringify(reading)),
        'application/json'
      );
    }
    await finishScan(deps, row, file);
  } catch (error) {
    await failScan(deps, file, error);
  }
}

// Kept before the page's reading, so a page read always has the image its employee's file
// becomes (ADR 032).
async function keepPageImage(
  deps: PipelineDeps,
  file: ImportFileRow,
  page: number,
  bytes: Uint8Array
) {
  await deps.objects.write(pageImagePathOf(file, page), bytes, 'image/jpeg');
  await deps.store.keepPageImage(file.id, page, {
    sizeBytes: bytes.byteLength,
    sha256: await sha256(bytes),
  });
}

async function documentPageReader(deps: PipelineDeps, row: ImportRow, file: ImportFileRow) {
  const { provider, client } = await identityOf(deps, row);
  return (label: string, imageUrl: string): Promise<Reading> =>
    ask(deps, row, file.id, 'scanning', {
      model: readingModel,
      messages: readingMessages({ provider, client, files: [{ path: label, imageUrl }] }),
      answer: readingAnswer,
      reasoningEffort: 'medium',
      maxCompletionTokens: readingOutputTokens,
    });
}

// A page the model refuses, answers outside the schema or the gateway turns down for good is kept
// as unread, for the member to give to a person or leave out, rather than failing the whole PDF.
function sheetPageReader(deps: PipelineDeps, row: ImportRow, file: ImportFileRow) {
  return async (label: string, imageUrl: string): Promise<SheetPage | null> => {
    try {
      return await ask(deps, row, file.id, 'scanning', {
        model: readingModel,
        messages: sheetPageMessages({ path: label, imageUrl }),
        answer: sheetPageAnswer,
        reasoningEffort: 'medium',
        maxCompletionTokens: sheetOutputTokens,
      });
    } catch (error) {
      if (error instanceof ModelAnswerError) return null;
      if (error instanceof GatewayError && !isTransient(error)) return null;
      throw error;
    }
  };
}

async function readPageNumbers(deps: PipelineDeps, row: ImportRow, file: ImportFileRow) {
  const prefix = `${file.id}.page-`;
  return new Set(
    (await deps.objects.list(folderOf(row)))
      .filter((name) => name.startsWith(prefix) && pageReadingName.test(name))
      .map((name) => Number(name.slice(prefix.length, -'.json'.length)))
  );
}

// Every batch tries once its own pages are kept; whichever sees the last page read gathers the
// readings into the file's pages, which two batches finishing at once write alike.
async function finishScan(deps: PipelineDeps, row: ImportRow, file: ImportFileRow) {
  const read = await readPageNumbers(deps, row, file);
  const prepared = (await loadPrepared(deps.objects, file)).pages!;
  const scanned = pagesToRead(row, prepared);
  if (!scanned.every((page) => read.has(page))) return;
  const pageReadings = new Map<number, unknown>();
  for (const page of scanned) {
    const bytes = await deps.objects.read(pageReadingPathOf(file, page));
    pageReadings.set(page, JSON.parse(decoder.decode(bytes)));
  }
  const gathered: PreparedPages = { pageCount: prepared.pageCount, pages: prepared.pages };
  if (row.kind === 'employees') {
    gathered.sheets = Object.fromEntries(
      [...pageReadings].map(([page, reading]) => [String(page), reading as SheetPage | null])
    );
  } else {
    gathered.readings = Object.fromEntries(
      [...pageReadings].map(([page, reading]) => [pageLabel(file, page), reading as Reading])
    );
  }
  await deps.objects.write(
    file.text_path ?? textPathOf(file),
    encoder.encode(JSON.stringify(gathered)),
    'application/json'
  );
  await deps.store.updateFile(file.id, { state: 'read', reason: null }, 'prepared');
}

export async function copyFolder(deps: PipelineDeps, importId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'confirmed' || row.files_copied_at) return;
  for (const copy of await deps.store.folderCopies(importId)) {
    await deps.objects.copy(copy.source_path, copy.target_path, 'client-files');
  }
  await deps.store.markCopied(importId);
}
