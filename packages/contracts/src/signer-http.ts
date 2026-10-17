import { type SignatureValidation, signerFailed, type SignerService } from './signer';

// The wire format of the signer container (apps/pdf/signer): JSON bodies with every PDF and
// signature in base64. Shared by apps/pdf, which reaches the container, and the API, which
// reaches a signer started locally by URL (docs/pdf.md).

export type SignerRoute = '/prepare-sheet' | '/fill' | '/sign/begin' | '/sign/finish' | '/validate';

/** Posts a JSON body to a route and resolves with the parsed JSON answer of a 2xx; rejects otherwise. */
export type SignerPost = (route: SignerRoute, body: object) => Promise<unknown>;

function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  // In slices, because String.fromCharCode takes its arguments on the stack.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: unknown): ArrayBuffer {
  if (typeof text !== 'string') throw new Error(signerFailed);
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function answerOf(answer: unknown): Record<string, unknown> {
  if (typeof answer !== 'object' || answer === null) throw new Error(signerFailed);
  return answer as Record<string, unknown>;
}

export function signerOverHttp(post: SignerPost): SignerService {
  return {
    async prepareSheet(pdf, signatureFields) {
      const answer = answerOf(
        await post('/prepare-sheet', { pdf: toBase64(pdf), signatureFields })
      );
      return fromBase64(answer.pdf);
    },
    async fillFields(pdf, values) {
      const answer = answerOf(await post('/fill', { pdf: toBase64(pdf), values }));
      return fromBase64(answer.pdf);
    },
    async beginSignature(pdf, options) {
      const answer = answerOf(await post('/sign/begin', { pdf: toBase64(pdf), ...options }));
      if (typeof answer.sessionToken !== 'string') throw new Error(signerFailed);
      return {
        prepared: fromBase64(answer.prepared),
        toSign: fromBase64(answer.toSign),
        sessionToken: answer.sessionToken,
      };
    },
    async finishSignature(prepared, sessionToken, signature) {
      const answer = answerOf(
        await post('/sign/finish', {
          prepared: toBase64(prepared),
          sessionToken,
          signature: toBase64(signature),
        })
      );
      return fromBase64(answer.pdf);
    },
    async validate(pdf) {
      const answer = answerOf(await post('/validate', { pdf: toBase64(pdf) }));
      if (!Array.isArray(answer.signatures)) throw new Error(signerFailed);
      return answer.signatures as SignatureValidation[];
    },
  };
}
