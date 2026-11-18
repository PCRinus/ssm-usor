import { extractionFailed, extractorAnswerError, type ExtractorPost } from '@ssm-usor/contracts';

import { callContainer, type Fetcher } from './container-call';

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
  return (route, file, params) =>
    callContainer(fetcher, {
      request: (signal) => {
        // The host is ignored: the request goes to the container's port.
        const url = new URL(`http://extractor${route}`);
        for (const [name, value] of Object.entries(params ?? {})) url.searchParams.set(name, value);
        return new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: file,
          signal,
        });
      },
      read: (response) => response.arrayBuffer(),
      event: 'extraction',
      context: { route },
      failed: extractionFailed,
      refusal: extractorAnswerError,
      pauseMs,
      timeoutMs,
      // Aborted, so the container stops the work too rather than finish it for nobody.
      abortOnTimeout: true,
    });
}
