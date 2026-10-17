import type { TrainingDomain } from '@ssm-usor/contracts';

import { ApiError } from '../../lib/errors';
import type { PdfConverter } from '../../lib/pdf';
import type { SignedSheetStore } from './store';

/**
 * A single sheet comes as stored, its signatures verifiable; several are merged into a flattened
 * copy to read, whose signatures no longer verify, the originals staying in storage.
 */
export async function currentSheetPdf(
  ctx: {
    store: Pick<SignedSheetStore, 'sheets'>;
    files: { readDocument(path: string): Promise<Uint8Array> };
    pdf: PdfConverter | null;
  },
  employeeId: string,
  domain: TrainingDomain,
  options: { clientId?: string } = {}
): Promise<Uint8Array | null> {
  const sheets = await ctx.store.sheets(employeeId, domain, options.clientId);
  if (sheets.length === 0) return null;
  const files = await Promise.all(sheets.map((sheet) => ctx.files.readDocument(sheet.storagePath)));
  if (files.length === 1) return files[0]!;
  if (!ctx.pdf) {
    throw new ApiError(
      'service_unavailable',
      'The PDF could not be made. Try again in a moment.',
      undefined,
      'pdf_unavailable'
    );
  }
  return ctx.pdf.mergePdfs(files);
}
