import { importErrorReasons } from '@ssm-usor/contracts';

import type { ApiErrorResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { roCount } from '@/features/employees/employee-format';

export { formatFileSize } from '@/features/client-files/client-file-format';

export const filesLabel = (count: number) =>
  count === 1 ? 'un fișier' : roCount(count, '', 'fișiere');

export const photosLabel = (count: number) =>
  count === 1 ? 'o fotografie' : roCount(count, '', 'fotografii');

export const pagesLabel = (count: number) =>
  count === 1 ? 'o pagină' : roCount(count, '', 'pagini');

export const documentsLabel = (count: number) =>
  count === 1 ? 'un document' : roCount(count, '', 'documente');

export const documentKindLabels: Record<string, string> = {
  decision: 'Decizie',
  own_instructions: 'Instrucțiuni proprii',
  training_themes: 'Tematică de instruire',
  training_material: 'Material de instruire',
  risk_assessment: 'Evaluare de riscuri',
  fire_safety_document: 'Document PSI',
  contract: 'Contract',
  training_sheet: 'Fișă de instruire',
  blank_form: 'Formular necompletat',
  cover: 'Copertă',
  generic_text: 'Text general',
  other: 'Alt document',
};

const reasonMessages: Record<string, string> = {
  [importErrorReasons.unavailable]:
    'Importul din documente nu este disponibil acum. Încearcă din nou mai târziu.',
  [importErrorReasons.notUploading]: 'Citirea acestui import a început deja.',
  [importErrorReasons.tooLarge]: 'Un import ia cel mult 150 de fișiere și 100 MB în total.',
  [importErrorReasons.empty]: 'Niciun fișier nu a ajuns. Încearcă din nou.',
  [importErrorReasons.notReady]: 'Propunerea nu mai este gata de verificat. Reîncarcă pagina.',
  [importErrorReasons.changed]:
    'Altcineva a modificat propunerea între timp. Reîncarcă pagina ca să vezi ce s-a schimbat.',
  [importErrorReasons.ended]: 'Importul a fost deja confirmat sau abandonat.',
  [importErrorReasons.alreadySplit]: 'Aceste fișiere au fost deja trimise într-un import separat.',
  [importErrorReasons.tooMuchText]:
    'Cu acest fișier, documentele au prea mult text pentru un singur import.',
  [importErrorReasons.tooManyScans]:
    'Cu acest fișier, sunt prea multe pagini scanate pentru un singur import: cel mult 150.',
};

export const importErrorReason = (cause: unknown) =>
  cause instanceof ApiHttpError
    ? (cause.body as Partial<ApiErrorResponse> | undefined)?.reason
    : undefined;

export function importErrorMessage(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiHttpError)) return fallback;
  const reason = importErrorReason(cause);
  if (reason && Object.hasOwn(reasonMessages, reason)) return reasonMessages[reason]!;
  if (cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  if (cause.status === 404) return 'Importul nu mai există.';
  return fallback;
}

export const importRunningStatuses = ['preparing', 'sorting', 'reading', 'checking'] as const;

export const isRunning = (status: string) =>
  (importRunningStatuses as readonly string[]).includes(status);

// The files go up from the browser that chose them, so an import still uploading this long
// after it was created has lost that browser and will not start by itself.
export const uploadStallMs = 15 * 60_000;

type Uploading = { status: string; createdAt: string };

export const uploadStallsAt = (detail: Uploading) => Date.parse(detail.createdAt) + uploadStallMs;

export const isUploadUnderway = (detail: Uploading, now = Date.now()) =>
  detail.status === 'uploading' && now < uploadStallsAt(detail);

export const isUploadStalled = (detail: Uploading, now = Date.now()) =>
  detail.status === 'uploading' && now >= uploadStallsAt(detail);

// Company names often end in "S.R.L.", whose period closes the sentence too.
export const endSentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

function joinRo(parts: string[]) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} și ${parts.at(-1)}`;
}

type UploadedFile = { uploadPath: string; mimeType: string };

export function uploadSummary(files: UploadedFile[]) {
  const folders: string[] = [];
  let pdfs = 0;
  let words = 0;
  let photos = 0;
  for (const file of files) {
    const slash = file.uploadPath.indexOf('/');
    if (slash !== -1) {
      const folder = file.uploadPath.slice(0, slash);
      if (!folders.includes(folder)) folders.push(folder);
    } else if (file.mimeType === 'application/pdf') pdfs += 1;
    else if (file.mimeType.startsWith('image/')) photos += 1;
    else words += 1;
  }
  const parts = folders.map((folder) =>
    folder.toLowerCase().endsWith('.zip') ? folder : `folderul ${folder}`
  );
  if (pdfs > 0) parts.push(pdfs === 1 ? 'un PDF' : roCount(pdfs, '', 'PDF-uri'));
  if (words > 0)
    parts.push(words === 1 ? 'un document Word' : `${roCount(words, '', 'documente')} Word`);
  if (photos > 0) parts.push(photosLabel(photos));
  return joinRo(parts);
}

export function uploadName(files: UploadedFile[]) {
  const tops = new Set(files.map((file) => file.uploadPath.split('/')[0]!));
  if (tops.size === 1) return [...tops][0]!;
  return `Import din ${filesLabel(files.length)}`;
}

const timeFormat = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function uploadedWhen(iso: string, now = new Date()) {
  const date = new Date(iso);
  const time = timeFormat.format(date);
  return date.toDateString() === now.toDateString()
    ? `azi la ${time}`
    : `pe ${dayFormat.format(date)} la ${time}`;
}
