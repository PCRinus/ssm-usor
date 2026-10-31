import { meResponseSchema, profileSchema, supportIdentitySchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_123456',
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };
const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM' };
const profileRow = {
  full_name: 'Ana Popescu',
  professional_title: null as string | null,
  terms_version: '2026-09',
  terms_accepted_at: '2026-09-18T10:00:00+00:00',
};

const trialRow = {
  plan: 'profesional',
  status: 'trialing',
  trial_ends_at: '2026-11-25T10:00:00+00:00',
  access_until: '2026-11-25T10:00:00+00:00',
  stripe_subscription_id: null as string | null,
  created_at: '2026-10-26T10:00:00+00:00',
};

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream({
  profile = profileRow as typeof profileRow | null,
  member = true,
  memberUserId = user.id,
  subscription = null as typeof trialRow | null,
  access = 'full',
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json({ ...user, is_anonymous: false });
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json(
        member
          ? [{ user_id: memberUserId, organization_id: organization.id, role: 'owner', access }]
          : []
      );
    }
    if (url.pathname === '/rest/v1/subscriptions') {
      return Response.json(
        url.searchParams.get('organization_id') === `eq.${organization.id}` ? subscription : null
      );
    }
    if (url.pathname === '/rest/v1/rpc/credit_balance') {
      return Response.json({ granted: 0, used: 640, shortfall: 0, balance: 860, gift_left: 8640 });
    }
    if (url.pathname === '/rest/v1/rpc/sms_period_usage') {
      return Response.json({ used: 252, overage: 0, granted: 0 });
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
    if (url.pathname === '/rest/v1/organizations') {
      // The policies show a participant other organizations too; only the membership's answers.
      return Response.json(
        url.searchParams.get('id') === `eq.${organization.id}` ? organization : null
      );
    }
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

const request = (path: string, init: RequestInit = {}, bindings = env) =>
  createApp().request(
    path,
    { ...init, headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } },
    bindings
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
        professionalTitle: null,
        termsVersion: '2026-09',
        termsAcceptedAt: '2026-09-18T10:00:00.000Z',
      },
      membership: { organization, role: 'owner' },
      impersonation: null,
      subscription: null,
      smsThisMonth: null,
      creditsThisMonth: null,
    });
  });

  it('reports a trial with its end and full access', async () => {
    mockUpstream({ subscription: trialRow });

    const response = await request('/me');

    expect(meResponseSchema.parse(await response.json()).subscription).toEqual({
      plan: 'profesional',
      planChosen: false,
      status: 'trialing',
      trialEndsAt: '2026-11-25T10:00:00.000Z',
      accessUntil: '2026-11-25T10:00:00.000Z',
      access: 'full',
      deletesAt: null,
    });
  });

  it('names the plan chosen during a trial, which carries on until the first charge', async () => {
    mockUpstream({
      subscription: { ...trialRow, plan: 'start', stripe_subscription_id: 'sub_123' },
    });

    const response = await request('/me');

    expect(meResponseSchema.parse(await response.json()).subscription).toMatchObject({
      plan: 'start',
      planChosen: true,
      status: 'trialing',
    });
  });

  it('reports when a read-only organization is deleted, 30 days after its access ended', async () => {
    mockUpstream({ subscription: trialRow, access: 'read_only' });

    const response = await request('/me');

    expect(meResponseSchema.parse(await response.json()).subscription).toMatchObject({
      access: 'read_only',
      deletesAt: '2026-12-25T10:00:00.000Z',
    });
  });

  describe("the month's signing codes by SMS", () => {
    const paidRow = {
      ...trialRow,
      plan: 'profesional',
      status: 'active',
      created_at: '2026-09-14T09:00:00+00:00',
      stripe_subscription_id: 'sub_123',
      stripe_customer_id: 'cus_123',
      tester_allowances: false,
      first_paid_at: '2026-10-14T09:00:00+00:00',
      billing_anchor_at: '2026-10-14T09:00:00+00:00',
      current_period_end: '2026-11-14T09:00:00+00:00',
      sms_cap_factor: 3,
    };

    it('counts them, and the credits, as the Abonament tab does, for the bar on every page', async () => {
      mockUpstream({ subscription: paidRow });

      const response = await request('/me');

      const me = meResponseSchema.parse(await response.json());
      expect(me.smsThisMonth).toMatchObject({ used: 252, included: 300, cap: 900, state: 'near' });
      expect(me.creditsThisMonth).toMatchObject({
        used: 640,
        included: 1500,
        left: 860,
        giftLeft: 8640,
        state: 'ok',
      });
    });

    it('says none goes during a trial without a plan', async () => {
      mockUpstream({ subscription: trialRow });

      const response = await request('/me');

      const me = meResponseSchema.parse(await response.json());
      expect(me.smsThisMonth?.state).toBe('none');
      expect(me.creditsThisMonth).toMatchObject({ included: 300, period: 'trial' });
    });

    it('leaves the count out instead of failing the page when it cannot be read', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUpstream({ subscription: paidRow });

      const response = await request('/me', {}, { ...env, SUPABASE_SECRET_KEY: undefined });

      expect(response.status).toBe(200);
      const me = meResponseSchema.parse(await response.json());
      expect(me.smsThisMonth).toBeNull();
      expect(me.creditsThisMonth).toBeNull();
    });
  });

  it('reads the organization by the membership, not by what the policies show', async () => {
    mockUpstream();

    await request('/me');

    const organizations = fetchMock.mock.calls
      .map(([input]) => new URL(input instanceof Request ? input.url : String(input)))
      .filter((url) => url.pathname === '/rest/v1/organizations');
    expect(organizations).toHaveLength(1);
    expect(organizations[0]!.searchParams.get('id')).toBe(`eq.${organization.id}`);
  });

  it('answers an account without a membership or a profile instead of refusing it', async () => {
    mockUpstream({ profile: null, member: false });

    const response = await request('/me');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user,
      profile: null,
      membership: null,
      impersonation: null,
      subscription: null,
      smsThisMonth: null,
      creditsThisMonth: null,
    });
  });

  it('reports impersonation using the effective member while preserving the real caller', async () => {
    const targetMemberId = '9ae7d65f-fac5-4b57-9d9b-3e502febfd31';
    mockUpstream({ memberUserId: targetMemberId });

    const response = await request('/me');

    expect(meResponseSchema.parse(await response.json())).toMatchObject({
      user,
      membership: { organization },
      impersonation: { targetMemberId, targetOrganizationId: organization.id },
    });
  });
});

describe('GET /me/support-identity', () => {
  it('signs only the verified caller ID', async () => {
    mockUpstream();
    const secret = 'test-support-secret';

    const response = await request(
      '/me/support-identity',
      {},
      {
        ...env,
        POSTHOG_SUPPORT_SECRET_KEY: secret,
      }
    );

    expect(response.status).toBe(200);
    expect(supportIdentitySchema.parse(await response.json())).toEqual({
      distinctId: user.id,
      hash: '479f4b157ac17b5f3fbf9ed7a2987a43ef5140d87b950c9ccdc8e1a43a32d768',
    });
  });

  it('does not issue unsigned identities when Support is unconfigured', async () => {
    mockUpstream();

    const response = await request('/me/support-identity');

    expect(response.status).toBe(503);
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

  it('sets the professional title when given, and clears it with null', async () => {
    mockUpstream();

    for (const professionalTitle of ['  Evaluator autorizat ', null]) {
      const response = await request('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: 'Ana P.', professionalTitle }),
      });
      expect(response.status).toBe(200);
    }

    expect(profileWrites().map((write) => write.body)).toEqual([
      { full_name: 'Ana P.', professional_title: 'Evaluator autorizat' },
      { full_name: 'Ana P.', professional_title: null },
    ]);
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
