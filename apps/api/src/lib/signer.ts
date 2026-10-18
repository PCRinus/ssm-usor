import {
  signerAnswerError,
  signerFailed,
  signerOverHttp,
  type SignerPost,
  type SignerService,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { ApiEnv } from './env';
import { ApiError } from './errors';

// Signing happens in apps/pdf's signer container (ADR 023, docs/pdf.md). The `SIGNER` binding
// counts only where PDF_CONVERSION=service, for the reason ./pdf.ts gives.

const unavailable = () =>
  new ApiError(
    'service_unavailable',
    'The signing service could not be reached. Nothing was signed; try again in a moment.',
    undefined,
    'signer_unavailable'
  );

function postTo(url: string): SignerPost {
  return async (route, body) => {
    const response = await fetch(new URL(route, url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`Signer ${route} answered ${response.status}: ${text.slice(0, 300)}`);
      throw signerAnswerError(response.status, text);
    }
    return response.json();
  };
}

export function createSigner(c: Context<ApiEnv>): SignerService | null {
  const { SIGNER_URL } = c.env;
  const service =
    (c.env.PDF_CONVERSION === 'service' ? c.env.SIGNER : undefined) ??
    (SIGNER_URL ? signerOverHttp(postTo(SIGNER_URL)) : undefined);
  if (!service) return null;

  async function guarded<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      // apps/pdf has logged why; here it is enough to know that it was the signer.
      const known = error instanceof Error && error.message === signerFailed;
      console.error(`Signing failed${known ? '' : `: ${String(error)}`}`);
      throw unavailable();
    }
  }

  return {
    prepareSheet: (pdf, fields) => guarded(() => service.prepareSheet(pdf, fields)),
    fillFields: (pdf, values) => guarded(() => service.fillFields(pdf, values)),
    beginSignature: (pdf, options) => guarded(() => service.beginSignature(pdf, options)),
    finishSignature: (prepared, token, signature) =>
      guarded(() => service.finishSignature(prepared, token, signature)),
    validate: (pdf, trustRootsPem) => guarded(() => service.validate(pdf, trustRootsPem)),
    stampPages: (pdf, text) => guarded(() => service.stampPages(pdf, text)),
  };
}

export function requireSigner(c: Context<ApiEnv>): SignerService {
  const signer = createSigner(c);
  if (!signer) throw unavailable();
  return signer;
}
