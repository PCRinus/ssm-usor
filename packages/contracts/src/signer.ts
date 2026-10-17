// What apps/pdf offers other Workers over its service binding for signing (ADR 023): the
// routes of the signer container, pyHanko behind a small HTTP service, as one interface.
// Signing is two-phase so that a signer's private key never leaves the API Worker.

/** `message` of the error every method rejects with when the signer service fails. */
export const signerFailed = 'signer_failed';

export type SignatureValidation = {
  field: string;
  signerName: string;
  /** ISO 8601, from the signature's own signing time; null when it has none. */
  signedAt: string | null;
  /** The bytes the signature covers are unchanged. */
  intact: boolean;
  /** Every change after this signature was a permitted one (form fill or signature). */
  modificationsPermitted: boolean;
  /** This signature certified the document (DocMDP). */
  certified: boolean;
};

export type BeginSignatureOptions = {
  /** The signature field to sign; must exist and be empty. */
  field: string;
  /** The signer's certificate and the chain up to the app's CA, PEM. */
  certificatePem: string;
  chainPem: string[];
  reason: string;
  /** ISO 8601; the signing time written into the signature. */
  signedAt: string;
  /** True for the first signature on a sheet: certifies it with form filling and signing as the only permitted changes. */
  certify: boolean;
  /** Fields this signature locks against later changes: the row's fields. */
  lockFields: string[];
  /** The visible text in the field, one line each. */
  appearanceLines: string[];
};

export type BeginSignatureResult = {
  /** The PDF with the signature placeholder; goes back unchanged to `finishSignature`. */
  prepared: ArrayBuffer;
  /** The bytes the caller signs: ECDSA P-256 over SHA-256, raw r||s (IEEE P1363, 64 bytes). */
  toSign: ArrayBuffer;
  /** Opaque; the service keeps what it needs to finish for ten minutes. */
  sessionToken: string;
};

export interface SignerService {
  /**
   * Turns the named text fields of a PDF form into signature fields of the same rectangle,
   * for a sheet whose signature cells LibreOffice exported as text fields. Unknown names reject.
   */
  prepareSheet(pdf: ArrayBuffer, signatureFields: string[]): Promise<ArrayBuffer>;
  /** Fills text fields as an incremental update, so that earlier signatures stay valid. Unknown names reject. */
  fillFields(pdf: ArrayBuffer, values: Record<string, string>): Promise<ArrayBuffer>;
  /** First phase of a signature: the placeholder goes in, the bytes to sign come out. */
  beginSignature(pdf: ArrayBuffer, options: BeginSignatureOptions): Promise<BeginSignatureResult>;
  /** Second phase: the raw signature over `toSign` goes in; the signed PDF comes out. Rejects when the session is unknown or expired. */
  finishSignature(
    prepared: ArrayBuffer,
    sessionToken: string,
    signature: ArrayBuffer
  ): Promise<ArrayBuffer>;
  /** Every signature in the PDF, in order, as a validator sees it. */
  validate(pdf: ArrayBuffer): Promise<SignatureValidation[]>;
}
