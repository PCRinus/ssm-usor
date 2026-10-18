import type { SignerService, TrainingDomain } from '@ssm-usor/contracts';

import { ApiError } from '../../lib/errors';
import type { PdfConverter } from '../../lib/pdf';
import type { SignedSheetStore } from './store';

/** The line on every page of a merged copy, whose signatures no longer verify. */
export const sheetCopyText = 'Copie de citire – semnăturile se verifică pe fișele originale';

export type CurrentSheet = {
  pdf: Uint8Array;
  /** A merged copy to read, not a signed original. */
  copy: boolean;
  sequence: number | null;
};

const unavailable = (reason: 'pdf_unavailable' | 'signer_unavailable') =>
  new ApiError(
    'service_unavailable',
    'The PDF could not be made. Try again in a moment.',
    undefined,
    reason
  );

/**
 * A sheet as stored, its signatures verifiable: the one of `sequence`, or the only one. Several
 * without a `sequence` are merged into a flattened copy, stamped on every page as a copy to read,
 * the originals staying in storage and served one by one.
 */
export async function currentSheetPdf(
  ctx: {
    store: Pick<SignedSheetStore, 'sheets'>;
    files: { readDocument(path: string): Promise<Uint8Array> };
    pdf: PdfConverter | null;
    signer: Pick<SignerService, 'stampPages'> | null;
  },
  employeeId: string,
  domain: TrainingDomain,
  options: { clientId?: string; sequence?: number } = {}
): Promise<CurrentSheet | null> {
  const sheets = await ctx.store.sheets(employeeId, domain, options.clientId);
  if (sheets.length === 0) return null;
  if (options.sequence !== undefined) {
    const sheet = sheets.find((each) => each.sequence === options.sequence);
    if (!sheet) throw new ApiError('not_found', 'The employee has no signed sheet of this number.');
    return {
      pdf: await ctx.files.readDocument(sheet.storagePath),
      copy: false,
      sequence: sheet.sequence,
    };
  }
  const files = await Promise.all(sheets.map((sheet) => ctx.files.readDocument(sheet.storagePath)));
  if (files.length === 1) return { pdf: files[0]!, copy: false, sequence: sheets[0]!.sequence };
  if (!ctx.pdf) throw unavailable('pdf_unavailable');
  if (!ctx.signer) throw unavailable('signer_unavailable');
  const merged = await ctx.pdf.mergePdfs(files);
  const stamped = await ctx.signer.stampPages(new Uint8Array(merged).buffer, sheetCopyText);
  return { pdf: new Uint8Array(stamped), copy: true, sequence: null };
}
