import type { MailService, SmsService } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const sendInvitationEmail = vi.fn<MailService['sendParticipantInvitation']>();
const sendInvitationSms = vi.fn<SmsService['sendParticipantInvitation']>();

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
  PORTAL_ORIGIN: 'https://portal.example.ro',
  MAIL: {
    sendWaitlistConfirmation: vi.fn(),
    sendOrganizationInvitation: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendPasswordChanged: vi.fn(),
    sendSignupConfirmation: vi.fn(),
    sendServiceContract: vi.fn(),
    sendSignedCopyReceived: vi.fn(),
    sendParticipantInvitation: sendInvitationEmail,
    sendSignInCode: vi.fn(),
    sendSigningCode: vi.fn(),
    sendSignatureRequest: vi.fn(),
  },
  SMS: {
    sendParticipantInvitation: sendInvitationSms,
    sendSignInCode: vi.fn(),
    sendSigningCode: vi.fn(),
    sendSignatureRequest: vi.fn(),
  },
};

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ana@example.ro' };
const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const clientId = 'c1c1c1c1-0000-4000-8000-000000000001';
const employeeId = 'e1e1e1e1-0000-4000-8000-000000000001';
const invitationId = '99999999-0000-4000-8000-000000000001';
const participantId = '88888888-0000-4000-8000-000000000001';
const accountId = '1e8b36cc-d87a-4318-9af2-acb1f6156112';
const importId = '77777777-0000-4000-8000-000000000001';

const invitationRow = {
  id: invitationId,
  organization_id: organizationId,
  client_id: clientId,
  kind: 'employee',
  employee_id: employeeId,
  full_name: null as string | null,
  channel: 'email',
  address: 'ion@example.ro',
  last_sent_at: '2099-01-01T10:00:00+00:00',
  expires_at: '2099-01-31T10:00:00+00:00',
  accepted_at: null,
  revoked_at: null,
  created_at: '2099-01-01T10:00:00+00:00',
  employees: { last_name: 'Popescu', first_name: 'Ion' } as {
    last_name: string;
    first_name: string;
  } | null,
};

const participantRow = {
  id: participantId,
  client_id: clientId,
  kind: 'employee',
  employee_id: employeeId,
  full_name: null,
  created_at: '2099-01-02T10:00:00+00:00',
  revoked_at: null,
  notice_version: '2026-10-17',
  language: 'en',
  employees: { last_name: 'Popescu', first_name: 'Ion' },
  participant_invitations: [
    { channel: 'email', address: 'ion@example.ro', accepted_at: '2099-01-02T10:00:00+00:00' },
  ],
};

const databaseError = (code: string, message: string) =>
  Response.json({ code, message, details: null, hint: null }, { status: 400 });

const authUser = (appMetadata: Record<string, unknown>) =>
  Response.json({
    id: accountId,
    aud: 'authenticated',
    email: 'ion@example.ro',
    app_metadata: appMetadata,
    user_metadata: {},
    created_at: '2099-01-01T10:00:00Z',
  });

