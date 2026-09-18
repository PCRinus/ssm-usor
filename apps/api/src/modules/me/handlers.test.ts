import { meResponseSchema, profileSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };
const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM' };
const profileRow = {
  full_name: 'Ana Popescu',
  terms_version: '2026-09',
  terms_accepted_at: '2026-09-18T10:00:00+00:00',
};

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream({ profile = profileRow as typeof profileRow | null, member = true } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ ...user, is_anonymous: false });
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json(
        member ? [{ user_id: user.id, organization_id: organization.id, role: 'owner' }] : []
      );
    }
    if (url.pathname === '/rest/v1/rpc/my_open_invitations') {
      return Response.json([
        {
          organization_name: 'Alt SSM SRL',
          inviter_name: null,
          role: 'specialist',
          expires_at: '2026-09-25T10:00:00+00:00',
        },
      ]);
    }
    if (url.pathname === '/rest/v1/organizations')
      return Response.json(member ? organization : null);
    if (url.pathname === '/rest/v1/profiles') {
      if (init?.method === 'GET') return Response.json(profile);
      if (init?.method === 'PATCH')
        return Response.json(profile && { ...profile, full_name: 'Ana P.' });
      if (init?.method === 'POST')
        return Response.json({
          ...profileRow,
          full_name: 'Ana P.',
          terms_version: null,
          terms_accepted_at: null,
        });
    }
    throw new Error(`Unexpected upstream request: ${init?.method} ${url}`);
  });
}

const request = (path: string, init: RequestInit = {}) =>
  createApp().request(
    path,
    { ...init, headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } },
    env
  );

const profileWrites = () =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) => String(input).includes('/rest/v1/profiles') && init?.method !== 'GET'
    )
    .map(([input, init]) => ({
      method: init?.method,
      url: new URL(String(input)),
      body: JSON.parse(init?.body as string),
    }));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /me', () => {
  it('returns the profile and the organization with the role', async () => {
    mockUpstream();

    const response = await request('/me');

    expect(response.status).toBe(200);
    expect(meResponseSchema.parse(await response.json())).toEqual({
      user,
      profile: {
        fullName: 'Ana Popescu',
        termsVersion: '2026-09',
        termsAcceptedAt: '2026-09-18T10:00:00.000Z',
      },
      membership: { organization, role: 'owner' },
    });
  });

  it('answers an account without a membership or a profile instead of refusing it', async () => {
    mockUpstream({ profile: null, member: false });

    const response = await request('/me');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user, profile: null, membership: null });
  });
});

describe('PATCH /me/profile', () => {
  it('renames the caller, touching only their own row and only the name', async () => {
    mockUpstream();

    const response = await request('/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: '  Ana P.  ' }),
    });

    expect(response.status).toBe(200);
    expect(profileSchema.parse(await response.json()).fullName).toBe('Ana P.');
    const [write, ...rest] = profileWrites();
    expect(rest).toEqual([]);
    expect(write?.method).toBe('PATCH');
    expect(write?.url.searchParams.get('user_id')).toBe(`eq.${user.id}`);
    expect(write?.body).toEqual({ full_name: 'Ana P.' });
  });

  it('creates the profile for an account that has none', async () => {
    mockUpstream({ profile: null });

    const response = await request('/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Ana P.' }),
    });

    expect(response.status).toBe(200);
    expect(profileWrites().map((write) => [write.method, write.body])).toEqual([
      ['PATCH', { full_name: 'Ana P.' }],
      ['POST', { user_id: user.id, full_name: 'Ana P.' }],
    ]);
  });

  it('rejects a name that is too short', async () => {
    mockUpstream();

    const response = await request('/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: ' A ' }),
    });

    expect(response.status).toBe(400);
    expect(profileWrites()).toEqual([]);
  });
});

describe('GET /me/invitations', () => {
  it('lists open invitations for the caller without an id or a token', async () => {
    mockUpstream({ member: false });

    const response = await request('/me/invitations');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          organizationName: 'Alt SSM SRL',
          inviterName: null,
          role: 'specialist',
          expiresAt: '2026-09-25T10:00:00.000Z',
        },
      ],
    });
  });
});
