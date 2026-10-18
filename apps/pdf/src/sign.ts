import { signerAnswerError, signerFailed, type SignerPost } from '@ssm-usor/contracts';

import type { Fetcher } from './convert';

class RetryableFailure extends Error {}
class TimedOut extends Error {}

/**
 * Posts to the signer container with the discipline of `convertDocx`: a failure that is not
 * about the request, such as a container that did not start, is tried once more after a pause.
 * A refusal rejects with the service's code (`signer_failed:locked_field`), which a service
 * binding carries to the caller in the error's message.
 */
export function postToSigner(fetcher: Fetcher, pauseMs = 2000, timeoutMs = 60_000): SignerPost {
  return async (route, body) => {
    try {
      return await postOnce(fetcher, route, body, timeoutMs);
    } catch (error) {
      if (!(error instanceof RetryableFailure)) throw error;
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
      try {
        return await postOnce(fetcher, route, body, timeoutMs);
      } catch (retryError) {
        throw retryError instanceof RetryableFailure ? new Error(signerFailed) : retryError;
      }
    }
  };
}

async function postOnce(
  fetcher: Fetcher,
  route: string,
  body: object,
  timeoutMs: number
): Promise<unknown> {
  let response: Response;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A timer rather than a request signal, so that it bounds any fetcher, the container's included.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimedOut()), timeoutMs);
    });
    // The host is ignored: the request goes to the container's port.
    const request = new Request(`http://signer${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    response = await Promise.race([fetcher(request), timeout]);
  } catch (cause) {
    if (cause instanceof TimedOut) {
      console.error(JSON.stringify({ event: 'signer_timeout', route, timeoutMs }));
      throw new Error(signerFailed, { cause });
    }
    console.error(JSON.stringify({ event: 'signer_unreachable', route, cause: String(cause) }));
    throw new RetryableFailure(signerFailed);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const text = await response.text();
    console.error(
      JSON.stringify({
        event: 'signer_refused',
        route,
        status: response.status,
        detail: text.slice(0, 500),
      })
    );
    // 4xx is the service about the request; anything else is the container or the service.
    if (response.status >= 500) throw new RetryableFailure(signerFailed);
    throw signerAnswerError(response.status, text);
  }
  try {
    return await response.json();
  } catch {
    console.error(JSON.stringify({ event: 'signer_not_json', route }));
    throw new Error(signerFailed);
  }
}
