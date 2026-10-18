// What apps/pdf offers other Workers over its service binding for signing (ADR 023): the
// routes of the signer container, pyHanko behind a small HTTP service, as one interface.
// Signing is two-phase so that a signer's private key never leaves the API Worker.

/**
 * `message` of the error every method rejects with when the signer service fails. When the service
 * refused the request (a 4xx), the message carries its code after a colon, as `signerRefused`
 * writes it: `signer_failed:locked_field`. A service that could not be reached, timed out, failed
 * in itself or answered something unexpected gives `signer_failed` alone.
 */
export const signerFailed = 'signer_failed';

export function signerRefused(code: string): string {
  return `${signerFailed}:${code}`;
}

/** The service's code in a rejection, `locked_field` for `signer_failed:locked_field`; null for any other error. */
export function signerRefusalCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const prefix = `${signerFailed}:`;
  return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : null;
}

export type SignatureValidation = {
  field: string;
  signerName: string;
  /** ISO 8601, from the signature's own signing time; null when it has none. */
  signedAt: string | null;
  /** The bytes the signature covers are unchanged, and the signature over them verifies against its certificate. Says nothing of who issued the certificate: `trusted` does. */
  intact: boolean;
  /** Every change after this signature was a permitted one (form fill or signature). */
  modificationsPermitted: boolean;
  /** This signature certified the document (DocMDP). */
  certified: boolean;
  /**
   * The certificate chains to one of the roots given to `validate`, checked at the signing time
   * the signature states, as Adobe Acrobat does by default; false when no root was given.
   */
  trusted: boolean;
  /** The signer certificate's serial in lowercase hex, as @peculiar/x509 gives it. */
  certificateSerial: string;
  /** The issuer's distinguished name as RFC 4514 writes it, `CN=SSM Ușor Signing CA`. */
  issuer: string;
  /** The subject's serialNumber attribute (2.5.4.5), the signer's account id; null without one. */
  subjectSerialNumber: string | null;
  /**
   * `entire` when the signature covers the whole file, as the newest signature does while nothing
   * follows it; `partial` when later updates follow, as they do every earlier signature on a sheet.
   */
  coverage: 'entire' | 'partial';
};

export type BeginSignatureOptions = {
  /** The signature field to sign; must exist and be empty. */
  field: string;
  /** The signer's certificate and the chain up to the app's CA, PEM. An ECDSA P-256 key; key usage digitalSignature (and nonRepudiation), which validators look for. */
  certificatePem: string;
  chainPem: string[];
  reason: string;
  /** ISO 8601; the signing time written into the signature. */
  signedAt: string;
  /** True for the first signature on a sheet: certifies it with form filling and signing as the only permitted changes. */
  certify: boolean;
  /**
   * Fields this signature locks against later changes: the row's text fields. Never a signature
   * field still to be signed, which the lock would keep from being signed.
   */
  lockFields: string[];
  /** The visible text in the field, one line each. */
  appearanceLines: string[];
};

export type BeginSignatureResult = {
  /** The PDF with the signature placeholder; goes back unchanged to `finishSignature`. */
  prepared: ArrayBuffer;
  /**
   * The bytes the caller signs as they are: the DER of the signature's signed attributes, which
   * carry the document's digest. ECDSA P-256 with SHA-256, as WebCrypto's `sign({ name: 'ECDSA',
   * hash: 'SHA-256' }, key, toSign)` gives it: raw r||s (IEEE P1363, 64 bytes).
   */
  toSign: ArrayBuffer;
  /** Opaque; the service keeps what it needs to finish for ten minutes, in memory, so a restart of the container loses it too. */
  sessionToken: string;
};

export interface SignerService {
  /**
   * Turns the named text fields of a PDF form into signature fields of the same rectangle,
   * for a sheet whose signature cells LibreOffice exported as text fields. Unknown names reject.
   */
  prepareSheet(pdf: ArrayBuffer, signatureFields: string[]): Promise<ArrayBuffer>;
  /**
   * Fills text fields as an incremental update, so that earlier signatures stay valid. Unknown
   * names reject, and so does a field that a signature's lock covers, with
   * `signer_failed:locked_field`.
   */
  fillFields(pdf: ArrayBuffer, values: Record<string, string>): Promise<ArrayBuffer>;
  /** First phase of a signature: the placeholder goes in, the bytes to sign come out. */
  beginSignature(pdf: ArrayBuffer, options: BeginSignatureOptions): Promise<BeginSignatureResult>;
  /**
   * Second phase: the raw signature over `toSign` goes in; the signed PDF comes out. Rejects when
   * the session is unknown, expired or finished, when the signature does not verify against the
   * certificate, or when `prepared` is not the PDF the first phase returned.
   */
  finishSignature(
    prepared: ArrayBuffer,
    sessionToken: string,
    signature: ArrayBuffer
  ): Promise<ArrayBuffer>;
  /** Every signature in the PDF, in order, as a validator sees it; `trustRootsPem` are the certificate authorities `trusted` accepts. */
  validate(pdf: ArrayBuffer, trustRootsPem?: string[]): Promise<SignatureValidation[]>;
  /**
   * Draws `text` in small grey letters in the top margin of every page, as an incremental update
   * that touches no field or signature. For a copy whose signatures no longer count, such as the
   * flattened merge of several sheets.
   */
  stampPages(pdf: ArrayBuffer, text: string): Promise<ArrayBuffer>;
}
