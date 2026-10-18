import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe("the portal's API adapter", () => {
  it('sends a failed request to PostHog', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: 'service_unavailable' }, { status: 503, headers: { 'cf-ray': 'r' } })
    );
    await expect(
      apiFetch('/portal/participants/6f0c3e43-0c1b-4f4b-8a1e-000000000001/training', { baseUrl })
    ).rejects.toThrow();
    expect(captured).toHaveBeenCalledWith(
      'api_request_failed',
      expect.objectContaining({
        method: 'GET',
        route: '/portal/participants/:id/training',
        kind: 'status',
        status: 503,
      })
    );
  });
});
