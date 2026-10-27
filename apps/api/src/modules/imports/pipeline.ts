import {
  type CompanyLookup,
  extractionRefusalOf,
  type ExtractorService,
  type PdfPageText,
} from '@ssm-usor/contracts';
import {
  type ChatMessage,
  type CompletionRequest,
  type DocumentKind,
  DocxReadError,
  docxToText,
  type ExistingClient,
  type FileTriage,
  GatewayError,
  lookUpRegistrations,
  ModelAnswerError,
  type ModelClient,
  proposalSchema,
  type ProviderIdentity,
  type Reading,
  readingAnswer,
  readingMessages,
  readingModel,
  sortFiles,
  sortingAnswer,
  sortingMessages,
  sortingModel,
  sortingSystemPrompt,
  toProposal,
  withChecks,
} from '@ssm-usor/import';

import { sha256 } from '../../lib/docx';
import type { ImportMessage, ImportQueue } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import type { RegisteredCompany } from './payload';
import {
  asJson,
  type ImportFileRow,
  type ImportFileUpdate,
  type ImportRow,
  type ImportStatus,
  type ImportStore,
  type ImportUpdate,
} from './store';

export interface ImportObjects {
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  copy(from: string, to: string, bucket: 'imports' | 'client-files'): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export interface PipelineDeps {
  store: ImportStore;
  objects: ImportObjects;
  extractor: ExtractorService | null;
  model: ModelClient | null;
  // ANAF; it throws when ANAF cannot answer.
  registry: { lookup(cui: string): Promise<CompanyLookup | null> };
  queue: ImportQueue | null;
}

// Below the price tier the sorting model charges more past (packages/import's models.ts), at
// about 3.5 characters a token.
export const maxReadingCharacters = 600_000;
export const maxScannedPages = 150;
export const readPollSeconds = 10;
// Half an hour of waiting for the scans, past which one of them is taken as lost.
export const maxReadWaits = 180;

/** A failure that another delivery would meet again, with its reason for members. */
export class ImportFailure extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ImportFailure';
  }
}

export const fileReasons = {
  too_large: 'Fișierul este prea mare pentru a fi citit.',
  unsupported: 'Fișierul nu este într-un format pe care îl putem citi.',
  corrupt: 'Fișierul pare deteriorat și nu se poate deschide.',
  password_protected: 'Fișierul este protejat cu parolă.',
  timeout: 'Citirea fișierului a durat prea mult.',
  page_out_of_range: 'O pagină a fișierului nu se poate citi.',
  unavailable: 'Fișierul nu a putut fi citit: serviciul de citire nu a răspuns.',
  modelRefused: 'Modelul a refuzat să citească fișierul.',
  modelFailed: 'Modelul nu a dat un răspuns pe care să-l putem folosi pentru acest fișier.',
  coverOrIndex: 'Copertă, etichetă sau cuprins: nu conține date despre client.',
  blankForm: 'Formular sau registru necompletat.',
  genericText: 'Text general, fără date despre client.',
  noClientData: 'Nu conține date despre client.',
  trainingSheet: 'Fișă de instruire individuală: rămâne pentru importul angajaților.',
} as const;

export const importReasons = {
  nothingPrepared: 'Niciun fișier nu a putut fi citit.',
  nothingToRead: 'Niciun document nu conține date despre client.',
  tooMuchText:
    'Documentele au prea mult text pentru un singur import. Încearcă din nou cu mai puține fișiere.',
  tooManyScans:
    'Sunt prea multe pagini scanate pentru un singur import. Încearcă din nou cu mai puține fișiere.',
  scansUnfinished: 'Citirea fișierelor scanate nu s-a terminat.',
  unavailable:
    'Serviciul care citește documentele nu a răspuns. Renunță la import și încearcă din nou.',
  notConfigured: 'Importul din documente nu este disponibil acum.',
  modelRefused: 'Modelul a refuzat să citească documentele.',
  modelFailed: 'Modelul nu a dat un răspuns pe care să-l putem folosi. Încearcă din nou.',
  failed: 'Importul s-a oprit din cauza unei erori. Renunță la el și încearcă din nou.',
} as const;

