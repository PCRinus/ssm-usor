import type { MailService } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import { hashToken } from '../../lib/tokens';

const sendOrganizationInvitation = vi.fn<MailService['sendOrganizationInvitation']>();

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
  APP_ORIGIN: 'https://app.example.ro',
  MAIL: {
    sendWaitlistConfirmation: vi.fn(),
    sendOrganizationInvitation,
    sendPasswordReset: vi.fn(),
  },
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };
const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const invitationId = '7a0e4c7e-4a59-4f8e-8d1e-3f1f6f0b9a11';
const newUserId = '1e8b36cc-d87a-4318-9af2-acb1f6156112';

const invitationRow = {
  id: invitationId,
  email: 'ion@example.ro',
  role: 'specialist',
  sent_at: null as string | null,
  expires_at: '2099-01-08T10:00:00+00:00',
  created_at: '2099-01-01T10:00:00+00:00',
};

const lookupRow = {
  organization_name: 'Protect SSM',
  email: 'ion@example.ro',
  role: 'specialist',
  status: 'open',
  inviter_name: 'Ana Popescu',
  account_exists: false,
  expires_at: '2099-01-08T10:00:00+00:00',
};

const databaseError = (code: string, message: string) =>
  Response.json({ code, message, details: null, hint: null }, { status: 400 });

// What Supabase answers; each test overrides the parts it cares about.
const upstreamDefaults = {
  role: 'owner',
  create: () => Response.json([invitationRow]),
  invitations: () => Response.json([invitationRow]),
  invitation: () => Response.json({ email: invitationRow.email, role: invitationRow.role }),
  revoke: () => Response.json(true),
  lookup: () => Response.json([lookupRow]),
  createUser: () => Response.json({ id: newUserId, email: lookupRow.email }),
  acceptAs: () => Response.json(organizationId),
  join: () => Response.json(organizationId),
  profile: () => Response.json({ user_id: user.id, full_name: 'Ana Popescu' }),
};

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(overrides: Partial<typeof upstreamDefaults> = {}) {
  const upstream = { ...upstreamDefaults, ...overrides };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json({ ...user, is_anonymous: false });
      case '/auth/v1/admin/users':
        return upstream.createUser();
      case `/auth/v1/admin/users/${newUserId}`:
        return Response.json({});
      case '/rest/v1/rpc/current_membership':
        return Response.json([
          { user_id: user.id, organization_id: organizationId, role: upstream.role },
        ]);
      case '/rest/v1/rpc/create_organization_invitation':
        return upstream.create();
      case '/rest/v1/rpc/revoke_organization_invitation':
        return upstream.revoke();
      case '/rest/v1/rpc/organization_invitation_by_token':
        return upstream.lookup();
      case '/rest/v1/rpc/accept_invitation_as':
        return upstream.acceptAs();
      case '/rest/v1/rpc/accept_organization_invitation':
        return upstream.join();
      case '/rest/v1/organizations':
        return Response.json({ name: 'Protect SSM' });
      case '/rest/v1/profiles':
        return upstream.profile();
      case '/rest/v1/organization_invitations':
        if (method === 'PATCH') return new Response(null, { status: 204 });
        return url.searchParams.has('id') ? upstream.invitation() : upstream.invitations();
    }
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const calls = (pathname: string, method?: string) =>
  fetchMock.mock.calls
    .filter(([input, init]) => {
      const url = new URL(String(input));
      return url.pathname === pathname && (!method || (init?.method ?? 'GET') === method);
    })
    .map(([input, init]) => ({
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }));

