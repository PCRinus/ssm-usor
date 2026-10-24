import { guideStateListResponseSchema, guideStateSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };

const welcome = {
  user_id: user.id,
  guide: 'welcome',
  version: 1,
  status: 'skipped',
  updated_at: '2026-10-24T09:00:00+00:00',
};

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream({ rows = [welcome] } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ ...user, is_anonymous: false });
    if (url.pathname === '/rest/v1/user_guides') return Response.json(rows);
    if (url.pathname === '/rest/v1/rpc/record_user_guide') {
      const body = JSON.parse(init?.body as string) as Record<string, unknown>;
      return Response.json({ ...welcome, ...body, updated_at: '2026-10-25T10:00:00+00:00' });
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  });
}

const request = (path: string, init: RequestInit = {}) =>
  createApp().request(
    path,
    { ...init, headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } },
    env
  );

const rpcBodies = () =>
  fetchMock.mock.calls
    .filter(([input]) => String(input).includes('/rest/v1/rpc/record_user_guide'))
    .map(([, init]) => JSON.parse(init?.body as string));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /me/guides', () => {
  it("lists the caller's guide states", async () => {
    mockUpstream();

    const response = await request('/me/guides');

    expect(response.status).toBe(200);
    expect(guideStateListResponseSchema.parse(await response.json())).toEqual({
      items: [
        {
          guide: 'welcome',
          version: 1,
          status: 'skipped',
          updatedAt: '2026-10-24T09:00:00.000Z',
        },
      ],
    });
  });

  it('answers an empty list for an account that has seen no guide', async () => {
    mockUpstream({ rows: [] });

    const response = await request('/me/guides');

    expect(await response.json()).toEqual({ items: [] });
  });
});

describe('PUT /me/guides/{guide}', () => {
  it('records the guide with its version and status', async () => {
    mockUpstream();

    const response = await request('/me/guides/welcome', {
      method: 'PUT',
      body: JSON.stringify({ version: 2, status: 'completed' }),
    });

    expect(response.status).toBe(200);
    expect(guideStateSchema.parse(await response.json())).toEqual({
      guide: 'welcome',
      version: 2,
      status: 'completed',
      updatedAt: '2026-10-25T10:00:00.000Z',
    });
    expect(rpcBodies()).toEqual([{ guide: 'welcome', version: 2, status: 'completed' }]);
  });

  it('refuses a guide id that is not a slug', async () => {
    mockUpstream();

    const response = await request('/me/guides/Turul%20aplica%C8%9Biei', {
      method: 'PUT',
      body: JSON.stringify({ version: 1, status: 'completed' }),
    });

    expect(response.status).toBe(400);
    expect(rpcBodies()).toEqual([]);
  });

  it('refuses a status other than completed or skipped', async () => {
    mockUpstream();

    const response = await request('/me/guides/welcome', {
      method: 'PUT',
      body: JSON.stringify({ version: 1, status: 'started' }),
    });

    expect(response.status).toBe(400);
    expect(rpcBodies()).toEqual([]);
  });
});
