import type { Session } from '@supabase/supabase-js';
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import { type AdminRuntime, createAdminRuntime } from '@/app/admin-runtime';
import App from '@/app/App';
import type { AuthClient } from '@/features/auth/auth-store';
import { createQueryClient } from '@/lib/query-client';

const encode = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function adminSession(aal: 'aal1' | 'aal2', factor?: 'verified' | 'unverified'): Session {
  return {
    access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: 'user-1', aal })}.signature`,
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      app_metadata: { role: 'admin' },
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-11-04T08:00:00Z',
      email: 'mircea@example.ro',
      factors: factor
        ? [
            {
              id: 'factor-1',
              factor_type: 'totp',
              status: factor,
              created_at: '2026-11-04T08:00:00Z',
              updated_at: '2026-11-04T08:00:00Z',
            },
          ]
        : [],
    },
  } as Session;
}

const session = adminSession('aal2', 'verified');

export const authClient = {
  getSession: vi.fn(async () => ({ data: { session }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  mfa: {
    listFactors: vi.fn(async () => ({ data: { all: session.user.factors ?? [] }, error: null })),
    unenroll: vi.fn(),
    enroll: vi.fn(),
    challengeAndVerify: vi.fn(),
  },
} as unknown as AuthClient;

const runtimes: AdminRuntime[] = [];

export function mountAdmin(path: string, client: AuthClient = authClient) {
  const runtime = createAdminRuntime(
    client,
    createQueryClient(),
    createMemoryHistory({ initialEntries: [path] }),
    'http://localhost:5176'
  );
  runtimes.push(runtime);
  render(<App runtime={runtime} />);
  return runtime;
}

export const disposeAdmins = () => runtimes.splice(0).forEach((runtime) => runtime.dispose());

export type AdminRoute = (
  url: URL,
  init: RequestInit | undefined
) => Response | Promise<Response> | undefined;

export const fetchMock = vi.fn<typeof fetch>();

const unexpectedRequests: string[] = [];

export const takeUnexpectedRequests = () => unexpectedRequests.splice(0);

export function mockAdminApi(route: AdminRoute) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const answer = route(url, init);
    if (answer) return answer;
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/impersonation' && method === 'GET') {
      return Response.json({ impersonation: null });
    }
    if (url.pathname === '/api/me' && method === 'GET') {
      return Response.json({ id: session.user.id, email: session.user.email });
    }
    unexpectedRequests.push(`${method} ${url.pathname}`);
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  });
}

export function installAdminFetch() {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    disposeAdmins();
    vi.unstubAllGlobals();
    // React Query retries a failed request and the page shows its error state, so a throw alone
    // never fails the test.
    expect(takeUnexpectedRequests(), 'requests nobody routed').toEqual([]);
  });
}

// The strip on every page polls /api/impersonation, so a log without a path leaves it out.
export function adminRequests({ pathname, method }: { pathname?: string; method?: string } = {}) {
  return fetchMock.mock.calls
    .map(([input, init]) => ({
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    }))
    .filter(
      (request) =>
        (pathname === undefined
          ? request.url.pathname !== '/api/impersonation'
          : request.url.pathname === pathname) &&
        (method === undefined || request.method === method)
    );
}