const request = (
  path: string,
  body?: unknown,
  { signedIn = true, targetEnv = env, method = body === undefined ? 'GET' : 'POST' } = {}
) =>
  createApp().request(
    path,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(signedIn ? { Authorization: 'Bearer user-token' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    targetEnv
  );

const reasonOf = async (response: Response) =>
  ((await response.json()) as { reason?: string }).reason;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  sendOrganizationInvitation.mockReset().mockResolvedValue({ id: 'msg_1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /organization/invitations', () => {
  it('creates the invitation as the owner, sets the token with the secret key, and emails the link', async () => {
    mockUpstream();

    const response = await request('/organization/invitations', { email: ' Ion@Example.ro ' });

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: invitationId, email: 'ion@example.ro', status: 'open' });
    expect(body.sentAt).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain('token');

    const [create] = calls('/rest/v1/rpc/create_organization_invitation');
    expect(create?.body).toEqual({ invitee_email: 'ion@example.ro', invitee_role: 'specialist' });
    expect(create?.headers.get('Authorization')).toBe('Bearer user-token');

    const [email] = sendOrganizationInvitation.mock.calls[0]!;
    expect(email).toMatchObject({
      to: 'ion@example.ro',
      organizationName: 'Protect SSM',
      inviterName: 'Ana Popescu',
      expiresAt: '2099-01-08T10:00:00.000Z',
    });
    const acceptUrl = new URL(email.acceptUrl);
    expect(acceptUrl.origin + acceptUrl.pathname).toBe('https://app.example.ro/accept-invitation');

    const [hashed, marked] = calls('/rest/v1/organization_invitations', 'PATCH');
    expect(hashed?.body).toEqual({
      token_hash: await hashToken(acceptUrl.searchParams.get('token')!),
    });
    expect(hashed?.headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
    expect(hashed?.url.searchParams.get('id')).toBe(`eq.${invitationId}`);
    expect(marked?.body).toEqual({ sent_at: body.sentAt });
  });

  it('refuses a specialist before touching the database', async () => {
    mockUpstream({ role: 'specialist' });

    const response = await request('/organization/invitations', { email: 'ion@example.ro' });

    expect(response.status).toBe(403);
    expect(calls('/rest/v1/rpc/create_organization_invitation')).toEqual([]);
  });

  it.each([
    ['INV01', 'already_member', 'already_member'],
    ['INV02', 'too_many_open_invitations', 'too_many_open_invitations'],
  ])('answers 409 with a reason for %s', async (code, message, reason) => {
    mockUpstream({ create: () => databaseError(code, message) });

    const response = await request('/organization/invitations', { email: 'ion@example.ro' });

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe(reason);
    expect(sendOrganizationInvitation).not.toHaveBeenCalled();
  });

  it('does not email an address twice within 10 minutes, and keeps the earlier link', async () => {
    const sentAt = new Date(Date.now() - 9 * 60 * 1000).toISOString();
    mockUpstream({ create: () => Response.json([{ ...invitationRow, sent_at: sentAt }]) });

    const response = await request('/organization/invitations', { email: 'ion@example.ro' });

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('sent_recently');
    expect(sendOrganizationInvitation).not.toHaveBeenCalled();
    expect(calls('/rest/v1/organization_invitations', 'PATCH')).toEqual([]);
  });

  it('answers 503 when the email fails, leaving the sent time so a retry works', async () => {
    mockUpstream();
    sendOrganizationInvitation.mockRejectedValue(new Error('Resend rejected the email'));

    const response = await request('/organization/invitations', { email: 'ion@example.ro' });

    expect(response.status).toBe(503);
    const patches = calls('/rest/v1/organization_invitations', 'PATCH');
    expect(patches.map((patch) => Object.keys(patch.body))).toEqual([['token_hash']]);
  });

  it.each(['MAIL', 'SUPABASE_SECRET_KEY'] as const)(
    'answers 503 without creating anything when %s is missing',
    async (missing) => {
      mockUpstream();

      const response = await request(
        '/organization/invitations',
        { email: 'ion@example.ro' },
        { targetEnv: { ...env, [missing]: undefined } }
      );

      expect(response.status).toBe(503);
      expect(calls('/rest/v1/rpc/create_organization_invitation')).toEqual([]);
    }
  );
});

describe('owner routes for an existing invitation', () => {
  const post = { method: 'POST' };

  it('lists pending invitations without ever selecting the token hash', async () => {
    const expired = { ...invitationRow, id: newUserId, expires_at: '2020-01-01T00:00:00+00:00' };
    mockUpstream({ invitations: () => Response.json([invitationRow, expired]) });

    const response = await request('/organization/invitations');

    expect(response.status).toBe(200);
    const { items } = (await response.json()) as { items: { status: string }[] };
    expect(items.map((item) => item.status)).toEqual(['open', 'expired']);
    const [list] = calls('/rest/v1/organization_invitations', 'GET');
    expect(list?.url.searchParams.get('select')).not.toContain('token_hash');
    expect(list?.url.searchParams.get('accepted_at')).toBe('is.null');
    expect(list?.url.searchParams.get('revoked_at')).toBe('is.null');
  });

  it('resends by renewing the invitation for the stored address and role', async () => {
    mockUpstream({ invitation: () => Response.json({ email: 'ion@example.ro', role: 'owner' }) });

    const response = await request(
      `/organization/invitations/${invitationId}/resend`,
      undefined,
      post
    );

    expect(response.status).toBe(200);
    expect(calls('/rest/v1/rpc/create_organization_invitation')[0]?.body).toEqual({
      invitee_email: 'ion@example.ro',
      invitee_role: 'owner',
    });
    expect(sendOrganizationInvitation).toHaveBeenCalledOnce();
  });

  it('answers 404 when resending an invitation that is not pending', async () => {
    mockUpstream({ invitation: () => Response.json(null) });

    const response = await request(
      `/organization/invitations/${invitationId}/resend`,
      undefined,
      post
    );

    expect(response.status).toBe(404);
    expect(sendOrganizationInvitation).not.toHaveBeenCalled();
  });

  it('revokes, and answers 404 when there was nothing to revoke', async () => {
    mockUpstream();
    expect(
      (await request(`/organization/invitations/${invitationId}/revoke`, undefined, post)).status
    ).toBe(204);
    expect(calls('/rest/v1/rpc/revoke_organization_invitation')[0]?.body).toEqual({
      invitation_id: invitationId,
    });

    mockUpstream({ revoke: () => Response.json(false) });
    expect(
      (await request(`/organization/invitations/${invitationId}/revoke`, undefined, post)).status
    ).toBe(404);
  });
});

describe('POST /invitations/lookup', () => {
  it('describes the invitation to anyone holding the token, looking it up by hash', async () => {
    mockUpstream();

    const response = await request('/invitations/lookup', { token: 'tok' }, { signedIn: false });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organizationName: 'Protect SSM',
      email: 'ion@example.ro',
      role: 'specialist',
      status: 'open',
      inviterName: 'Ana Popescu',
      accountExists: false,
      expiresAt: '2099-01-08T10:00:00.000Z',
    });
    const [lookup] = calls('/rest/v1/rpc/organization_invitation_by_token');
    expect(lookup?.body).toEqual({ invitation_token_hash: await hashToken('tok') });
    expect(lookup?.headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
  });

  it('answers 404 for an unknown token', async () => {
    mockUpstream({ lookup: () => Response.json([]) });

    const response = await request('/invitations/lookup', { token: 'nope' }, { signedIn: false });

    expect(response.status).toBe(404);
  });
});

describe('POST /invitations/accept', () => {
  const body = {
    token: 'tok',
    fullName: 'Ion Ionescu',
    password: 'Parola123',
    termsVersion: '2026-09',
  };
  const accept = (overrides: Partial<typeof body> = {}) =>
    request('/invitations/accept', { ...body, ...overrides }, { signedIn: false });

  it('creates a confirmed account for the invited address and joins the organization', async () => {
    mockUpstream();

    const response = await accept();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ organizationId, email: 'ion@example.ro' });
    expect(calls('/auth/v1/admin/users', 'POST')[0]?.body).toEqual({
      email: 'ion@example.ro',
      password: 'Parola123',
      email_confirm: true,
    });
    expect(calls('/rest/v1/rpc/accept_invitation_as')[0]?.body).toEqual({
      invitation_token_hash: await hashToken('tok'),
      accepting_user_id: newUserId,
      new_full_name: 'Ion Ionescu',
      accepted_terms_version: '2026-09',
    });
  });

  it.each([
    [{ ...lookupRow, status: 'expired' }, 'invitation_expired'],
    [{ ...lookupRow, status: 'revoked' }, 'invitation_revoked'],
    [{ ...lookupRow, status: 'accepted' }, 'invitation_accepted'],
    [{ ...lookupRow, account_exists: true }, 'account_exists'],
  ])('answers 409 without creating an account: %#', async (row, reason) => {
    mockUpstream({ lookup: () => Response.json([row]) });

    const response = await accept();

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe(reason);
    expect(calls('/auth/v1/admin/users', 'POST')).toEqual([]);
  });

  it('deletes the account it created when joining fails', async () => {
    mockUpstream({ acceptAs: () => databaseError('INV03', 'revoked') });

    const response = await accept();

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('invitation_revoked');
    expect(calls(`/auth/v1/admin/users/${newUserId}`, 'DELETE')).toHaveLength(1);
  });

  it('treats an account created in the meantime as an existing account', async () => {
    mockUpstream({
      createUser: () =>
        Response.json({ code: 422, error_code: 'email_exists', msg: 'exists' }, { status: 422 }),
    });

    const response = await accept();

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('account_exists');
  });

  it.each([
    [{ password: 'parola123' }, 'password'],
    [{ password: 'Scurt1' }, 'password'],
    [{ fullName: ' I ' }, 'fullName'],
    [{ termsVersion: '2020-01' }, 'termsVersion'],
  ])('rejects %o before any upstream call', async (override, path) => {
    mockUpstream();

    const response = await accept(override as Partial<typeof body>);

    expect(response.status).toBe(400);
    const { issues } = (await response.json()) as { issues: { path: string }[] };
    expect(issues.map((issue) => issue.path)).toContain(path);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /invitations/join', () => {
  const body = { token: 'tok', termsVersion: '2026-09' };

  it('accepts as the signed-in user, without the secret key', async () => {
    mockUpstream();

    const response = await request('/invitations/join', body, {
      targetEnv: { ...env, SUPABASE_SECRET_KEY: undefined },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ organizationId, email: user.email });
    const [join] = calls('/rest/v1/rpc/accept_organization_invitation');
    expect(join?.body).toEqual({
      invitation_token_hash: await hashToken('tok'),
      accepted_terms_version: '2026-09',
    });
    expect(join?.headers.get('Authorization')).toBe('Bearer user-token');
  });

  it('asks for a name when the account has no profile', async () => {
    mockUpstream({ profile: () => Response.json(null) });

    const response = await request('/invitations/join', body);

    expect(response.status).toBe(400);
    expect(await reasonOf(response)).toBe('full_name_required');
    expect(calls('/rest/v1/rpc/accept_organization_invitation')).toEqual([]);
  });

  it.each([
    ['INV04', 'email_mismatch', 403, 'email_mismatch'],
    ['INV05', 'already_in_organization', 409, 'already_in_organization'],
    ['INV03', 'expired', 409, 'invitation_expired'],
    ['INV03', 'not_found', 404, undefined],
  ])('translates %s %s', async (code, message, status, reason) => {
    mockUpstream({ join: () => databaseError(code, message) });

    const response = await request('/invitations/join', { ...body, fullName: 'Ion Ionescu' });

    expect(response.status).toBe(status);
    expect(await reasonOf(response)).toBe(reason);
  });

  it('requires a signed-in user', async () => {
    mockUpstream();

    const response = await request('/invitations/join', body, { signedIn: false });

    expect(response.status).toBe(401);
  });
});
