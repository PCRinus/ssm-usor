import { pdfConversionFailed } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { ApiEnv } from './env';
import { ApiError } from './errors';

// Word to PDF happens outside this Worker (docs/pdf.md). Deployed, that is apps/pdf behind a
// service binding, switched on by `PDF_CONVERSION=service`, which only the deployment sets:
// under `wrangler dev` the binding exists too, but nothing answers it, because apps/pdf is
// not part of `pnpm dev` (it needs Docker). `GOTENBERG_URL` points at a Gotenberg started by
// hand instead, for local development and the flow tests. With neither, there is no
// converter, and documents are issued without a PDF rather than not at all.

export type PdfConverter = { convertDocx: (docx: Uint8Array) => Promise<Uint8Array> };

const unavailable = () =>
  new ApiError(
    'service_unavailable',
    'The PDF could not be made. Nothing was issued; try again in a moment.',
    undefined,
    'pdf_unavailable'
  );

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The same request apps/pdf sends, for a Gotenberg reached by URL. */
async function convertAt(url: string, docx: Uint8Array) {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)], { type: docxType }), 'document.docx');
  form.append('pdfa', 'PDF/A-2b');
  const response = await fetch(new URL('/forms/libreoffice/convert', url), {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Gotenberg answered ${response.status}.`);
  return response.arrayBuffer();
}

export function createPdfConverter(c: Context<ApiEnv>): PdfConverter | null {
  const { GOTENBERG_URL } = c.env;
  const PDF = c.env.PDF_CONVERSION === 'service' ? c.env.PDF : undefined;
  if (!PDF && !GOTENBERG_URL) return null;
  return {
    async convertDocx(docx) {
      try {
        const pdf = GOTENBERG_URL
          ? await convertAt(GOTENBERG_URL, docx)
          : // A copy with a plain ArrayBuffer behind it, which is what crosses the binding.
            await PDF!.convertDocx(new Uint8Array(docx).buffer);
        return new Uint8Array(pdf);
      } catch (error) {
        // apps/pdf has logged why; here it is enough to know that it was the conversion.
        const known = error instanceof Error && error.message.includes(pdfConversionFailed);
        console.error(`PDF conversion failed${known ? '' : `: ${String(error)}`}`);
        throw unavailable();
      }
    },
  };
}
