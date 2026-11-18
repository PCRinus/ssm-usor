import { signerAnswerError, signerFailed, type SignerPost } from '@ssm-usor/contracts';

import { callContainer, type Fetcher } from './container-call';

/**
 * Posts to the signer container with the discipline of `convertDocx`: a failure that is not
 * about the request, such as a container that did not start, is tried once more after a pause.
 * A refusal rejects with the service's code (`signer_failed:locked_field`), which a service
 * binding carries to the caller in the error's message.
 */
export function postToSigner(fetcher: Fetcher, pauseMs = 2000, timeoutMs = 60_000): SignerPost {
  return (route, body) =>
    callContainer(fetcher, {
      // The host is ignored: the request goes to the container's port.
      request: () =>
        new Request(`http://signer${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      read: async (response): Promise<unknown> => {
        try {
          return await response.json();
        } catch {
          console.error(JSON.stringify({ event: 'signer_not_json', route }));
          throw new Error(signerFailed);
        }
      },
      event: 'signer',
      context: { route },
      failed: signerFailed,
      refusal: signerAnswerError,
      pauseMs,
      // No abort: nothing in the signer stops working when the request is closed.
      timeoutMs,
    });
}