const setAsideKinds: DocumentKind[] = ['cover', 'blank_form', 'generic_text'];

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const wordTypes = new Set(['application/msword', docxType]);
const heicTypes = new Set(['image/heic', 'image/heif']);

const isWord = (file: Pick<ImportFileRow, 'mime_type'>) => wordTypes.has(file.mime_type);
const isImage = (file: Pick<ImportFileRow, 'mime_type'>) => file.mime_type.startsWith('image/');

export const textPathOf = (file: Pick<ImportFileRow, 'storage_path' | 'mime_type'>) =>
  file.storage_path.replace(/\.[a-z]+$/, isWord(file) ? '.txt' : '.json');

const derivedPathOf = (file: Pick<ImportFileRow, 'storage_path' | 'mime_type'>) =>
  file.storage_path.replace(
    /\.[a-z]+$/,
    file.mime_type === 'application/msword' ? '.docx' : '.jpg'
  );

/** A page read as an image is named apart from its file, so its quotes are not searched in the text. */
export const pageLabel = (file: Pick<ImportFileRow, 'upload_path' | 'mime_type'>, page: number) =>
  isImage(file) ? file.upload_path : `${file.upload_path} (pagina ${page})`;

/** What a PDF or a photograph keeps at its `text_path`; a photograph is one scanned page. */
export interface PreparedPages {
  pageCount: number;
  pages: PdfPageText[];
  // By page label, what the model read on each scanned page.
  readings?: Record<string, Reading>;
}

