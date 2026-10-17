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

export type PdfConverter = {
  convertDocx: (docx: Uint8Array) => Promise<Uint8Array>;
  /** One PDF of a document and the files it annexes, in the order given (ADR 012). */
  convertDocuments: (files: Uint8Array[]) => Promise<Uint8Array>;
  /** The signed sheet's form, without PDF/A (PdfService.convertForm says why). */
  convertForm: (docx: Uint8Array) => Promise<Uint8Array>;
  /** One PDF of several, their fields flattened: a view, whose signatures no longer verify. */
  mergePdfs: (files: Uint8Array[]) => Promise<Uint8Array>;
};

const unavailable = () =>
  new ApiError(
    'service_unavailable',
    'The PDF could not be made. Nothing was issued; try again in a moment.',
    undefined,
    'pdf_unavailable'
  );

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Conversion = 'archival' | 'form' | 'merge';

/** The same requests apps/pdf sends, for a Gotenberg reached by URL. */
async function convertAt(url: string, files: Uint8Array[], conversion: Conversion) {
  const merging = conversion === 'merge';
  const form = new FormData();
  files.forEach((file, index) => {
    // Gotenberg merges in the alphanumeric order of the names.
    const name = `${String(index + 1).padStart(4, '0')}.${merging ? 'pdf' : 'docx'}`;
    const type = merging ? 'application/pdf' : docxType;
    form.append('files', new Blob([new Uint8Array(file)], { type }), name);
  });
  if (merging) form.append('flatten', 'true');
  else if (files.length > 1) form.append('merge', 'true');
  if (conversion === 'archival') form.append('pdfa', 'PDF/A-2b');
  const route = merging ? '/forms/pdfengines/merge' : '/forms/libreoffice/convert';
  const response = await fetch(new URL(route, url), {
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
  async function convert(files: Uint8Array[], conversion: Conversion = 'archival') {
    try {
      // Copies with a plain ArrayBuffer behind them, which is what crosses the binding.
      const buffers = files.map((file) => new Uint8Array(file).buffer);
      const pdf = GOTENBERG_URL
        ? await convertAt(GOTENBERG_URL, files, conversion)
        : conversion === 'form'
          ? await PDF!.convertForm(buffers[0]!)
          : conversion === 'merge'
            ? await PDF!.mergePdfs(buffers)
            : files.length === 1
              ? await PDF!.convertDocx(buffers[0]!)
              : await PDF!.convertDocuments(buffers);
      return new Uint8Array(pdf);
    } catch (error) {
      // apps/pdf has logged why; here it is enough to know that it was the conversion.
      const known = error instanceof Error && error.message.includes(pdfConversionFailed);
      console.error(`PDF conversion failed${known ? '' : `: ${String(error)}`}`);
      throw unavailable();
    }
  }
  return {
    convertDocx: (docx) => convert([docx]),
    convertDocuments: (files) => convert(files),
    convertForm: (docx) => convert([docx], 'form'),
    mergePdfs: (files) => convert(files, 'merge'),
  };
}

export function requirePdfConverter(c: Context<ApiEnv>): PdfConverter {
  const converter = createPdfConverter(c);
  if (!converter) throw unavailable();
  return converter;
}
