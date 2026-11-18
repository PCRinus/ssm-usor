import { afterEach, describe, expect, it, vi } from 'vitest';

import { callContainer, type ContainerCall, type Fetcher } from './container-call';

const failed = 'service_failed';

function call(overrides: Partial<ContainerCall<string>> = {}): ContainerCall<string> {
  return {
    request: (signal) => new Request('http://service/route', { method: 'POST', signal }),
    read: (response) => response.text(),
    event: 'service',
    context: { route: '/route' },
    failed,
    pauseMs: 0,
    ...overrides,
  };
}

const logged = (log: { mock: { calls: unknown[][] } }) =>
  log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);

afterEach(() => vi.restoreAllMocks());

describe('callContainer', () => {
  it('reads the answer of a request that succeeds', async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response('answer'));
    await expect(callContainer(fetcher, call())).resolves.toBe('answer');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0].url).toBe('http://service/route');
  });

  it('builds the request again for the second attempt after an unreachable container', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const request = vi.fn(() => new Request('http://service/route', { method: 'POST' }));
    const fetcher = vi
      .fn<Fetcher>()
      .mockRejectedValueOnce(new Error('container did not start'))
      .mockResolvedValueOnce(new Response('answer'));
    await expect(callContainer(fetcher, call({ request }))).resolves.toBe('answer');
    expect(request).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]![0]).toBe(
      JSON.stringify({
        event: 'service_unreachable',
        route: '/route',
        cause: 'Error: container did not start',
      })
    );
  });

  it('waits the pause before the second attempt', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValueOnce(new Response('down', { status: 503 }))
        .mockResolvedValueOnce(new Response('answer'));
      const answer = callContainer(fetcher, call({ pauseMs: 2000 }));
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(answer).resolves.toBe('answer');
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails with the general error when the second attempt fails the same way', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = vi.fn<Fetcher>(async () => new Response('down', { status: 502 }));
    await expect(callContainer(down, call())).rejects.toEqual(new Error(failed));
    expect(down).toHaveBeenCalledTimes(2);

    const unreachable = vi.fn<Fetcher>(async () => Promise.reject(new Error('gone')));
    await expect(callContainer(unreachable, call())).rejects.toEqual(new Error(failed));
    expect(unreachable).toHaveBeenCalledTimes(2);
  });

  it('rejects a 4xx with the refusal, once, and logs the start of the answer', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refusal = vi.fn((status: number, text: string) => new Error(`refused:${status}:${text}`));
    const fetcher = vi.fn<Fetcher>(async () => new Response('locked', { status: 409 }));
    await expect(callContainer(fetcher, call({ refusal }))).rejects.toEqual(
      new Error('refused:409:locked')
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      JSON.stringify({ event: 'service_refused', route: '/route', status: 409, detail: 'locked' }),
    ]);

    log.mockClear();
    const long = 'x'.repeat(600);
    const verbose = async () => new Response(long, { status: 400 });
    await expect(callContainer(verbose, call({ refusal }))).rejects.toEqual(
      new Error(`refused:400:${long}`)
    );
    expect(logged(log)[0]!.detail).toBe('x'.repeat(500));
  });

  it('rejects a 4xx with the general error when there is no refusal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = async () => new Response('bad file', { status: 400 });
    await expect(callContainer(fetcher, call())).rejects.toEqual(new Error(failed));
  });

  it('carries a refusal that answers the second attempt, unless told to collapse it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const refusal = (status: number) => new Error(`refused:${status}`);
    const waking = () =>
      vi
        .fn<Fetcher>()
        .mockResolvedValueOnce(new Response('Failed to start container', { status: 500 }))
        .mockResolvedValueOnce(new Response('gone', { status: 404 }));
    await expect(callContainer(waking(), call({ refusal }))).rejects.toEqual(
      new Error('refused:404')
    );
    await expect(
      callContainer(waking(), call({ refusal, collapseSecondFailure: true }))
    ).rejects.toEqual(new Error(failed));
  });

  it('does not try again when reading the answer fails', async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response('answer'));
    const read = async () => Promise.reject(new Error('not json'));
    await expect(callContainer(fetcher, call({ read }))).rejects.toEqual(new Error('not json'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('gives up on a request that takes too long, without trying again or aborting it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hanging = vi.fn<Fetcher>(() => new Promise<Response>(() => {}));
    const error = await callContainer(hanging, call({ timeoutMs: 5 })).catch(
      (caught: unknown) => caught
    );
    expect(error).toEqual(new Error(failed));
    expect((error as Error).cause).toBeDefined();
    expect(hanging).toHaveBeenCalledTimes(1);
    expect(hanging.mock.calls[0]![0].signal.aborted).toBe(false);
    expect(log.mock.calls[0]![0]).toBe(
      JSON.stringify({ event: 'service_timeout', route: '/route', timeoutMs: 5 })
    );
  });

  it('aborts the request it stops waiting for when asked to', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const hanging = vi.fn<Fetcher>(() => new Promise<Response>(() => {}));
    await expect(
      callContainer(hanging, call({ timeoutMs: 5, abortOnTimeout: true }))
    ).rejects.toEqual(new Error(failed));
    expect(hanging.mock.calls[0]![0].signal.aborted).toBe(true);
  });

  it('waits as long as it takes without a timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<Fetcher>(
        () => new Promise((resolve) => setTimeout(() => resolve(new Response('late')), 600_000))
      );
      const answer = callContainer(fetcher, call());
      await vi.advanceTimersByTimeAsync(600_000);
      await expect(answer).resolves.toBe('late');
    } finally {
      vi.useRealTimers();
    }
  });
});