export interface LoadedFile {
  file: ImportFileRow;
  // A Word file's text, or a PDF's pages that are not scans.
  text: string;
  pages: PreparedPages | null;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function loadPrepared(
  objects: ImportObjects,
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

const dataUrl = (bytes: Uint8Array, type: string) => `data:${type};base64,${base64(bytes)}`;

function requireExtractor(deps: PipelineDeps) {
  if (!deps.extractor) throw new ImportFailure(importReasons.notConfigured);
  return deps.extractor;
}

function requireQueue(deps: PipelineDeps) {
  if (!deps.queue) throw new ImportFailure(importReasons.notConfigured);
  return deps.queue;
}

async function ask<T>(
  deps: PipelineDeps,
  row: ImportRow,
  fileId: string | null,
  request: Omit<CompletionRequest<T>, 'metadata'>
): Promise<T> {
  if (!deps.model) throw new ImportFailure(importReasons.notConfigured);
  const record = async (
    usage: { input: number; cachedInput: number; output: number },
    cost: number
  ) => {
    if (usage.input + usage.cachedInput + usage.output === 0) return;
    // Paying for a request twice is worse than a missing count, so a failure here is not retried.
    await deps.store
      .recordUsage(row.id, fileId, usage, cost)
      .catch((error: unknown) =>
        console.error(`Usage of import ${row.id} was not recorded: ${describe(error)}`)
      );
  };
  try {
    const completion = await deps.model.complete({
      ...request,
      metadata: { organizationId: row.organization_id, importId: row.id },
    });
    await record(completion.usage, completion.cost);
    return completion.value;
  } catch (error) {
    if (error instanceof GatewayError || error instanceof ModelAnswerError) {
      await record(error.usage, error.cost);
    }
    throw error;
  }
}

async function identityOf(deps: PipelineDeps, row: ImportRow) {
  const provider: ProviderIdentity = await deps.store.provider(row.organization_id);
  const client: ExistingClient | undefined = row.client_id
    ? ((await deps.store.client(row.client_id)) ?? undefined)
    : undefined;
  return { provider, client };
}

// Cloudflare Queues take at most a hundred messages in a batch.
export async function sendAll(queue: ImportQueue, messages: ImportMessage[]) {
  for (let start = 0; start < messages.length; start += 100) {
    await queue.sendBatch(messages.slice(start, start + 100).map((body) => ({ body })));
  }
}

// Moving on and sending the next step are two writes; when the second fails, the first is taken
// back so that the delivery that is retried moves on again.
async function transition(
  deps: PipelineDeps,
  importId: string,
  from: ImportStatus,
  patch: ImportUpdate & { status: ImportStatus },
  messages: ImportMessage[]
) {
  const queue = messages.length > 0 ? requireQueue(deps) : null;
  if (!(await deps.store.advance(importId, from, patch))) return;
  if (!queue) return;
  try {
    await sendAll(queue, messages);
  } catch (error) {
    await deps.store
      .advance(importId, patch.status, { status: from })
      .catch((undo: unknown) =>
        console.error(`Import ${importId} stays at ${patch.status} unsent: ${describe(undo)}`)
      );
    throw error;
  }
}

export const failedPatch = (reason: string): ImportUpdate & { status: 'failed' } => ({
  status: 'failed',
  failure_reason: reason,
  failed_at: new Date().toISOString(),
});

export async function prepareFile(deps: PipelineDeps, importId: string, fileId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'preparing') return;
  const file = (await deps.store.listFiles(importId)).find((each) => each.id === fileId);
  if (file?.state === 'uploaded') {
    try {
      await deps.store.updateFile(file.id, await prepare(deps, file));
    } catch (error) {
      if (!permanentFileFailure(error)) throw error;
      await deps.store.updateFile(file.id, { state: 'failed', reason: fileFailureReason(error) });
    }
  }
  await afterPreparing(deps, importId);
}

export async function afterPreparing(deps: PipelineDeps, importId: string) {
  const files = await deps.store.listFiles(importId);
  if (files.some((file) => file.state === 'uploaded')) return;
  await transition(deps, importId, 'preparing', { status: 'sorting' }, [
    { type: 'sort', importId },
  ]);
}

async function prepare(deps: PipelineDeps, file: ImportFileRow): Promise<ImportFileUpdate> {
  const bytes = await deps.objects.read(file.storage_path);
  const textPath = textPathOf(file);
  const patch: ImportFileUpdate = { state: 'prepared', reason: null, text_path: textPath };
  const digest = await sha256(bytes);
  // The browser described the file; the stored bytes are what the import folder will hold.
  if (digest !== file.sha256 || bytes.length !== file.size_bytes) {
    patch.sha256 = digest;
    patch.size_bytes = bytes.length;
  }
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
    if (heicTypes.has(file.mime_type)) {
      await keepDerived(
        new Uint8Array(await requireExtractor(deps).heicToJpeg(arrayBuffer(bytes))),
        'image/jpeg'
      );
    }
    await writePages({ pageCount: 1, pages: [{ number: 1, text: '', isScan: true }] });
    patch.page_count = 1;
    patch.is_scan = true;
  }
  return patch;
}

const sortedStates = new Set(['prepared', 'read', 'set_aside', 'for_employees', 'other_company']);

function fileCompany(triage: FileTriage | undefined) {
  const name = triage?.companyName?.trim().slice(0, 200) || null;
  const cui = triage?.companyCui?.replace(/\D/g, '') ?? '';
  return { company_name: name, company_cui: /^[1-9][0-9]{1,9}$/.test(cui) ? cui : null };
}

function setAsideReason(kind: DocumentKind) {
  if (kind === 'cover') return fileReasons.coverOrIndex;
  if (kind === 'blank_form') return fileReasons.blankForm;
  if (kind === 'generic_text') return fileReasons.genericText;
  return fileReasons.noClientData;
}

