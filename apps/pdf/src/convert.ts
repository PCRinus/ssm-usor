import { pdfConversionFailed } from '@ssm-usor/contracts';

// On its own so it can be tested without a container: all it needs is something that
// answers requests.

export type Fetcher = (request: Request) => Promise<Response>;

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * A container that was asleep sometimes fails its first start and comes up on the second,
 * so a failure that is not about the document is tried once more after a pause.
 */
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
  return withRetry(() => convertOnce(fetcher, files, true), pauseMs);
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
  return withRetry(() => convertOnce(fetcher, [docx], false), pauseMs);
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
  return withRetry(() => post(fetcher, '/forms/pdfengines/merge', form), pauseMs);
}

async function withRetry(
  attempt: () => Promise<ArrayBuffer>,
  pauseMs: number
): Promise<ArrayBuffer> {
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof RetryableFailure)) throw error;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    try {
      return await attempt();
    } catch {
      throw new Error(pdfConversionFailed);
    }
  }
}

class RetryableFailure extends Error {}

// Gotenberg picks the converter by the file's extension and merges in the alphanumeric order of
// the names, so the names count from one with leading zeros.
const numbered = (index: number) => String(index + 1).padStart(4, '0');

function convertOnce(
  fetcher: Fetcher,
  files: ArrayBuffer[],
  archival: boolean
): Promise<ArrayBuffer> {
  const form = new FormData();
  files.forEach((file, index) => {
    form.append('files', new Blob([file], { type: docxType }), `${numbered(index)}.docx`);
  });
  if (files.length > 1) form.append('merge', 'true');
  // The archival flavour: fonts embedded, nothing fetched from outside when it is opened,
  // which is what a copy kept as evidence, and later signed, should be.
  if (archival) form.append('pdfa', 'PDF/A-2b');
  return post(fetcher, '/forms/libreoffice/convert', form);
}

async function post(fetcher: Fetcher, route: string, form: FormData): Promise<ArrayBuffer> {
  let response: Response;
  try {
    // The host is ignored: the request goes to the container's port.
    response = await fetcher(
      new Request(`http://gotenberg${route}`, { method: 'POST', body: form })
    );
  } catch (cause) {
    console.error(JSON.stringify({ event: 'pdf_conversion_unreachable', cause: String(cause) }));
    throw new RetryableFailure(pdfConversionFailed);
  }
  if (!response.ok) {
    // Gotenberg says why in plain text: a corrupt file, a timeout.
    const detail = (await response.text()).slice(0, 500);
    console.error(
      JSON.stringify({ event: 'pdf_conversion_refused', status: response.status, detail })
    );
    // 4xx is Gotenberg about the file; anything else is the container or the service.
    if (response.status >= 500) throw new RetryableFailure(pdfConversionFailed);
    throw new Error(pdfConversionFailed);
  }
  const pdf = await response.arrayBuffer();
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') {
    console.error(JSON.stringify({ event: 'pdf_conversion_not_a_pdf', bytes: pdf.byteLength }));
    throw new Error(pdfConversionFailed);
  }
  return pdf;
}
