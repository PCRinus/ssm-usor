import type { BeginSignatureOptions, SignerService } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { ApiEnv } from './env';
import { adminFileStore } from './files';
import { createPdfConverter, type PdfConverter } from './pdf';
import { createSigner } from './signer';

export type PdfSigningFiles = {
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

const signedOnFormat = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function signedOn(moment: Date) {
  return signedOnFormat.format(moment);
}

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

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
  const begun = await signer.beginSignature(buffer(pdf), {
    ...begin,
    signedAt: signedAt.toISOString(),
    appearanceLines: [name, 'semnat electronic', signedOn(signedAt)],
  });
  const signature = await sign(begun.toSign, begun.prepared);
  return new Uint8Array(
    await signer.finishSignature(begun.prepared, begun.sessionToken, signature)
  );
}
