import { pdfConversionFailed } from '@ssm-usor/contracts';

// On its own so it can be tested without a container: all it needs is something that
// answers requests.

export type Fetcher = (request: Request) => Promise<Response>;

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * A container that was asleep sometimes fails its first start and comes up on the second,
 * so a failure that is not about the document is tried once more after a pause.
 */
export async function convertDocx(
  fetcher: Fetcher,
  docx: ArrayBuffer,
  pauseMs = 2000
): Promise<ArrayBuffer> {
  try {
    return await convertOnce(fetcher, docx);
  } catch (error) {
    if (!(error instanceof RetryableFailure)) throw error;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    try {
      return await convertOnce(fetcher, docx);
    } catch {
      throw new Error(pdfConversionFailed);
    }
  }
}

class RetryableFailure extends Error {}

async function convertOnce(fetcher: Fetcher, docx: ArrayBuffer): Promise<ArrayBuffer> {
  const form = new FormData();
  // Gotenberg picks the converter by the file's extension; the name is never seen again.
  form.append('files', new Blob([docx], { type: docxType }), 'document.docx');
  // The archival flavour: fonts embedded, nothing fetched from outside when it is opened,
  // which is what a copy kept as evidence, and later signed, should be.
  form.append('pdfa', 'PDF/A-2b');

  let response: Response;
  try {
    // The host is ignored: the request goes to the container's port.
    response = await fetcher(
      new Request('http://gotenberg/forms/libreoffice/convert', { method: 'POST', body: form })
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
