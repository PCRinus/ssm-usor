import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGetMeQueryOptions, getMe } from './generated/api';
import { apiFetch, ApiHttpError } from './http';

const fetchMock = vi.fn<typeof fetch>();
const baseUrl = 'https://api.example.test';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('generated client HTTP adapter', () => {
  it('reads the current token on every request and returns the decoded identity', async () => {
    let token = 'first-token';
    const options = { baseUrl, getAccessToken: () => token };
    const body = { user: { id: 'test-user', email: 'test@example.test' } };
    fetchMock.mockImplementation(async () => Response.json(body));
    expect(await getMe(options)).toEqual(body);
    token = 'refreshed-token';
    await getMe(options);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${baseUrl}/me`);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer first-token'
    );
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer refreshed-token'
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
  });

  it.each([401, 503])('throws a typed error for HTTP %s', async (status) => {
    const body = { error: 'test_error', message: 'Test error' };
    fetchMock.mockResolvedValue(Response.json(body, { status }));
    await expect(getMe({ baseUrl })).rejects.toMatchObject({ status, body, name: 'ApiHttpError' });
  });

  it('preserves the status of non-JSON proxy errors', async () => {
    fetchMock.mockResolvedValue(new Response('<h1>Bad gateway</h1>', { status: 502 }));
    await expect(getMe({ baseUrl })).rejects.toBeInstanceOf(ApiHttpError);
  });

  it('blocks missing configuration and endpoint URLs outside the configured origin', async () => {
    await expect(getMe()).rejects.toThrow('not configured');
    await expect(
      apiFetch('https://attacker.example/me', { baseUrl, getAccessToken: () => 'secret' })
    ).rejects.toThrow('configured origin');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send a token or request after cancellation while waiting for auth', async () => {
    const controller = new AbortController();
    let resolve!: (value: string) => void;
    const pending = getMe({
      baseUrl,
      signal: controller.signal,
      getAccessToken: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    });
    controller.abort();
    resolve('token');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates TanStack cancellation through the generated query function to fetch', async () => {
    let signal: AbortSignal | null | undefined;
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal;
          signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
        })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pending = client.fetchQuery(getGetMeQueryOptions({ request: { baseUrl } }));
    const rejection = expect(pending).rejects.toBeDefined();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    client.clear();
    await rejection;
    expect(signal?.aborted).toBe(true);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