export async function sortImport(deps: PipelineDeps, importId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'sorting') return;
  // Every file past preparing: a delivery that is retried sorts again what an earlier one began.
  const sortable = (await deps.store.listFiles(importId)).filter((file) =>
    sortedStates.has(file.state)
  );
  if (sortable.length === 0) throw new ImportFailure(importReasons.nothingPrepared);
  const loaded = await Promise.all(sortable.map((file) => loadPrepared(deps.objects, file)));
  const { provider, client } = await identityOf(deps, row);

  const textual = loaded.filter((entry) => entry.text.trim() !== '');
  const triages = new Map<string, FileTriage>();
  if (textual.length > 0) {
    const answer = await ask(deps, row, null, {
      model: sortingModel,
      messages: sortingMessages({
        provider,
        files: textual.map((entry) => ({ path: entry.file.upload_path, text: entry.text })),
      }),
      answer: sortingAnswer,
      reasoningEffort: 'low',
    });
    for (const triage of answer.files) triages.set(triage.path, triage);
  }
  const sorting = sortFiles(
    loaded.map((entry) => ({
      path: entry.file.upload_path,
      triage: triages.get(entry.file.upload_path) ?? null,
    })),
    { provider: { name: provider.name, cui: provider.cui || null }, client }
  );

  const byPath = new Map(loaded.map((entry) => [entry.file.upload_path, entry]));
  let characters = 0;
  let scannedPages = 0;
  let toRead = 0;
  const scans: string[] = [];
  for (const outcome of sorting.files) {
    const entry = byPath.get(outcome.path)!;
    const triage = triages.get(outcome.path);
    const patch: ImportFileUpdate = {
      ...fileCompany(triage),
      document_kind: triage?.kind ?? null,
      reason: null,
    };
    if (outcome.outcome === 'read') {
      const pages = entry.pages?.pages.filter((page) => page.isScan).length ?? 0;
      characters += entry.text.length;
      scannedPages += pages;
      toRead++;
      if (pages > 0) scans.push(entry.file.id);
      patch.state = pages > 0 ? 'prepared' : 'read';
    } else if (outcome.outcome === 'set_aside') {
      patch.state = 'set_aside';
      patch.reason =
        triage?.carriesClientData === false && !setAsideKinds.includes(outcome.kind)
          ? fileReasons.noClientData
          : setAsideReason(outcome.kind);
    } else if (outcome.outcome === 'employee_import') {
      patch.state = 'for_employees';
      patch.reason = fileReasons.trainingSheet;
    } else {
      const company = outcome.company;
      patch.state = 'other_company';
      patch.company_name = company.name?.slice(0, 200) ?? patch.company_name;
      patch.company_cui = company.cui ?? patch.company_cui;
      patch.reason = `Este despre altă firmă: ${company.name ?? `CUI ${company.cui}`}.`.slice(
        0,
        1000
      );
    }
    await deps.store.updateFile(entry.file.id, patch);
  }
  if (toRead === 0) throw new ImportFailure(importReasons.nothingToRead);
  if (characters > maxReadingCharacters) throw new ImportFailure(importReasons.tooMuchText);
  if (scannedPages > maxScannedPages) throw new ImportFailure(importReasons.tooManyScans);

  const companyName = sorting.company?.name?.trim().slice(0, 200) ?? null;
  await transition(
    deps,
    importId,
    'sorting',
    {
      status: 'reading',
      company_name: companyName && companyName.length >= 2 ? companyName : null,
      company_cui: sorting.company?.cui ?? null,
    },
    [
      ...scans.map((fileId): ImportMessage => ({ type: 'scan', importId, fileId })),
      { type: 'read', importId, waits: 0 },
    ]
  );
}

export async function scanFile(deps: PipelineDeps, importId: string, fileId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'reading') return;
  const file = (await deps.store.listFiles(importId)).find((each) => each.id === fileId);
  if (!file || file.state !== 'prepared') return;
  try {
    await deps.store.updateFile(file.id, await scan(deps, row, file));
  } catch (error) {
    if (!permanentFileFailure(error)) throw error;
    await deps.store.updateFile(file.id, { state: 'failed', reason: fileFailureReason(error) });
  }
}

