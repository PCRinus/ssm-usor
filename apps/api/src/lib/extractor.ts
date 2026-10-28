import {
  extractorAnswerError,
  extractorOverHttp,
  type ExtractorPost,
  type ExtractorService,
} from '@ssm-usor/contracts';

import type { ApiEnv } from './env';

// Reading an import's files happens in apps/pdf's extractor container (ADR 030, docs/pdf.md). The
// `EXTRACTOR` binding counts only where PDF_CONVERSION=service, for the reason ./pdf.ts gives.
// Unlike those, a failure is not turned into an answer: files are read in a queue, not a request,
// and a refusal (`extractionRefusalOf`) is the file's problem to record, not the API's.

function postTo(url: string): ExtractorPost {
  return async (route, file, params) => {
    const target = new URL(route, url);
    for (const [name, value] of Object.entries(params ?? {})) target.searchParams.set(name, value);
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error(`Extractor ${route} answered ${response.status}: ${text.slice(0, 300)}`);
      throw extractorAnswerError(response.status, text);
    }
    return response.arrayBuffer();
  };
}

export function createExtractor(env: ApiEnv['Bindings']): ExtractorService | null {
  if (env.PDF_CONVERSION === 'service' && env.EXTRACTOR) return env.EXTRACTOR;
  if (env.EXTRACTOR_URL) return extractorOverHttp(postTo(env.EXTRACTOR_URL));
  return null;
}
