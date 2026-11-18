import type { AccessLevel, OrganizationRole } from '@ssm-usor/contracts';
import { afterEach, beforeEach, vi } from 'vitest';

import type { ApiEnv } from '../lib/env';

export type UpstreamCall = {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
  secret: boolean;
};

export type UpstreamRoute = (call: UpstreamCall) => unknown;

export type UpstreamRoutes = Record<string, UpstreamRoute>;

export const testSecretKey = 'sb_secret_test_key_value';

export const testEnv = (overrides: Partial<ApiEnv['Bindings']> = {}): ApiEnv['Bindings'] => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  ...overrides,
});

export const testUser = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'ana@example.ro',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email' },
  user_metadata: {},
};

export const testOrganizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';

export const membershipRow = (
  overrides: {
    user_id?: string;
    organization_id?: string;
    role?: OrganizationRole;
    access?: AccessLevel;
  } = {}
) => ({
  user_id: testUser.id,
  organization_id: testOrganizationId,
  role: 'specialist' as OrganizationRole,
  access: 'full' as AccessLevel,
  ...overrides,
});

export const fetchMock = vi.fn<typeof fetch>();

export function stubFetch() {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}

export const databaseError = (code: string, message: string, status = 400) =>
  Response.json({ code, message, details: null, hint: null }, { status });

function parseBody(body: unknown) {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function toCall(input: Parameters<typeof fetch>[0], init?: RequestInit): UpstreamCall {
  const request = input instanceof Request ? input : undefined;
  const headers = new Headers(init?.headers ?? request?.headers);
  return {
    method: init?.method ?? request?.method ?? 'GET',
    url: new URL(request ? request.url : String(input)),
    headers,
    body: parseBody(init?.body),
    secret: headers.get('Authorization') === `Bearer ${testSecretKey}`,
  };
}

export const signedInUserRoutes: UpstreamRoutes = {
  '/auth/v1/user': () => ({ ...testUser }),
};

export const membershipRoutes: UpstreamRoutes = {
  '/rest/v1/rpc/current_membership': () => [membershipRow()],
};

// An earlier layer wins, even its bare `/path` over a later layer's `METHOD /path`, so a test can
// replace a module's defaults. When supabase-js asks for one object, rows go back as PostgREST
// answers them: the first row, or 406 PGRST116 for none.
export function routeUpstream(...layers: UpstreamRoutes[]) {
  fetchMock.mockImplementation(async (input, init) => {
    const call = toCall(input, init);
    const keys = [`${call.method} ${call.url.pathname}`, call.url.pathname];
    const route = layers.flatMap((layer) => keys.map((key) => layer[key])).find(Boolean);
    if (!route) throw new Error(`Unexpected upstream request: ${call.method} ${call.url}`);
    const result = await route(call);
    if (result instanceof Response) return result;
    const one = call.headers.get('Accept')?.includes('vnd.pgrst.object');
    if (!one || !Array.isArray(result)) return Response.json(result);
    if (!result.length) {
      return databaseError(
        'PGRST116',
        'JSON object requested, multiple (or no) rows returned',
        406
      );
    }
    return Response.json(result[0]);
  });
}

export const mockUpstream = (...layers: UpstreamRoutes[]) =>
  routeUpstream(...layers, signedInUserRoutes, membershipRoutes);

export const callsTo = (pathname: string, method?: string) =>
  fetchMock.mock.calls
    .map(([input, init]) => toCall(input, init))
    .filter((call) => call.url.pathname === pathname && (!method || call.method === method));
