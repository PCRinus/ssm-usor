import { type AccessLevel, currentTermsVersion, type OrganizationRole } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { apiRequest } from '../../test/request';
import {
  callsTo,
  fetchMock,
  membershipRow,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
  testEnv,
  testOrganizationId as organizationId,
  testSecretKey,
  testUser as user,
} from '../../test/upstream';

const env = testEnv({
  SUPABASE_SECRET_KEY: testSecretKey,
  CORS_ORIGINS: 'https://app.ssmusor.ro',
});

const memberId = '1e8b36cc-d87a-4318-9af2-acb1f6156112';
const strangerId = '5b0d1f2e-3c4a-4b6d-8e9f-0a1b2c3d4e5f';

function mockUpstream({
  role = 'owner',
  change = () => Response.json(true),
  remove = () => Response.json(true),
  create = () => Response.json(organizationId),
  activity = () =>
    Response.json([
      { user_id: user.id, last_active_at: '2026-11-16T08:15:00+00:00' },
      { user_id: memberId, last_active_at: null },
    ]),
  subscription = (): Response => Response.json(null),
  memberCount = 2,
  invitationCount = 1,
  access = 'full',
  membership = (): unknown => [membershipRow({ role, access })],
}: {
  role?: OrganizationRole;
  change?: () => Response;
  remove?: () => Response;
  create?: () => Response;
  activity?: () => Response;
  subscription?: () => Response;
  memberCount?: number;
  invitationCount?: number;
  access?: AccessLevel;
  membership?: () => unknown;
} = {}) {
  mockSignedInUpstream({
    '/rest/v1/rpc/current_membership': membership,
    '/rest/v1/rpc/organization_member_list': () => [
      {
        user_id: user.id,
        email: user.email,
        full_name: 'Ana Popescu',
        role: 'owner',
        joined_at: '2026-09-01T10:00:00+00:00',
      },
      {
        user_id: memberId,
        email: 'ion@example.ro',
        full_name: 'Ion Ionescu',
        role: 'specialist',
        joined_at: '2026-10-01T10:00:00+00:00',
      },
    ],
    '/rest/v1/rpc/organization_member_activity': activity,
    '/rest/v1/rpc/change_organization_member_role': change,
    '/rest/v1/rpc/remove_organization_member': remove,
    '/rest/v1/rpc/create_organization': create,
    '/rest/v1/subscriptions': subscription,
    '/rest/v1/organization_members': () => counted(memberCount),
    '/rest/v1/organization_invitations': () => counted(invitationCount),
  });
}

const counted = (count: number) =>
  new Response(null, { status: 200, headers: { 'Content-Range': `*/${count}` } });

const upstreamCalls = (pathname: string) => callsTo(pathname).map(({ url }) => url);

const rpcBodies = (name: string) => callsTo(`/rest/v1/rpc/${name}`).map(({ body }) => body);

const request = (method: string, path: string, body?: unknown) =>
  apiRequest(path, { method, body }, env);

const ownMembership = () =>
  Response.json({ code: 'MEM01', message: 'own_membership' }, { status: 400 });

stubFetch();

describe('GET /organization/members', () => {
  const ana = {
    userId: user.id,
    email: user.email,
    fullName: 'Ana Popescu',
    role: 'owner',
    joinedAt: '2026-09-01T10:00:00.000Z',
  };
  const ion = {
    userId: memberId,
    email: 'ion@example.ro',
    fullName: 'Ion Ionescu',
    role: 'specialist',
    joinedAt: '2026-10-01T10:00:00.000Z',
  };

  it('lists members for a specialist without anyone’s activity, never asking for it', async () => {
    mockUpstream({ role: 'specialist' });

    const response = await request('GET', '/organization/members');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [ana, ion] });
    expect(rpcBodies('organization_member_activity')).toHaveLength(0);
  });

  it('gives an owner each member’s last activity, null for one who never signed in', async () => {
    mockUpstream();

    const response = await request('GET', '/organization/members');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        { ...ana, lastActiveAt: '2026-11-16T08:15:00.000Z' },
        { ...ion, lastActiveAt: null },
      ],
    });
  });

  it('attaches activity only to members of the list, ignoring any other account', async () => {
    mockUpstream({
      activity: () =>
        Response.json([{ user_id: strangerId, last_active_at: '2026-11-16T08:15:00+00:00' }]),
    });

    const response = await request('GET', '/organization/members');
    const body = (await response.json()) as {
      items: { userId: string; lastActiveAt: string | null }[];
    };

    expect(body.items.map((member) => member.userId)).toEqual([user.id, memberId]);
    expect(body.items.every((member) => member.lastActiveAt === null)).toBe(true);
  });

  it('fails rather than answering without the activity it was asked for', async () => {
    mockUpstream({
      activity: () => Response.json({ code: '42501', message: 'denied' }, { status: 403 }),
    });

    const response = await request('GET', '/organization/members');

    expect(response.status).not.toBe(200);
  });
});