async function scan(
  deps: PipelineDeps,
  row: ImportRow,
  file: ImportFileRow
): Promise<ImportFileUpdate> {
  const loaded = await loadPrepared(deps.objects, file);
  const prepared = loaded.pages!;
  const readings = { ...prepared.readings };
  const scanned = prepared.pages.filter((page) => page.isScan);
  const { provider, client } = await identityOf(deps, row);

  let original: Uint8Array | null = null;
  const image = async (page: number) => {
    if (heicTypes.has(file.mime_type)) {
      return { bytes: await deps.objects.read(file.derived_path!), type: 'image/jpeg' };
    }
    original ??= await deps.objects.read(file.storage_path);
    if (isImage(file)) return { bytes: original, type: file.mime_type };
    const jpeg = await requireExtractor(deps).pdfPageImage(arrayBuffer(original), page);
    return { bytes: new Uint8Array(jpeg), type: 'image/jpeg' };
  };

  let kind = file.document_kind as DocumentKind | null;
  if (kind === null && scanned.length === prepared.pages.length && scanned[0]) {
    const first = await image(scanned[0].number);
    const messages: ChatMessage[] = [
      { role: 'system', content: sortingSystemPrompt(provider) },
      {
        role: 'user',
        content: [
          { type: 'text', text: `=== FILE: ${file.upload_path} (image follows) ===` },
          { type: 'image_url', image_url: { url: dataUrl(first.bytes, first.type) } },
        ],
      },
    ];
    const triage = (
      await ask(deps, row, file.id, {
        model: sortingModel,
        messages,
        answer: sortingAnswer,
        reasoningEffort: 'low',
      })
    ).files[0];
    if (triage) {
      kind = triage.kind;
      if (triage.kind === 'training_sheet') {
        return { state: 'for_employees', document_kind: kind, reason: fileReasons.trainingSheet };
      }
      if (setAsideKinds.includes(triage.kind) || !triage.carriesClientData) {
        return {
          state: 'set_aside',
          document_kind: kind,
          reason: setAsideKinds.includes(triage.kind)
            ? setAsideReason(triage.kind)
            : fileReasons.noClientData,
        };
      }
    }
  }

  for (const page of scanned) {
    const label = pageLabel(file, page.number);
    if (readings[label]) continue;
    const picture = await image(page.number);
    readings[label] = await ask(deps, row, file.id, {
      model: readingModel,
      messages: readingMessages({
        provider,
        client,
        files: [{ path: label, imageUrl: dataUrl(picture.bytes, picture.type) }],
      }),
      answer: readingAnswer,
      reasoningEffort: 'medium',
    });
    // Kept page by page, so a delivery that is retried pays only for the pages left.
    await deps.objects.write(
      file.text_path!,
      encoder.encode(JSON.stringify({ ...prepared, readings })),
      'application/json'
    );
  }
  return { state: 'read', document_kind: kind, reason: null };
}

export async function readImport(deps: PipelineDeps, importId: string, waits: number) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'reading') return;
  const files = await deps.store.listFiles(importId);
  // The scans are read by messages of their own; this one comes back until they are done.
  if (files.some((file) => file.state === 'prepared')) {
    if (waits >= maxReadWaits) throw new ImportFailure(importReasons.scansUnfinished);
    await requireQueue(deps).send(
      { type: 'read', importId, waits: waits + 1 },
      { delaySeconds: readPollSeconds }
    );
    return;
  }
  const loaded = await Promise.all(
    files.filter((file) => file.state === 'read').map((file) => loadPrepared(deps.objects, file))
  );
  const textual = loaded.filter((entry) => entry.text.trim() !== '');
  const readings: Reading[] = [];
  if (textual.length > 0) {
    const { provider, client } = await identityOf(deps, row);
    readings.push(
      await ask(deps, row, null, {
        model: readingModel,
        messages: readingMessages({
          provider,
          client,
          files: textual.map((entry) => ({ path: entry.file.upload_path, text: entry.text })),
        }),
        answer: readingAnswer,
        reasoningEffort: 'medium',
      })
    );
  }
  for (const entry of loaded) readings.push(...Object.values(entry.pages?.readings ?? {}));
  if (readings.length === 0) throw new ImportFailure(importReasons.nothingToRead);
  await transition(
    deps,
    importId,
    'reading',
    { status: 'checking', proposal: asJson(toProposal(...readings)) },
    [{ type: 'check', importId }]
  );
}

