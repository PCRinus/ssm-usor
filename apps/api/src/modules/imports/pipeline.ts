import {
  type CompanyLookup,
  extractionFailed,
  extractionRefusalOf,
  type ExtractorService,
  type ImportKind,
  type ImportLibraryPart,
  importLimits,
} from '@ssm-usor/contracts';
import {
  type CompletionRequest,
  DocxReadError,
  employeeImportProposalSchema,
  type ExistingClient,
  GatewayError,
  ModelAnswerError,
  type ModelClient,
  proposalSchema,
  type ProviderIdentity,
} from '@ssm-usor/import';

import type { AlertSender } from '../../lib/alerts';
import type { ImportMessage, ImportQueue } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { importEnded } from './import-alerts';
import { clientReadingFlags, employeeReadingFlags } from './reading-flags';
import type { ImportRecords } from './records';
import {
  asJson,
  type ImportFileRow,
  ImportLimitError,
  type ImportRow,
  type ImportStatus,
  type ImportStep,
  type ImportStore,
  type ImportUpdate,
} from './store';

export interface ImportObjects {
  read(path: string): Promise<Uint8Array>;
  write(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  // False when an object is at the path already.
  create(path: string, bytes: Uint8Array, contentType: string): Promise<boolean>;
  list(folder: string): Promise<string[]>;
  copy(from: string, to: string, bucket: 'imports' | 'client-files'): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export interface ImportCopyObjects {
  // Every object under the folder, in its subfolders too, by its full path.
  list(folder: string): Promise<string[]>;
  remove(paths: string[]): Promise<void>;
  // From the `imports` bucket, by Storage's own copy; an object already there counts as copied.
  copyIn(from: string, to: string): Promise<void>;
  write(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

export interface PipelineDeps {
  store: ImportStore;
  objects: ImportObjects;
  copies: ImportCopyObjects;
  extractor: ExtractorService | null;
  model: ModelClient | null;
  // ANAF; it throws when ANAF cannot answer.
  registry: { lookup(cui: string): Promise<CompanyLookup | null> };
  queue: ImportQueue | null;
  records: ImportRecords;
  alerts: AlertSender;
}

// The documents go to the reading model in one request, so this bounds that request's cost and
// size: about 185,000 tokens at the 3.25 characters a token measured on the reference packs.
export const maxReadingCharacters = 600_000;
// The reading's is the one the evaluation used.
export const sortingOutputTokens = 16_000;
export const readingOutputTokens = 64_000;
// One sheet page answers in a few thousand tokens, reasoning included.
export const sheetOutputTokens = 16_000;
// About a hundred seconds of reading, well inside a consumer's 15 minutes of wall time.
export const scanBatchPages = 5;
export const readPollSeconds = 10;
// Half an hour without a scanned page read, past which the scans are taken as lost.
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
  sizeMismatch: 'Fișierul primit nu are mărimea anunțată la încărcare.',
  stopped: 'Citirea fișierului s-a oprit din cauza unei erori.',
  timeout: 'Citirea fișierului a durat prea mult.',
  page_out_of_range: 'O pagină a fișierului nu se poate citi.',
  unavailable: 'Fișierul nu a putut fi citit: serviciul de citire nu a răspuns.',
  modelRefused: 'Modelul a refuzat să citească fișierul.',
  modelFailed: 'Modelul nu a dat un răspuns pe care să-l putem folosi pentru acest fișier.',
  coverOrIndex: 'Copertă, etichetă sau cuprins: nu conține date despre client.',
  blankForm: 'Formular sau registru necompletat.',
  genericText: 'Text general, fără date despre client.',
  ownInstructions: 'Instrucțiuni proprii: le citim pentru biblioteca ta de instrucțiuni proprii.',
  trainingMaterial:
    'Material de instruire introductiv-generală: text general, nu conține date despre client. Îl citim doar dacă ceri.',
  noClientData: 'Nu conține date despre client.',
  trainingSheet: 'Fișă de instruire individuală: rămâne pentru importul lucrătorilor.',
  notASheet:
    'Nu este o fotografie sau un PDF: importul lucrătorilor citește doar fișele fotografiate sau scanate.',
} as const;

export const importReasons = {
  nothingPrepared: 'Niciun fișier nu a putut fi citit.',
  nothingToRead: 'Niciun document nu conține date despre client.',
  noSheets: 'Niciun fișier nu este o fotografie sau un PDF al unei fișe.',
  noSheetRead: 'Nicio fotografie și nicio pagină nu a putut fi citită.',
  tooManyScans: {
    client:
      'Sunt prea multe pagini scanate pentru un singur import: cel mult 150. Scoate o parte dintre fișierele scanate.',
    employees:
      'Sunt prea multe fotografii și pagini scanate pentru un singur import: cel mult 500. Împarte fișele în mai multe importuri.',
  },
  scansUnfinished: 'Citirea fișierelor scanate nu s-a terminat.',
  unavailable: 'Serviciul care citește documentele nu a răspuns.',
  notConfigured: 'Importul din documente nu este disponibil acum.',
  modelRefused: 'Modelul a refuzat să citească documentele.',
  modelFailed: 'Modelul nu a dat un răspuns pe care să-l putem folosi.',
  failed: 'Importul s-a oprit din cauza unei erori.',
  overLimits: {
    client:
      'Fișierele depășesc limitele unui import: cel mult 150 de fișiere și 100 MiB, fiecare fișier de cel mult 20 MiB.',
    employees:
      'Fișierele depășesc limitele unui import de lucrători: cel mult 500 de fișiere și 1 GiB, fiecare fișier de cel mult 25 MiB.',
  },
  creditsShort:
    'Fișierele au mai multe pagini decât s-au numărat la încărcare, iar creditele AI rămase nu ajung pentru toate.',
  stalled: 'Importul s-a oprit înainte să se termine.',
  left: 'Importul a rămas neterminat 14 zile.',
} as const;

export interface TextOfFile {
  name: string;
  characters: number;
}

const percent = (part: number, whole: number) => Math.max(1, Math.round((part / whole) * 100));

const quotedName = (name: string) => `„${name.length > 60 ? `${name.slice(0, 59)}…` : name}”`;

export const characterCount = (files: TextOfFile[]) =>
  files.reduce((sum, file) => sum + file.characters, 0);

/** Why the files' text does not fit one reading, naming the longest; null when it does. */
export function tooMuchText(files: TextOfFile[]): string | null {
  const total = characterCount(files);
  if (total <= maxReadingCharacters) return null;
  const excess = Math.max(
    1,
    Math.ceil(((total - maxReadingCharacters) / maxReadingCharacters) * 100)
  );
  const over = `Documentele au cu ${excess}% mai mult text decât încape într-un import.`;
  const longest = [...files].sort((a, b) => b.characters - a.characters).slice(0, 3);
  if (longest.length === 1) return `${over} Tot textul este în ${quotedName(longest[0]!.name)}.`;
  const named = longest.map(
    (file, index) =>
      `${quotedName(file.name)} (${percent(file.characters, total)}%${index === 0 ? ' din text' : ''})`
  );
  return `${over} Cele mai lungi: ${named.slice(0, -1).join(', ')} și ${named.at(-1)}. Scoate-le pe cele care nu trebuie citite.`;
}

export interface FileToRead extends TextOfFile {
  scannedPages: number;
}

export type ReadingCapBreach = { cap: 'text'; reason: string } | { cap: 'scans' };

export function readingCapBreach(files: FileToRead[], kind: ImportKind): ReadingCapBreach | null {
  const overText = tooMuchText(files);
  if (overText) return { cap: 'text', reason: overText };
  const scanned = files.reduce((sum, file) => sum + file.scannedPages, 0);
  return scanned > importLimits[kind].scannedPages ? { cap: 'scans' } : null;
}

export function requireQueue(deps: PipelineDeps) {
  if (!deps.queue) throw new ImportFailure(importReasons.notConfigured);
  return deps.queue;
}

export interface ModelUsage {
  input: number;
  cachedInput: number;
  output: number;
}

export interface Meter {
  // Named in the log when the usage is not recorded: "import …".
  subject: string;
  record(usage: ModelUsage, cost: number): Promise<void>;
  part?: ImportLibraryPart;
}

export async function meteredCompletion<T>(
  deps: PipelineDeps,
  row: ImportRow,
  meter: Meter,
  request: Omit<CompletionRequest<T>, 'metadata'>
): Promise<T> {
  if (!deps.model) throw new ImportFailure(importReasons.notConfigured);
  const record = async (usage: ModelUsage, cost: number) => {
    if (usage.input + usage.cachedInput + usage.output === 0) return;
    // Paying for a request twice is worse than a missing count, so a failure here is not retried.
    await meter
      .record(usage, cost)
      .catch((error: unknown) =>
        console.error(`Usage of ${meter.subject} was not recorded: ${describe(error)}`)
      );
  };
  try {
    const completion = await deps.model.complete({
      ...request,
      metadata: {
        organizationId: row.organization_id,
        importId: row.id,
        ...(meter.part ? { part: meter.part } : {}),
      },
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

export const ask = <T>(
  deps: PipelineDeps,
  row: ImportRow,
  fileId: string | null,
  step: ImportStep,
  request: Omit<CompletionRequest<T>, 'metadata'>
) =>
  meteredCompletion(
    deps,
    row,
    {
      subject: `import ${row.id}`,
      record: (usage, cost) => deps.store.recordUsage(row.id, fileId, step, usage, cost),
    },
    request
  );

export async function identityOf(deps: PipelineDeps, row: ImportRow) {
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
export async function transition(
  deps: PipelineDeps,
  importId: string,
  from: ImportStatus,
  patch: ImportUpdate & { status: ImportStatus },
  messages: ImportMessage[]
) {
  const queue = messages.length > 0 ? requireQueue(deps) : null;
  if (!(await deps.store.advance(importId, from, patch))) return false;
  if (!queue) return true;
  try {
    await sendAll(queue, messages);
    return true;
  } catch (error) {
    await deps.store
      .advance(importId, patch.status, { status: from })
      .catch((undo: unknown) =>
        console.error(`Import ${importId} stays at ${patch.status} unsent: ${describe(undo)}`)
      );
    throw error;
  }
}

const failedPatch = (reason: string): ImportUpdate & { status: 'failed' } => ({
  status: 'failed',
  failure_reason: reason,
  failed_at: new Date().toISOString(),
});

function readingFlagsOf(row: ImportRow, files: ImportFileRow[]) {
  if (row.kind === 'employees') {
    const proposal = employeeImportProposalSchema.safeParse(row.proposal);
    return employeeReadingFlags(files, proposal.success ? proposal.data : null);
  }
  const proposal = proposalSchema.safeParse(row.proposal);
  return clientReadingFlags(files, proposal.success ? proposal.data : null);
}

export async function failImport(
  deps: PipelineDeps,
  importId: string,
  from: ImportStatus,
  reason: string
) {
  const row = await deps.store.getImport(importId);
  const flags = row ? readingFlagsOf(row, await deps.store.listFiles(importId)) : null;
  const failed = await deps.store.advance(importId, from, {
    ...failedPatch(reason),
    ...(flags ? { reading_flags: asJson(flags) } : {}),
  });
  if (failed) await importEnded(deps, importId, null, ['read', 'ended']);
  return failed;
}

export const permanentFileFailure = (error: unknown) => !isTransient(error);

/**
 * The extractor answered nothing usable: it was busy with other files, unreachable or slow, which
 * apps/pdf has already tried once more. A refusal names its reason and is not this.
 */
export const isExtractorUnavailable = (error: unknown) =>
  error instanceof Error && error.message === extractionFailed;

export function isTransient(error: unknown) {
  if (error instanceof ImportFailure || error instanceof ModelAnswerError) return false;
  if (error instanceof ImportLimitError) return false;
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

export interface FailureReasons {
  modelRefused: string;
  modelFailed: string;
  failed: string;
}

export function failureReasonOf(reasons: FailureReasons, error: unknown): string {
  if (error instanceof ImportFailure) return error.reason;
  if (error instanceof ModelAnswerError) {
    return error.reason === 'refused' ? reasons.modelRefused : reasons.modelFailed;
  }
  if (error instanceof GatewayError) return importReasons.unavailable;
  return reasons.failed;
}

export function importFailureReason(error: unknown): string {
  if (error instanceof ApiError && error.code === 'service_unavailable') {
    return importReasons.unavailable;
  }
  return failureReasonOf(importReasons, error);
}

export function describe(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message.slice(0, 300)}` : 'unknown error';
}