describe('GET /organization/seats', () => {
  const subscriptionRow = (fields: Record<string, unknown>) => () =>
    Response.json({
      organization_id: organizationId,
      plan: 'start',
      status: 'active',
      trial_ends_at: null,
      stripe_subscription_id: 'sub_1',
      employee_step: 250,
      ...fields,
    });

  it('counts the members and the open invitations, as the invite check does, for any member', async () => {
    mockUpstream({ role: 'specialist', subscription: subscriptionRow({}) });

    const response = await request('GET', '/organization/seats');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: 2,
      invitations: 1,
      limit: 3,
      canUpgrade: true,
    });
    const [members] = upstreamCalls('/rest/v1/organization_members');
    expect(members?.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
    const [invitations] = upstreamCalls('/rest/v1/organization_invitations');
    expect(invitations?.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(invitations?.searchParams.get('accepted_at')).toBe('is.null');
    expect(invitations?.searchParams.get('revoked_at')).toBe('is.null');
    expect(invitations?.searchParams.get('expires_at')).toMatch(/^gt\./);
  });

  it('never asks Stripe, so a paid plan answers from the database alone', async () => {
    mockUpstream({ subscription: subscriptionRow({}) });

    const response = await request('GET', '/organization/seats');

    expect(response.status).toBe(200);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes('stripe.com'))
    ).toHaveLength(0);
  });

  it('offers no upgrade from a trial, Profesional, a canceled Start or a read-only account', async () => {
    const trialEnds = new Date(Date.now() + 86_400_000).toISOString();
    for (const [fields, access] of [
      [{ status: 'trialing', trial_ends_at: trialEnds }, 'full'],
      [{ plan: 'profesional', employee_step: 500 }, 'full'],
      [{ status: 'canceled' }, 'full'],
      [{ stripe_subscription_id: null, employee_step: null }, 'full'],
      [{}, 'read_only'],
    ] as const) {
      fetchMock.mockReset();
      mockUpstream({ subscription: subscriptionRow(fields), access });

      const body = (await (await request('GET', '/organization/seats')).json()) as {
        canUpgrade: boolean;
      };

      expect(body.canUpgrade).toBe(false);
    }
  });

  it('has no limit without a subscription', async () => {
    mockUpstream({ memberCount: 4, invitationCount: 0 });

    expect(await (await request('GET', '/organization/seats')).json()).toEqual({
      members: 4,
      invitations: 0,
      limit: null,
      canUpgrade: false,
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
    const response = await apiRequest(
      `/organization/members/${memberId}`,
      {
        method: 'OPTIONS',
        token: null,
        client: null,
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
    termsVersion: currentTermsVersion,
    acceptsSpecialClauses: true,
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
        accepted_terms_version: currentTermsVersion,
        accepts_special_clauses: true,
      },
    ]);
  });

  it('creates one for an account that belongs to no organization yet', async () => {
    mockUpstream({ membership: () => [] });

    const response = await request('POST', '/organization', body);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      organization: { id: organizationId, name: 'Protect SSM SRL' },
      role: 'owner',
    });
    expect(rpcBodies('create_organization')).toHaveLength(1);
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
    [{ acceptsSpecialClauses: false }, 'acceptsSpecialClauses'],
  ])('rejects %o before calling the database', async (override, path) => {
    mockUpstream();

    const response = await request('POST', '/organization', { ...body, ...override });

    expect(response.status).toBe(400);
    const { issues } = (await response.json()) as { issues: { path: string }[] };
    expect(issues.map((issue) => issue.path)).toContain(path);
    expect(rpcBodies('create_organization')).toEqual([]);
  });
});
