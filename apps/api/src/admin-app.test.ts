import { apiErrorResponseSchema, currentUserSchema } from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAdminApp } from './admin-app';
import { accessTokenAt } from './lib/access-token.fixture';
import { apiRequest } from './test/request';
import { fetchMock, routeUpstream, stubFetch, testEnv, testUser } from './test/upstream';

const env = testEnv();

const user = { ...testUser, app_metadata: { provider: 'email', role: 'admin' } };

const member = {
  ...user,
  app_metadata: { provider: 'email' },
  // Anyone can write user_metadata, so a role there grants nothing.
  user_metadata: { role: 'admin' },
};

const token = (aal: 'aal1' | 'aal2') => accessTokenAt(aal, user.id);

function mockAuth(answer: () => Response) {
  routeUpstream({ '/auth/v1/user': answer });
}

const requestAdmin = (accessToken: string | null = null, path = '/admin/me') =>
  apiRequest(path, { app: createAdminApp(), token: accessToken, client: null }, env);

stubFetch();

afterEach(() => {
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
    const response = await requestAdmin(token('aal2'));
    expect(response.status).toBe(401);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('unauthorized');
  });

  it('refuses a member without the admin claim, whatever the second factor', async () => {
    mockAuth(() => Response.json(member));
    const response = await requestAdmin(token('aal2'));
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('forbidden');
  });

  it('refuses an admin whose session has not passed a second factor', async () => {
    mockAuth(() => Response.json(user));
    const response = await requestAdmin(token('aal1'));
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      error: 'forbidden',
      reason: 'aal2_required',
    });
  });

  it('answers an admin with a second factor with their identity only', async () => {
    mockAuth(() => Response.json(user));
    const response = await requestAdmin(token('aal2'));
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
    expect((await requestAdmin(null, '/admin/missing')).status).toBe(401);
  });
});

it('keeps admin routes off the public API', async () => {
  mockAuth(() => Response.json(user));
  const response = await apiRequest('/admin/me', { token: token('aal2') }, env);
  expect(response.status).toBe(404);
});