const upstreamDefaults = {
  create: () => Response.json({ ...invitationRow, employees: undefined }),
  resend: () => Response.json({ ...invitationRow, employees: undefined }),
  revokeInvitation: () => Response.json(true),
  revokeParticipant: () => Response.json(true),
  invitations: () => Response.json([invitationRow]),
  participants: () => Response.json([] as unknown[]),
  employees: () => Response.json([{ id: employeeId }]),
  updateEmployee: () => Response.json({ id: employeeId }),
  clients: () => Response.json([{ id: clientId }]),
  client: () =>
    Response.json({ organization_id: organizationId, archived_at: null, stage: 'client' }),
  imports: () => Response.json({ id: importId }),
  activeParticipants: () => Response.json([] as unknown[]),
  openInvitations: () => Response.json([] as unknown[]),
  lookup: (): Response => Response.json(null),
  createUser: () => authUser({ participant: true, provider: 'email', providers: ['email'] }),
  getUser: () => authUser({ provider: 'email', providers: ['email'] }),
  updateUser: () => authUser({ participant: true }),
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
      case `/auth/v1/admin/users/${accountId}`:
        return method === 'PUT' ? upstream.updateUser() : upstream.getUser();
      case '/rest/v1/rpc/current_membership':
        return Response.json([
          { user_id: user.id, organization_id: organizationId, role: 'specialist' },
        ]);
      case '/rest/v1/rpc/create_participant_invitation':
        return upstream.create();
      case '/rest/v1/rpc/resend_participant_invitation':
        return upstream.resend();
      case '/rest/v1/rpc/revoke_participant_invitation':
        return upstream.revokeInvitation();
      case '/rest/v1/rpc/revoke_client_participant':
        return upstream.revokeParticipant();
      case '/rest/v1/rpc/auth_user_id_by_address':
        return upstream.lookup();
      case '/rest/v1/participant_invitations':
        return url.searchParams.get('select') === 'employee_id'
          ? upstream.openInvitations()
          : upstream.invitations();
      case '/rest/v1/client_participants':
        return url.searchParams.get('select') === 'employee_id'
          ? upstream.activeParticipants()
          : upstream.participants();
      case '/rest/v1/employees':
        return method === 'PATCH' ? upstream.updateEmployee() : upstream.employees();
      case '/rest/v1/imports':
        return upstream.imports();
      case '/rest/v1/clients':
        if (url.searchParams.get('select') === 'legal_name') {
          return Response.json({ legal_name: 'S.C. CLIENT DEMO S.R.L.' });
        }
        return url.searchParams.get('select')?.includes('stage')
          ? upstream.client()
          : upstream.clients();
      case '/rest/v1/organizations':
        return Response.json({ name: 'Protect SSM' });
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

const request = (path: string, body?: unknown, targetEnv = env) =>
  createApp().request(
    path,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-token' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    targetEnv
  );

const reasonOf = async (response: Response) =>
  ((await response.json()) as { reason?: string }).reason;

const employeeInvitations = `/clients/${clientId}/employees/${employeeId}/participant-invitations`;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  sendInvitationEmail.mockReset().mockResolvedValue({ id: 'msg_1' });
  sendInvitationSms.mockReset().mockResolvedValue({ id: 'sms_1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /clients/{clientId}/employees/{employeeId}/participant-invitations', () => {
  it('saves the invitation as the member, creates the account unconfirmed and flagged, and emails the portal', async () => {
    mockUpstream();

    const response = await request(employeeInvitations, {
      channel: 'email',
      address: ' Ion@Example.ro ',
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: invitationId,
      clientId,
      kind: 'employee',
      employeeId,
      fullName: 'Popescu Ion',
      channel: 'email',
      address: 'ion@example.ro',
      status: 'open',
      lastSentAt: '2099-01-01T10:00:00.000Z',
      resendableAt: '2099-01-01T10:10:00.000Z',
      expiresAt: '2099-01-31T10:00:00.000Z',
      createdAt: '2099-01-01T10:00:00.000Z',
    });

    const [create] = calls('/rest/v1/rpc/create_participant_invitation');
    expect(create?.headers.get('Authorization')).toBe('Bearer user-token');
    expect(create?.body).toEqual({
      p_client_id: clientId,
      p_kind: 'employee',
      p_employee_id: employeeId,
      p_full_name: null,
      p_channel: 'email',
      p_address: 'ion@example.ro',
    });

    const [lookup] = calls('/rest/v1/rpc/auth_user_id_by_address');
    expect(lookup?.headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
    expect(lookup?.body).toEqual({ p_channel: 'email', p_address: 'ion@example.ro' });
    const [created] = calls('/auth/v1/admin/users', 'POST');
    expect(created?.headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
    expect(created?.body).toMatchObject({
      email: 'ion@example.ro',
      email_confirm: false,
      app_metadata: { participant: true },
    });

    expect(sendInvitationEmail).toHaveBeenCalledWith({
      to: 'ion@example.ro',
      clientName: 'S.C. CLIENT DEMO S.R.L.',
      organizationName: 'Protect SSM',
      portalUrl: 'https://portal.example.ro',
    });
    expect(sendInvitationSms).not.toHaveBeenCalled();
  });

  it('invites by SMS at the phone in E.164 and creates a phone account', async () => {
    const smsRow = { ...invitationRow, channel: 'sms', address: '+40721000002' };
    mockUpstream({
      create: () => Response.json(smsRow),
      invitations: () => Response.json([smsRow]),
    });

    const response = await request(employeeInvitations, {
      channel: 'sms',
      address: '0721 000 002',
    });

    expect(response.status).toBe(201);
    expect(calls('/rest/v1/rpc/create_participant_invitation')[0]?.body).toMatchObject({
      p_channel: 'sms',
      p_address: '+40721000002',
    });
    expect(calls('/auth/v1/admin/users', 'POST')[0]?.body).toMatchObject({
      phone: '+40721000002',
      phone_confirm: false,
      app_metadata: { participant: true },
    });
    expect(sendInvitationSms).toHaveBeenCalledWith({
      to: '+40721000002',
      clientName: 'S.C. CLIENT DEMO S.R.L.',
      organizationName: 'Protect SSM',
      portalUrl: 'https://portal.example.ro',
    });
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("reuses the address's account and adds the flag beside what its metadata holds", async () => {
    mockUpstream({
      lookup: () => Response.json(accountId),
      getUser: () => authUser({ provider: 'email', providers: ['email'], role: 'admin' }),
    });

    const response = await request(employeeInvitations, {
      channel: 'email',
      address: 'ion@example.ro',
    });

    expect(response.status).toBe(201);
    expect(calls('/auth/v1/admin/users', 'POST')).toEqual([]);
    const [updated] = calls(`/auth/v1/admin/users/${accountId}`, 'PUT');
    expect(updated?.body).toEqual({
      app_metadata: {
        provider: 'email',
        providers: ['email'],
        role: 'admin',
        participant: true,
      },
    });
    expect(sendInvitationEmail).toHaveBeenCalledOnce();
  });

  it('leaves an account that carries the flag as it is', async () => {
    mockUpstream({
      lookup: () => Response.json(accountId),
      getUser: () => authUser({ provider: 'phone', participant: true }),
    });

    expect(
      (await request(employeeInvitations, { channel: 'email', address: 'ion@example.ro' })).status
    ).toBe(201);
    expect(calls(`/auth/v1/admin/users/${accountId}`, 'PUT')).toEqual([]);
  });

  it('flags the account that appeared between the lookup and the creation', async () => {
    let lookups = 0;
    mockUpstream({
      lookup: () => Response.json(lookups++ === 0 ? null : accountId),
      createUser: () =>
        Response.json(
          {
            code: 422,
            error_code: 'email_exists',
            msg: 'A user with this email address has already been registered',
          },
          { status: 422 }
        ),
    });

    const response = await request(employeeInvitations, {
      channel: 'email',
      address: 'ion@example.ro',
    });

    expect(response.status).toBe(201);
    expect(calls(`/auth/v1/admin/users/${accountId}`, 'PUT')[0]?.body).toEqual({
      app_metadata: { provider: 'email', providers: ['email'], participant: true },
    });
  });

  it('answers 503 and sends nothing when the account cannot be prepared', async () => {
    mockUpstream({
      createUser: () => Response.json({ code: 500, msg: 'boom' }, { status: 500 }),
    });

    const response = await request(employeeInvitations, {
      channel: 'email',
      address: 'ion@example.ro',
    });

    expect(response.status).toBe(503);
    expect(await reasonOf(response)).toBe('participant_account_unavailable');
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('answers 503 when the message cannot be sent, the invitation saved', async () => {
    mockUpstream();
    sendInvitationEmail.mockRejectedValue(new Error('provider down'));

    const response = await request(employeeInvitations, {
      channel: 'email',
      address: 'ion@example.ro',
    });

    expect(response.status).toBe(503);
    expect(await reasonOf(response)).toBe('participant_message_not_sent');
    expect(calls('/rest/v1/rpc/create_participant_invitation')).toHaveLength(1);
  });

  it.each([
    ['PRT01', 'employee_has_participant', 'employee_has_participant'],
    ['PRT02', 'employee_already_invited', 'employee_already_invited'],
    ['PRT03', 'address_has_participant', 'address_has_participant'],
    ['PRT03', 'address_invited_for_another_person', 'address_invited_for_another_person'],
    ['PRT04', 'address_not_of_employee', 'address_not_of_employee'],
    ['PRT05', 'resend_too_soon', 'sent_recently'],
    ['CLA01', 'An archived client is not changed.', 'client_archived'],
    ['CLL01', 'A lead has no safety records; promote it first.', 'client_is_lead'],
  ])('answers 409 for %s (%s) and touches no account', async (code, message, reason) => {
    mockUpstream({ create: () => databaseError(code, message) });

    const response = await request(employeeInvitations, {
      channel: 'email',
      address: 'ion@example.ro',
    });

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe(reason);
    expect(calls('/rest/v1/rpc/auth_user_id_by_address')).toEqual([]);
    expect(calls('/auth/v1/admin/users', 'POST')).toEqual([]);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('answers 404 for an employee who is not of the client', async () => {
    mockUpstream({ create: () => databaseError('P0002', 'employee_not_found') });

    const response = await request(employeeInvitations, {
      channel: 'sms',
      address: '+40721000002',
    });

    expect(response.status).toBe(404);
  });

  it('refuses an address that is not of its channel before the database', async () => {
    mockUpstream();

    const response = await request(employeeInvitations, {
      channel: 'sms',
      address: 'ion@example.ro',
    });

    expect(response.status).toBe(400);
    expect(calls('/rest/v1/rpc/create_participant_invitation')).toEqual([]);
  });

  it('answers 503 before saving anything when the channel has no sender', async () => {
    mockUpstream();

    const response = await request(
      employeeInvitations,
      { channel: 'sms', address: '+40721000002' },
      { ...env, SMS: undefined }
    );

    expect(response.status).toBe(503);
    expect(calls('/rest/v1/rpc/create_participant_invitation')).toEqual([]);
  });
});

describe('POST /clients/{clientId}/participant-invitations', () => {
  it('invites a named client administrator at a typed address', async () => {
    const administratorRow = {
      ...invitationRow,
      kind: 'client_administrator',
      employee_id: null,
      full_name: 'Maria Pop',
      address: 'hr@client.ro',
      employees: null,
    };
    mockUpstream({
      create: () => Response.json(administratorRow),
      invitations: () => Response.json([administratorRow]),
    });

    const response = await request(`/clients/${clientId}/participant-invitations`, {
      channel: 'email',
      address: 'HR@client.ro',
      fullName: 'Maria Pop',
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      kind: 'client_administrator',
      employeeId: null,
      fullName: 'Maria Pop',
    });
    expect(calls('/rest/v1/rpc/create_participant_invitation')[0]?.body).toEqual({
      p_client_id: clientId,
      p_kind: 'client_administrator',
      p_employee_id: null,
      p_full_name: 'Maria Pop',
      p_channel: 'email',
      p_address: 'hr@client.ro',
    });
  });

  it('sends no name for an administrator who is an employee', async () => {
    mockUpstream();

    await request(`/clients/${clientId}/participant-invitations`, {
      channel: 'email',
      address: 'ion@example.ro',
      employeeId,
      fullName: 'Ignored',
    });

    expect(calls('/rest/v1/rpc/create_participant_invitation')[0]?.body).toMatchObject({
      p_employee_id: employeeId,
      p_full_name: null,
    });
  });

  it('needs a name or an employee', async () => {
    mockUpstream();

    const response = await request(`/clients/${clientId}/participant-invitations`, {
      channel: 'email',
      address: 'hr@client.ro',
    });

    expect(response.status).toBe(400);
  });
});

describe('POST /participant-invitations/{invitationId}/resend', () => {
  it('renews the invitation and sends its message again', async () => {
    mockUpstream({
      lookup: () => Response.json(accountId),
      getUser: () => authUser({ participant: true }),
    });

    const response = await request(`/participant-invitations/${invitationId}/resend`, {});

    expect(response.status).toBe(200);
    expect(calls('/rest/v1/rpc/resend_participant_invitation')[0]?.body).toEqual({
      p_invitation_id: invitationId,
    });
    expect(sendInvitationEmail).toHaveBeenCalledOnce();
  });

  it('answers 404 for an invitation the member cannot see', async () => {
    mockUpstream({ invitations: () => Response.json([]) });

    const response = await request(`/participant-invitations/${invitationId}/resend`, {});

    expect(response.status).toBe(404);
    expect(calls('/rest/v1/rpc/resend_participant_invitation')).toEqual([]);
  });

  it.each([
    ['PRT05', 'resend_too_soon', 'sent_recently'],
    ['PRT06', 'accepted', 'invitation_accepted'],
    ['PRT06', 'revoked', 'invitation_revoked'],
  ])('answers 409 for %s (%s)', async (code, message, reason) => {
    mockUpstream({ resend: () => databaseError(code, message) });

    const response = await request(`/participant-invitations/${invitationId}/resend`, {});

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe(reason);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
});

describe('revoking', () => {
  it('revokes an invitation', async () => {
    mockUpstream();
    const response = await request(`/participant-invitations/${invitationId}/revoke`, {});
    expect(response.status).toBe(204);
    expect(calls('/rest/v1/rpc/revoke_participant_invitation')[0]?.body).toEqual({
      p_invitation_id: invitationId,
    });
  });

  it('answers 404 for an invitation that was not open', async () => {
    mockUpstream({ revokeInvitation: () => Response.json(false) });
    const response = await request(`/participant-invitations/${invitationId}/revoke`, {});
    expect(response.status).toBe(404);
  });

  it('revokes a participant', async () => {
    mockUpstream();
    const response = await request(`/client-participants/${participantId}/revoke`, {});
    expect(response.status).toBe(204);
    expect(calls('/rest/v1/rpc/revoke_client_participant')[0]?.body).toEqual({
      p_participant_id: participantId,
    });
  });

  it('answers 404 for a participant already revoked', async () => {
    mockUpstream({ revokeParticipant: () => Response.json(false) });
    const response = await request(`/client-participants/${participantId}/revoke`, {});
    expect(response.status).toBe(404);
  });
});

describe('GET /clients/{clientId}/employees/{employeeId}/participant', () => {
  const path = `/clients/${clientId}/employees/${employeeId}/participant`;

  it('shows the participant with the address they sign in with, and no invitation', async () => {
    mockUpstream({ participants: () => Response.json([participantRow]) });

    const response = await request(path);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      participant: {
        id: participantId,
        clientId,
        kind: 'employee',
        employeeId,
        fullName: 'Popescu Ion',
        channel: 'email',
        address: 'ion@example.ro',
        createdAt: '2099-01-02T10:00:00.000Z',
        revokedAt: null,
        noticeVersion: '2026-10-17',
        language: 'en',
      },
      invitation: null,
    });
  });

  it('shows the pending invitation of an employee who is not a participant', async () => {
    mockUpstream();

    const body = (await (await request(path)).json()) as Record<string, unknown>;

    expect(body.participant).toBeNull();
    expect(body.invitation).toMatchObject({ id: invitationId, status: 'open' });
    const query = calls('/rest/v1/participant_invitations')[0]!.url.searchParams;
    expect(query.get('accepted_at')).toBe('is.null');
    expect(query.get('revoked_at')).toBe('is.null');
  });

  it('answers 404 for an employee who is not of the client', async () => {
    mockUpstream({ employees: () => Response.json([]) });
    expect((await request(path)).status).toBe(404);
  });
});

describe('GET /clients/{clientId}/participants', () => {
  it("lists the client's active participants and pending invitations", async () => {
    const expired = {
      ...invitationRow,
      id: '99999999-0000-4000-8000-000000000002',
      expires_at: '2000-01-01T00:00:00+00:00',
    };
    mockUpstream({
      participants: () => Response.json([participantRow]),
      invitations: () => Response.json([invitationRow, expired]),
    });

    const response = await request(`/clients/${clientId}/participants`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      participants: { id: string }[];
      invitations: { status: string }[];
    };
    expect(body.participants.map((participant) => participant.id)).toEqual([participantId]);
    expect(body.invitations.map((invitation) => invitation.status)).toEqual(['open', 'expired']);
    expect(calls('/rest/v1/client_participants')[0]!.url.searchParams.get('revoked_at')).toBe(
      'is.null'
    );
  });

  it('answers 404 for a client not of the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await request(`/clients/${clientId}/participants`)).status).toBe(404);
  });
});

describe('POST /clients/{clientId}/employee-participant-invitations', () => {
  const bulk = `/clients/${clientId}/employee-participant-invitations`;
  const newcomerId = 'e1e1e1e1-0000-4000-8000-000000000002';
  const employeeRow = (id: string, contact: { email?: string; phone?: string } = {}) => ({
    id,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    status: 'active',
  });
  const smsRow = {
    ...invitationRow,
    id: '99999999-0000-4000-8000-000000000002',
    employee_id: newcomerId,
    channel: 'sms',
    address: '+40742115980',
    employees: { last_name: 'Ilie', first_name: 'Gheorghe' },
  };

  it('saves a typed phone to the employee and invites by SMS, an address on file by email', async () => {
    let created = 0;
    mockUpstream({
      employees: () =>
        Response.json([
          employeeRow(employeeId, { email: 'ion@example.ro' }),
          employeeRow(newcomerId),
        ]),
      create: () => Response.json({ id: created++ === 0 ? invitationId : smsRow.id }),
      invitations: () => Response.json(created === 1 ? invitationRow : smsRow),
    });

    const response = await request(bulk, {
      invitations: [
        { employeeId, address: 'Ion@Example.ro' },
        { employeeId: newcomerId, address: '0742 115 980' },
      ],
    });

    expect(response.status).toBe(200);
    const { results } = (await response.json()) as {
      results: { employeeId: string; outcome: string; invitation: { channel: string } | null }[];
    };
    expect(results.map((row) => [row.employeeId, row.outcome, row.invitation?.channel])).toEqual([
      [employeeId, 'invited', 'email'],
      [newcomerId, 'invited', 'sms'],
    ]);
    const updates = calls('/rest/v1/employees', 'PATCH');
    expect(updates.map((update) => update.body)).toEqual([{ phone: '+40742115980' }]);
    expect(updates[0]?.url.searchParams.get('id')).toBe(`eq.${newcomerId}`);
    expect(updates[0]?.headers.get('Authorization')).toBe('Bearer user-token');
    expect(calls('/rest/v1/rpc/create_participant_invitation').map((call) => call.body)).toEqual([
      expect.objectContaining({
        p_employee_id: employeeId,
        p_channel: 'email',
        p_address: 'ion@example.ro',
      }),
      expect.objectContaining({
        p_employee_id: newcomerId,
        p_channel: 'sms',
        p_address: '+40742115980',
      }),
    ]);
    expect(sendInvitationEmail).toHaveBeenCalledOnce();
    expect(sendInvitationSms).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+40742115980', clientName: 'S.C. CLIENT DEMO S.R.L.' })
    );
  });

  it('skips a former employee, a participant and one invited, and names an address that is neither', async () => {
    const ids = [1, 2, 3, 4].map((n) => `e1e1e1e1-0000-4000-8000-00000000001${n}`);
    mockUpstream({
      employees: () =>
        Response.json([
          { ...employeeRow(ids[0]!), status: 'terminated' },
          employeeRow(ids[1]!),
          employeeRow(ids[2]!),
          employeeRow(ids[3]!),
        ]),
      activeParticipants: () => Response.json([{ employee_id: ids[1] }]),
      openInvitations: () => Response.json([{ employee_id: ids[2] }]),
    });

    const response = await request(bulk, {
      invitations: [
        ...ids.slice(0, 3).map((id) => ({ employeeId: id, address: 'ion@example.ro' })),
        { employeeId: ids[3], address: 'tel 0742' },
        { employeeId: employeeId, address: 'ion@example.ro' },
      ],
    });

    expect(response.status).toBe(200);
    const { results } = (await response.json()) as {
      results: { outcome: string; reason: string | null }[];
    };
    expect(results.map((row) => [row.outcome, row.reason])).toEqual([
      ['skipped', 'former_employee'],
      ['skipped', 'employee_has_participant'],
      ['skipped', 'employee_invited'],
      ['failed', 'invalid_address'],
      ['failed', 'employee_not_found'],
    ]);
    expect(calls('/rest/v1/employees', 'PATCH')).toEqual([]);
    expect(calls('/rest/v1/rpc/create_participant_invitation')).toEqual([]);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('names a refused invitation on its row and goes on with the next', async () => {
    let created = 0;
    mockUpstream({
      employees: () =>
        Response.json([
          employeeRow(employeeId, { phone: '+40742115980' }),
          employeeRow(newcomerId),
        ]),
      create: () =>
        created++ === 0
          ? databaseError('PRT03', 'address_invited_for_another_person')
          : Response.json({ id: smsRow.id }),
      invitations: () => Response.json(smsRow),
    });

    const response = await request(bulk, {
      invitations: [
        { employeeId, address: '0742115980' },
        { employeeId: newcomerId, address: '+40742115980' },
      ],
    });

    const { results } = (await response.json()) as {
      results: { outcome: string; reason: string | null }[];
    };
    expect(results.map((row) => [row.outcome, row.reason])).toEqual([
      ['failed', 'address_invited_for_another_person'],
      ['invited', null],
    ]);
    expect(sendInvitationSms).toHaveBeenCalledOnce();
  });

  it('keeps the invitation whose message failed, for a resend', async () => {
    sendInvitationSms.mockRejectedValueOnce(new Error('Twilio down'));
    mockUpstream({
      employees: () => Response.json([employeeRow(newcomerId)]),
      create: () => Response.json({ id: smsRow.id }),
      invitations: () => Response.json(smsRow),
    });

    const response = await request(bulk, {
      invitations: [{ employeeId: newcomerId, address: '0742 115 980' }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          employeeId: newcomerId,
          outcome: 'failed',
          reason: 'participant_message_not_sent',
          invitation: expect.objectContaining({
            id: smsRow.id,
            resendableAt: '2099-01-01T10:10:00.000Z',
          }),
        },
      ],
    });
  });

  it('refuses an archived client and sends nothing', async () => {
    mockUpstream({
      employees: () => Response.json([employeeRow(employeeId)]),
      client: () =>
        Response.json({
          organization_id: organizationId,
          archived_at: '2099-01-01',
          stage: 'client',
        }),
    });

    const response = await request(bulk, {
      invitations: [{ employeeId, address: 'ion@example.ro' }],
    });

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('client_archived');
    expect(calls('/rest/v1/employees', 'PATCH')).toEqual([]);
  });

  it('answers 503 when a channel asked for cannot send', async () => {
    mockUpstream({ employees: () => Response.json([employeeRow(employeeId)]) });
    const response = await request(
      bulk,
      { invitations: [{ employeeId, address: '0742115980' }] },
      { ...env, SMS: undefined }
    );
    expect(response.status).toBe(503);
  });
});

describe('GET /clients/{clientId}/imports/{importId}/portal-invitees', () => {
  const invitees = `/clients/${clientId}/imports/${importId}/portal-invitees`;
  const row = (id: string, lastName: string, extra: Record<string, unknown> = {}) => ({
    id,
    last_name: lastName,
    first_name: 'Ion',
    email: null,
    phone: null,
    status: 'active',
    job_positions: { name: 'Brutar' },
    client_files: [{ import_id: importId }],
    ...extra,
  });

  it('lists the employees whose sheets the import filed, with their standing on the portal', async () => {
    const ids = [1, 2, 3, 4].map((n) => `e1e1e1e1-0000-4000-8000-00000000002${n}`);
    mockUpstream({
      employees: () =>
        Response.json([
          row(ids[0]!, 'Bârsan', { status: 'terminated' }),
          row(ids[1]!, 'Coman', { email: 'daniela.coman@yahoo.com' }),
          row(ids[2]!, 'Lazăr', { phone: '+40744318207' }),
          row(ids[3]!, 'Neagu'),
        ]),
      activeParticipants: () => Response.json([{ employee_id: ids[1] }]),
      openInvitations: () => Response.json([{ employee_id: ids[2] }]),
    });

    const response = await request(invitees);

    expect(response.status).toBe(200);
    const { items } = (await response.json()) as {
      items: { lastName: string; current: boolean; portal: string | null; position: string }[];
    };
    expect(items.map((item) => [item.lastName, item.current, item.portal])).toEqual([
      ['Bârsan', false, null],
      ['Coman', true, 'participant'],
      ['Lazăr', true, 'invited'],
      ['Neagu', true, null],
    ]);
    expect(items[0]?.position).toBe('Brutar');
    const [query] = calls('/rest/v1/employees');
    expect(query?.url.searchParams.get('client_files.import_id')).toBe(`eq.${importId}`);
    const [found] = calls('/rest/v1/imports');
    expect(found?.url.searchParams.get('kind')).toBe('eq.employees');
    expect(found?.url.searchParams.get('status')).toBe('eq.confirmed');
  });

  it('answers 404 for an import that is not a confirmed employee import of the client', async () => {
    mockUpstream({ imports: () => Response.json(null), employees: () => Response.json([]) });
    expect((await request(invitees)).status).toBe(404);
  });
});
