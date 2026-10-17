import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGetMeQueryOptions, getMe } from '@/api/generated/api';

import { apiFetch } from './http';

const captured = vi.hoisted(() => vi.fn());
vi.mock('@/app/observability/posthog', () => ({ captureEvent: captured }));

const fetchMock = vi.fn<typeof fetch>();
const baseUrl = 'https://api.example.test';

beforeEach(() => {
  captured.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("the app's API adapter", () => {
  it('serves the generated client with the token of the request options', async () => {
    const body = { user: { id: 'test-user', email: 'test@example.test' } };
    fetchMock.mockImplementation(async () => Response.json(body));
    expect(await getMe({ baseUrl, getAccessToken: () => 'token' })).toEqual(body);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${baseUrl}/me`);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      'Bearer token'
    );
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

  it('sends a failed request to PostHog', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: 'service_unavailable' }, { status: 503, headers: { 'cf-ray': 'r' } })
    );
    await expect(apiFetch('/me', { baseUrl })).rejects.toThrow();
    expect(captured).toHaveBeenCalledWith(
      'api_request_failed',
      expect.objectContaining({ method: 'GET', route: '/me', kind: 'status', status: 503 })
    );
  });
});
