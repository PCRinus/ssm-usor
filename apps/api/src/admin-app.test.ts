import { apiErrorResponseSchema, currentUserSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminApp } from './admin-app';
import { createApp } from './app';
import type { ApiEnv } from './lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
};

const user = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'mircea@example.ro',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email', role: 'admin' },
  user_metadata: {},
};

const member = {
  ...user,
  app_metadata: { provider: 'email' },
  // Anyone can write user_metadata, so a role there grants nothing.
  user_metadata: { role: 'admin' },
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

const token = (aal: 'aal1' | 'aal2') =>
  `${encode({ alg: 'ES256', typ: 'JWT' })}.${encode({ sub: user.id, aal })}.c2lnbmF0dXJl`;

const fetchMock = vi.fn<typeof fetch>();

function mockAuth(answer: () => Response) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return answer();
    throw new Error(`Unexpected upstream request: ${url}`);
  });
}

const requestAdmin = (authorization?: string, path = '/admin/me') =>
  createAdminApp().request(
    path,
    { headers: authorization ? { Authorization: authorization } : {} },
    env
  );

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the admin API guard', () => {
  it('refuses a request without a token', async () => {
    const response = await requestAdmin();
    expect(response.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('unauthorized');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a token Supabase Auth does not accept', async () => {
    mockAuth(() => Response.json({ code: 'bad_jwt', message: 'invalid JWT' }, { status: 401 }));
    const response = await requestAdmin(`Bearer ${token('aal2')}`);
    expect(response.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('unauthorized');
  });

  it('refuses a member without the admin claim, whatever the second factor', async () => {
    mockAuth(() => Response.json(member));
    const response = await requestAdmin(`Bearer ${token('aal2')}`);
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('forbidden');
  });

  it('refuses an admin whose session has not passed a second factor', async () => {
    mockAuth(() => Response.json(user));
    const response = await requestAdmin(`Bearer ${token('aal1')}`);
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      error: 'forbidden',
      reason: 'aal2_required',
    });
  });

  it('answers an admin with a second factor with their identity only', async () => {
    mockAuth(() => Response.json(user));
    const response = await requestAdmin(`Bearer ${token('aal2')}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(
      currentUserSchema.parse({ id: user.id, email: user.email })
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://example.supabase.co/auth/v1/user');
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token('aal2')}`);
  });

  it('checks the token before answering that a route does not exist', async () => {
    expect((await requestAdmin(undefined, '/admin/missing')).status).toBe(401);
  });
});

it('keeps admin routes off the public API', async () => {
  mockAuth(() => Response.json(user));
  const response = await createApp().request(
    '/admin/me',
    { headers: { Authorization: `Bearer ${token('aal2')}` } },
    env
  );
  expect(response.status).toBe(404);
});
