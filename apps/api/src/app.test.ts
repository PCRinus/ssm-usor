import { apiErrorResponseSchema, apiHealthSchema, meResponseSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app';
import type { ApiEnv } from './lib/env';
import { openApiConfig } from './lib/openapi';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CORS_ORIGINS: 'http://localhost:5173, https://app.ssmusor.ro',
};

const user = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'admin@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email' },
  user_metadata: { role: 'admin', private_note: 'Never return this' },
};

const fetchMock = vi.fn<typeof fetch>();

// Supabase Auth answers with the token's user; the account has no profile or membership.
function mockAccount(accountFor: (token: string | null) => unknown) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('Authorization');
      return Response.json(accountFor(token));
    }
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([]);
    if (url.pathname.startsWith('/rest/v1/')) return Response.json(null);
    throw new Error(`Unexpected upstream request: ${url}`);
  });
}

const requestMe = (authorization = 'Bearer test-access-token', bindings = env) =>
  createApp().request('/me', { headers: { Authorization: authorization } }, bindings);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('API routes', () => {
  it('serves public health without Supabase configuration or network access', async () => {
    const response = await createApp().request('/health', {}, {});
    expect(response.status).toBe(200);
    expect(apiHealthSchema.parse(await response.json())).toEqual({
      status: 'ok',
      service: 'ssm-usor-api',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a JSON 404', async () => {
    const response = await createApp().request('/missing', {}, {});
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });

  it.each(['', 'Basic abc', 'Bearer', 'Bearer one two', 'Bearer one,Bearer two'])(
    'rejects a missing or malformed bearer header: %s',
    async (authorization) => {
      const response = await requestMe(authorization);
      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('unauthorized');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('verifies with the configured Supabase project and only exposes public identity fields', async () => {
    mockAccount(() => user);
    const response = await requestMe('bearer test-access-token');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      meResponseSchema.parse({
        user: { id: user.id, email: user.email },
        profile: null,
        membership: null,
      })
    );
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    // The token is verified before anything is read on the user's behalf.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://example.supabase.co/auth/v1/user');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
    expect(new Headers(init?.headers).get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps identities isolated across requests', async () => {
    const secondUser = {
      ...user,
      id: '1e8b36cc-d87a-4318-9af2-acb1f6156112',
      email: 'other@example.com',
    };
    mockAccount((token) => (token === 'Bearer first' ? user : secondUser));
    const app = createApp();
    const first = await app.request('/me', { headers: { Authorization: 'Bearer first' } }, env);
    const second = await app.request('/me', { headers: { Authorization: 'Bearer second' } }, env);
    expect(meResponseSchema.parse(await first.json()).user.id).toBe(user.id);
    expect(meResponseSchema.parse(await second.json()).user.id).toBe(secondUser.id);
    const tokens = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get('Authorization')
    );
    expect(new Set(tokens)).toEqual(new Set(['Bearer first', 'Bearer second']));
    expect(tokens.indexOf('Bearer second')).toBeGreaterThan(tokens.lastIndexOf('Bearer first'));
  });

  it.each([401, 403])(
    'rejects tokens rejected by Supabase (%s), without leaking details',
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json({ message: 'Sensitive upstream details', code: 'bad_jwt' }, { status })
      );
      const response = await requestMe();
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'unauthorized',
        message: 'A valid access token is required.',
      });
    }
  );

  it('rejects anonymous Supabase users', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...user, is_anonymous: true }));
    expect((await requestMe()).status).toBe(401);
  });

  it.each([
    {},
    { ...env, SUPABASE_URL: 'not-a-url' },
    { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not_allowed' },
  ])('fails closed on missing or invalid configuration', async (bindings) => {
    const response = await requestMe('Bearer token', bindings);
    expect(response.status).toBe(503);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('service_unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503])(
    'distinguishes an upstream outage (%s) from invalid credentials',
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json({ message: 'Sensitive upstream details' }, { status })
      );
      const response = await requestMe();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: 'service_unavailable',
        message: 'Authentication is temporarily unavailable.',
      });
    }
  );

  it('handles network failures without exposing their details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError('Sensitive connection details'));
    const response = await requestMe();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('Sensitive');
  });

  it('rejects a malformed upstream identity', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...user, id: 'invalid-id' }));
    expect((await requestMe()).status).toBe(503);
  });

  it('uses a generic JSON response for unexpected errors', async () => {
    const app = createApp();
    app.get('/test-error', () => {
      throw new Error('Sensitive internal details');
    });
    const response = await app.request('/test-error', {}, {});
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'internal_error',
      message: 'An unexpected error occurred.',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('CORS', () => {
  it.each(['http://localhost:5173', 'https://app.ssmusor.ro'])(
    'allows bearer preflight from %s without authentication',
    async (origin) => {
      const response = await createApp().request(
        '/me',
        {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'authorization',
          },
        },
        env
      );
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
        'authorization'
      );
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(['https://app.ssmusor.ro.attacker.example', 'null'])(
    'does not allow unlisted origins: %s',
    async (origin) => {
      const response = await createApp().request(
        '/me',
        {
          method: 'OPTIONS',
          headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
        },
        env
      );
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  );

  it('makes auth errors readable to the allowed app origin', async () => {
    const response = await createApp().request(
      '/me',
      { headers: { Origin: 'https://app.ssmusor.ro' } },
      env
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.ssmusor.ro');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('excludes local origins from the production default', async () => {
    const response = await createApp().request(
      '/health',
      { headers: { Origin: 'http://localhost:5173' } },
      {}
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

it('serves the same OpenAPI document as the offline generator, with bearer security on /me', async () => {
  const app = createApp();
  const response = await app.request('/openapi.json', {}, {});
  expect(response.status).toBe(200);
  const document = app.getOpenAPIDocument(openApiConfig);
  expect(await response.json()).toEqual(document);
  expect(document.paths?.['/me']?.get?.security).toEqual([{ bearerAuth: [] }]);
  expect(document.paths?.['/me']?.get?.operationId).toBe('getMe');
  expect(document.paths?.['/health']?.get?.security).toBeUndefined();
  expect(document.components?.schemas?.MeResponse).toBeDefined();
  expect(fetchMock).not.toHaveBeenCalled();
});