export async function checkImport(deps: PipelineDeps, importId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'checking') return;
  const proposal = proposalSchema.parse(row.proposal);
  const files = (await deps.store.listFiles(importId)).filter((file) => file.state === 'read');
  const texts: Record<string, string | null> = {};
  for (const entry of await Promise.all(files.map((file) => loadPrepared(deps.objects, file)))) {
    if (!isImage(entry.file)) {
      texts[entry.file.upload_path] = entry.text.trim() === '' ? null : entry.text;
    }
    for (const page of entry.pages?.pages.filter((each) => each.isScan) ?? []) {
      texts[pageLabel(entry.file, page.number)] = null;
    }
  }
  const registrations = await lookUpRegistrations(proposal, deps.registry);
  const checked = withChecks(proposal, {
    files: texts,
    clientExists: row.into_existing_client,
    registrations,
  });
  const found = proposal.client.cui.options
    .map((option) => registrations.get(option.value))
    .find((company) => company) as CompanyLookup | undefined;
  const registeredCompany: RegisteredCompany | null = found
    ? {
        cui: found.cui,
        legalName: found.legalName,
        vatPayer: found.vatPayer,
        inactive: found.inactive,
      }
    : null;
  await deps.store.advance(importId, 'checking', {
    status: 'ready',
    proposal: asJson({ ...checked, registeredCompany }),
    ready_at: new Date().toISOString(),
  });
}

export async function copyFolder(deps: PipelineDeps, importId: string) {
  const row = await deps.store.getImport(importId);
  if (!row || row.status !== 'confirmed' || row.files_copied_at) return;
  for (const copy of await deps.store.folderCopies(importId)) {
    await deps.objects.copy(copy.source_path, copy.target_path, 'client-files');
  }
  await deps.store.markCopied(importId);
}

const permanentFileFailure = (error: unknown) => !isTransient(error);

export function isTransient(error: unknown) {
  if (error instanceof ImportFailure || error instanceof ModelAnswerError) return false;
  if (error instanceof DocxReadError || extractionRefusalOf(error) !== null) return false;
  if (error instanceof GatewayError) {
    return error.status === null || error.status === 429 || error.status >= 500;
  }
  if (error instanceof ApiError) return error.code === 'service_unavailable';
  if (error instanceof SyntaxError) return false;
  return true;
}

export function fileFailureReason(error: unknown): string {
  const refusal = extractionRefusalOf(error);
  if (refusal) return fileReasons[refusal];
  if (error instanceof DocxReadError) return fileReasons.corrupt;
  if (error instanceof ImportFailure) return error.reason;
  if (error instanceof ModelAnswerError) {
    return error.reason === 'refused' ? fileReasons.modelRefused : fileReasons.modelFailed;
  }
  return fileReasons.unavailable;
}

export function importFailureReason(error: unknown): string {
  if (error instanceof ImportFailure) return error.reason;
  if (error instanceof ModelAnswerError) {
    return error.reason === 'refused' ? importReasons.modelRefused : importReasons.modelFailed;
  }
  if (error instanceof GatewayError) return importReasons.unavailable;
  if (error instanceof ApiError && error.code === 'service_unavailable') {
    return importReasons.unavailable;
  }
  return importReasons.failed;
}

export function describe(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message.slice(0, 300)}` : 'unknown error';
}
