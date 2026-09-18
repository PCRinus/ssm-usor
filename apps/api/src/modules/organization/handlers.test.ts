import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CORS_ORIGINS: 'https://app.ssmusor.ro',
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };
const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const memberId = '1e8b36cc-d87a-4318-9af2-acb1f6156112';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream({
  role = 'owner',
  change = () => Response.json(true),
  remove = () => Response.json(true),
  create = () => Response.json(organizationId),
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json({ ...user, is_anonymous: false });
      case '/rest/v1/rpc/current_membership':
        return Response.json([{ user_id: user.id, organization_id: organizationId, role }]);
      case '/rest/v1/rpc/organization_member_list':
        return Response.json([
          {
            user_id: user.id,
            email: user.email,
            full_name: 'Ana Popescu',
            role: 'owner',
            joined_at: '2026-09-01T10:00:00+00:00',
          },
        ]);
      case '/rest/v1/rpc/change_organization_member_role':
        return change();
      case '/rest/v1/rpc/remove_organization_member':
        return remove();
      case '/rest/v1/rpc/create_organization':
        return create();
    }
    throw new Error(`Unexpected upstream request: ${init?.method} ${url}`);
  });
}

const rpcBodies = (name: string) =>
  fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith(`/rest/v1/rpc/${name}`))
    .map(([, init]) => JSON.parse(init?.body as string));

const request = (method: string, path: string, body?: unknown) =>
  createApp().request(
    path,
    {
      method,
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env
  );

const ownMembership = () =>
  Response.json({ code: 'MEM01', message: 'own_membership' }, { status: 400 });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /organization/members', () => {
  it('lists members for any member, specialists included', async () => {
    mockUpstream({ role: 'specialist' });

    const response = await request('GET', '/organization/members');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          userId: user.id,
          email: user.email,
          fullName: 'Ana Popescu',
          role: 'owner',
          joinedAt: '2026-09-01T10:00:00.000Z',
        },
      ],
    });
  });
});

describe('PATCH /organization/members/{userId}', () => {
  it('changes the role through the database function, as the caller', async () => {
    mockUpstream();

    const response = await request('PATCH', `/organization/members/${memberId}`, {
      role: 'owner',
    });

    expect(response.status).toBe(204);
    expect(rpcBodies('change_organization_member_role')).toEqual([
      { member_user_id: memberId, new_role: 'owner' },
    ]);
  });

  it('refuses a specialist before touching the database', async () => {
    mockUpstream({ role: 'specialist' });

    const response = await request('PATCH', `/organization/members/${memberId}`, {
      role: 'owner',
    });

    expect(response.status).toBe(403);
    expect(rpcBodies('change_organization_member_role')).toEqual([]);
  });

  it('answers 409 with a reason for the caller’s own membership', async () => {
    mockUpstream({ change: ownMembership });

    const response = await request('PATCH', `/organization/members/${user.id}`, {
      role: 'specialist',
    });

    expect(response.status).toBe(409);
    expect(((await response.json()) as { reason: string }).reason).toBe('own_membership');
  });

  it('answers 404 for someone who is not a member of the organization', async () => {
    mockUpstream({ change: () => Response.json(false) });

    const response = await request('PATCH', `/organization/members/${memberId}`, {
      role: 'owner',
    });

    expect(response.status).toBe(404);
  });

  it('rejects an unknown role', async () => {
    mockUpstream();

    const response = await request('PATCH', `/organization/members/${memberId}`, {
      role: 'admin',
    });

    expect(response.status).toBe(400);
    expect(rpcBodies('change_organization_member_role')).toEqual([]);
  });
});

describe('DELETE /organization/members/{userId}', () => {
  it('removes the member through the database function', async () => {
    mockUpstream();

    const response = await request('DELETE', `/organization/members/${memberId}`);

    expect(response.status).toBe(204);
    expect(rpcBodies('remove_organization_member')).toEqual([{ member_user_id: memberId }]);
  });

  it('refuses a specialist', async () => {
    mockUpstream({ role: 'specialist' });

    expect((await request('DELETE', `/organization/members/${memberId}`)).status).toBe(403);
    expect(rpcBodies('remove_organization_member')).toEqual([]);
  });

  it('answers 409 for the caller’s own membership and 404 for a stranger', async () => {
    mockUpstream({ remove: ownMembership });
    expect((await request('DELETE', `/organization/members/${user.id}`)).status).toBe(409);

    mockUpstream({ remove: () => Response.json(false) });
    expect((await request('DELETE', `/organization/members/${memberId}`)).status).toBe(404);
  });

  it('is allowed by CORS from the SPA', async () => {
    const response = await createApp().request(
      `/organization/members/${memberId}`,
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.ssmusor.ro',
          'Access-Control-Request-Method': 'DELETE',
        },
      },
      env
    );

    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
  });
});

describe('POST /organization', () => {
  const body = {
    organizationName: '  Protect SSM SRL ',
    fullName: ' Ana Popescu ',
    termsVersion: '2026-09',
  };
  const databaseError = (code: string, message: string) => () =>
    Response.json({ code, message }, { status: 400 });

  it('creates the organization as the caller and answers with the new membership', async () => {
    mockUpstream();

    const response = await request('POST', '/organization', body);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      organization: { id: organizationId, name: 'Protect SSM SRL' },
      role: 'owner',
    });
    expect(rpcBodies('create_organization')).toEqual([
      {
        organization_name: 'Protect SSM SRL',
        owner_full_name: 'Ana Popescu',
        accepted_terms_version: '2026-09',
      },
    ]);
  });

  it('does not ask for a membership first, since the caller has none', async () => {
    mockUpstream();

    await request('POST', '/organization', body);

    expect(rpcBodies('current_membership')).toEqual([]);
  });

  it('answers 409 with a reason for an account that already belongs to an organization', async () => {
    mockUpstream({ create: databaseError('ORG01', 'already_in_organization') });

    const response = await request('POST', '/organization', body);

    expect(response.status).toBe(409);
    expect(((await response.json()) as { reason: string }).reason).toBe('already_in_organization');
  });

  it('answers 403 with a reason for an unconfirmed email', async () => {
    mockUpstream({ create: databaseError('42501', 'email_not_confirmed') });

    const response = await request('POST', '/organization', body);

    expect(response.status).toBe(403);
    expect(((await response.json()) as { reason: string }).reason).toBe('email_not_confirmed');
  });

  it.each([
    [{ organizationName: 'X' }, 'organizationName'],
    [{ fullName: ' A ' }, 'fullName'],
    [{ termsVersion: '2020-01' }, 'termsVersion'],
  ])('rejects %o before calling the database', async (override, path) => {
    mockUpstream();

    const response = await request('POST', '/organization', { ...body, ...override });

    expect(response.status).toBe(400);
    const { issues } = (await response.json()) as { issues: { path: string }[] };
    expect(issues.map((issue) => issue.path)).toContain(path);
    expect(rpcBodies('create_organization')).toEqual([]);
  });
});
