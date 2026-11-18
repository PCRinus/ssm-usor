export type Fetcher = (request: Request) => Promise<Response>;

export type ContainerCall<T> = {
  /** Built again for each attempt; `signal` is there only with `abortOnTimeout`. */
  request: (signal?: AbortSignal) => Request;
  read: (response: Response) => Promise<T>;
  event: string;
  context?: Record<string, unknown>;
  failed: string;
  refusal?: (status: number, text: string) => Error;
  pauseMs: number;
  /** Not retried when it runs out, since the service may still be working on it. */
  timeoutMs?: number;
  abortOnTimeout?: boolean;
  /** The second attempt fails with `failed` whatever went wrong, a refusal included. */
  collapseSecondFailure?: boolean;
};

/**
 * A container that was asleep sometimes fails its first start and comes up on the second,
 * so a failure that is not about the request is tried once more after a pause.
 */
export async function callContainer<T>(fetcher: Fetcher, call: ContainerCall<T>): Promise<T> {
  try {
    return await attempt(fetcher, call);
  } catch (error) {
    if (!(error instanceof RetryableFailure)) throw error;
    await new Promise((resolve) => setTimeout(resolve, call.pauseMs));
    try {
      return await attempt(fetcher, call);
    } catch (retryError) {
      const collapse = call.collapseSecondFailure || retryError instanceof RetryableFailure;
      throw collapse ? new Error(call.failed) : retryError;
    }
  }
}

class RetryableFailure extends Error {}
class TimedOut extends Error {}

async function attempt<T>(fetcher: Fetcher, call: ContainerCall<T>): Promise<T> {
  const { event, context, failed, timeoutMs } = call;
  let response: Response;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abandon = call.abortOnTimeout ? new AbortController() : undefined;
  try {
    // A timer rather than a request signal, so that it bounds any fetcher, the container's included.
    const timeout =
      timeoutMs === undefined
        ? undefined
        : new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              abandon?.abort();
              reject(new TimedOut());
            }, timeoutMs);
          });
    const request = call.request(abandon?.signal);
    response = await (timeout ? Promise.race([fetcher(request), timeout]) : fetcher(request));
  } catch (cause) {
    if (cause instanceof TimedOut) {
      console.error(JSON.stringify({ event: `${event}_timeout`, ...context, timeoutMs }));
      throw new Error(failed, { cause });
    }
    console.error(
      JSON.stringify({ event: `${event}_unreachable`, ...context, cause: String(cause) })
    );
    throw new RetryableFailure(failed);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const text = await response.text();
    console.error(
      JSON.stringify({
        event: `${event}_refused`,
        ...context,
        status: response.status,
        detail: text.slice(0, 500),
      })
    );
    // 4xx is the service about the request; anything else is the container or the service.
    if (response.status >= 500) throw new RetryableFailure(failed);
    throw call.refusal ? call.refusal(response.status, text) : new Error(failed);
  }
  return call.read(response);
}
