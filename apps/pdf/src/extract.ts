import { extractionFailed, extractorAnswerError, type ExtractorPost } from '@ssm-usor/contracts';

import type { Fetcher } from './convert';

class RetryableFailure extends Error {}
class TimedOut extends Error {}

/**
 * Posts to the extractor container with the discipline of `postToSigner`: a container that did
 * not start, or answered 5xx (503 when it has too many files waiting), is tried once more after a
 * pause. A refusal rejects with its reason
 * (`extraction_failed:password_protected`), which a service binding carries to the caller.
 */
export function postToExtractor(
  fetcher: Fetcher,
  pauseMs = 2000,
  timeoutMs = 180_000
): ExtractorPost {
  return async (route, file, params) => {
    try {
      return await postOnce(fetcher, route, file, params, timeoutMs);
    } catch (error) {
      if (!(error instanceof RetryableFailure)) throw error;
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
      try {
        return await postOnce(fetcher, route, file, params, timeoutMs);
      } catch (retryError) {
        throw retryError instanceof RetryableFailure ? new Error(extractionFailed) : retryError;
      }
    }
  };
}

async function postOnce(
  fetcher: Fetcher,
  route: string,
  file: ArrayBuffer,
  params: Record<string, string> | undefined,
  timeoutMs: number
): Promise<ArrayBuffer> {
  let response: Response;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Aborted, so the container stops the work too rather than finish it for nobody.
  const abandon = new AbortController();
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        abandon.abort();
        reject(new TimedOut());
      }, timeoutMs);
    });
    // The host is ignored: the request goes to the container's port.
    const url = new URL(`http://extractor${route}`);
    for (const [name, value] of Object.entries(params ?? {})) url.searchParams.set(name, value);
    const request = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
      signal: abandon.signal,
    });
    response = await Promise.race([fetcher(request), timeout]);
  } catch (cause) {
    if (cause instanceof TimedOut) {
      console.error(JSON.stringify({ event: 'extraction_timeout', route, timeoutMs }));
      throw new Error(extractionFailed, { cause });
    }
    console.error(JSON.stringify({ event: 'extraction_unreachable', route, cause: String(cause) }));
    throw new RetryableFailure(extractionFailed);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const text = await response.text();
    console.error(
      JSON.stringify({
        event: 'extraction_refused',
        route,
        status: response.status,
        detail: text.slice(0, 500),
      })
    );
    if (response.status >= 500) throw new RetryableFailure(extractionFailed);
    throw extractorAnswerError(response.status, text);
  }
  return response.arrayBuffer();
}
