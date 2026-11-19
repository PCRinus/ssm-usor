import type { BeginSignatureOptions, SignerService } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { ApiEnv } from './env';
import type { ApiError } from './errors';
import { adminFileStore } from './files';
import { sha256 } from './hash';
import { createPdfConverter, type PdfConverter } from './pdf';
import { printedDay } from './romanian';
import { createSigner } from './signer';

type PdfSigningFiles = {
  readTemplate(path: string): Promise<Uint8Array>;
  readDocument(path: string): Promise<Uint8Array>;
  writeDocument(path: string, bytes: Uint8Array, options: { replace: boolean }): Promise<void>;
  removeDocument(path: string): Promise<void>;
};

export type PdfSigningServices = {
  files: PdfSigningFiles;
  pdf: PdfConverter | null;
  signer: SignerService | null;
  now(): Date;
};

/**
 * Everything with the secret key: the signing flow has checked who may act before calling. No
 * request signal: a signature the signer has put on a file must reach its evidence even when the
 * caller has gone.
 */
export function pdfSigningServices(c: Context<ApiEnv>): PdfSigningServices {
  return {
    files: adminFileStore(c.env),
    pdf: createPdfConverter(c),
    signer: createSigner(c),
    now: () => new Date(),
  };
}

// A copy with a plain ArrayBuffer behind it, which is what the signer is typed to take.
export const arrayBufferOf = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

/**
 * The box prints the name, "semnat electronic" and the day alone: what the signer signs as is
 * printed beside it, and a longer line would shrink the whole appearance.
 */
export async function signField(
  signer: SignerService,
  pdf: Uint8Array,
  options: Omit<BeginSignatureOptions, 'signedAt' | 'appearanceLines'> & {
    signedAt: Date;
    name: string;
  },
  sign: (toSign: ArrayBuffer, prepared: ArrayBuffer) => Promise<ArrayBuffer>
) {
  const { signedAt, name, ...begin } = options;
  const begun = await signer.beginSignature(arrayBufferOf(pdf), {
    ...begin,
    signedAt: signedAt.toISOString(),
    appearanceLines: [name, 'semnat electronic', printedDay(signedAt)],
  });
  const signature = await sign(begun.toSign, begun.prepared);
  return new Uint8Array(
    await signer.finishSignature(begun.prepared, begun.sessionToken, signature)
  );
}

/**
 * Writes to one signed file are serialized by its version: each makes the next version from the
 * current bytes, checked against their digest, and moves the row on only if nobody else did
 * first, and the loser tries once more. Not a Postgres advisory lock: a write spans calls to the
 * signer, and PostgREST holds no transaction across requests. A version gets a path of its own,
 * so a write that loses the race never overwrites the bytes the row points to, and every version
 * stays for the evidence's digests.
 */
export async function rewriteVersioned<
  Row extends { digest: string },
  Next extends { bytes: Uint8Array },
>(
  files: Pick<PdfSigningFiles, 'readDocument' | 'writeDocument' | 'removeDocument'>,
  steps: {
    read(): Promise<Row>;
    pathOf(row: Row): string;
    nextPathOf(row: Row): string;
    unverified(row: Row): ApiError;
    rewrite(row: Row, bytes: Uint8Array): Promise<Next>;
    /** The row moved on, or null when another write moved it first. */
    advance(row: Row, next: Next, change: { path: string; digest: string }): Promise<Row | null>;
    busy(): ApiError;
  }
): Promise<{ before: Row; after: Row }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await steps.read();
    const bytes = await files.readDocument(steps.pathOf(row));
    if ((await sha256(bytes)) !== row.digest) throw steps.unverified(row);
    const next = await steps.rewrite(row, bytes);
    const path = steps.nextPathOf(row);
    await files.writeDocument(path, next.bytes, { replace: false });
    const after = await steps.advance(row, next, { path, digest: await sha256(next.bytes) });
    if (after) return { before: row, after };
    // An orphaned version costs storage, not correctness: no row points at it.
    await files.removeDocument(path).catch(() => undefined);
  }
  throw steps.busy();
}
