import { pdfConversionFailed } from '@ssm-usor/contracts';

import { callContainer, type Fetcher } from './container-call';

// On its own so it can be tested without a container: all it needs is something that
// answers requests.

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function convertDocx(
  fetcher: Fetcher,
  docx: ArrayBuffer,
  pauseMs = 2000
): Promise<ArrayBuffer> {
  return convertDocuments(fetcher, [docx], pauseMs);
}

/** One PDF of several Word files, in the order given: a document and its annexes. */
export async function convertDocuments(
  fetcher: Fetcher,
  files: ArrayBuffer[],
  pauseMs = 2000
): Promise<ArrayBuffer> {
  if (files.length === 0) throw new Error(pdfConversionFailed);
  return post(fetcher, '/forms/libreoffice/convert', converting(files, true), pauseMs);
}

/**
 * The signed sheet's PDF: its content controls as form fields, without PDF/A. LibreOffice tags
 * a PDF/A export, and the structure tree then references every field, so a validator counts each
 * later fill as an unexplained change to the certified revision (docs/pdf.md).
 */
export async function convertForm(
  fetcher: Fetcher,
  docx: ArrayBuffer,
  pauseMs = 2000
): Promise<ArrayBuffer> {
  return post(fetcher, '/forms/libreoffice/convert', converting([docx], false), pauseMs);
}

/** One PDF of several, in the order given, its fields flattened into the pages. */
export async function mergePdfs(
  fetcher: Fetcher,
  files: ArrayBuffer[],
  pauseMs = 2000
): Promise<ArrayBuffer> {
  if (files.length === 0) throw new Error(pdfConversionFailed);
  const form = new FormData();
  files.forEach((file, index) => {
    form.append('files', new Blob([file], { type: 'application/pdf' }), `${numbered(index)}.pdf`);
  });
  form.append('flatten', 'true');
  return post(fetcher, '/forms/pdfengines/merge', form, pauseMs);
}

// Gotenberg picks the converter by the file's extension and merges in the alphanumeric order of
// the names, so the names count from one with leading zeros.
const numbered = (index: number) => String(index + 1).padStart(4, '0');

function converting(files: ArrayBuffer[], archival: boolean): FormData {
  const form = new FormData();
  files.forEach((file, index) => {
    form.append('files', new Blob([file], { type: docxType }), `${numbered(index)}.docx`);
  });
  if (files.length > 1) form.append('merge', 'true');
  // Gotenberg's default, said out loud: a document's table of contents leaves the merge
  // without page numbers, and LibreOffice writes them in while it lays the pages out.
  form.append('updateIndexes', 'true');
  // The archival flavour: fonts embedded, nothing fetched from outside when it is opened,
  // which is what a copy kept as evidence, and later signed, should be.
  if (archival) form.append('pdfa', 'PDF/A-2b');
  return form;
}

function post(
  fetcher: Fetcher,
  route: string,
  form: FormData,
  pauseMs: number
): Promise<ArrayBuffer> {
  // No timer: Gotenberg bounds its own conversions (`--api-timeout` in the Dockerfile) and
  // answers 5xx when one runs out.
  return callContainer(fetcher, {
    // The host is ignored: the request goes to the container's port.
    request: () => new Request(`http://gotenberg${route}`, { method: 'POST', body: form }),
    read: readPdf,
    event: 'pdf_conversion',
    failed: pdfConversionFailed,
    pauseMs,
    collapseSecondFailure: true,
  });
}

async function readPdf(response: Response): Promise<ArrayBuffer> {
  const pdf = await response.arrayBuffer();
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') {
    console.error(JSON.stringify({ event: 'pdf_conversion_not_a_pdf', bytes: pdf.byteLength }));
    throw new Error(pdfConversionFailed);
  }
  return pdf;
}
