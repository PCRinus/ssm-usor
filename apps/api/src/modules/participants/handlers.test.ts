import type { MailService, SmsService } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest, testAccessToken } from '../../test/request';
import { createSmsUpstream, plainTrial, type SmsUpstream } from '../../test/sms';
import {
  callsTo,
  databaseError,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
  testEnv,
  testOrganizationId as organizationId,
  testSecretKey,
  type UpstreamCall,
} from '../../test/upstream';

const sendInvitationEmail = vi.fn<MailService['sendParticipantInvitation']>();
const sendInvitationSms = vi.fn<SmsService['sendParticipantInvitation']>();

const env = testEnv({
  SUPABASE_SECRET_KEY: testSecretKey,
  PORTAL_ORIGIN: 'https://portal.example.ro',
  MAIL: { sendParticipantInvitation: sendInvitationEmail } as unknown as MailService,
  SMS: { sendParticipantInvitation: sendInvitationSms } as unknown as SmsService,
});

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
  createAtAddress: () => Response.json({ ...invitationRow, employees: undefined }),
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

let sms: SmsUpstream;

const viaSms = ({ method, url, headers, body }: UpstreamCall) =>
  sms.handle(url, { method, headers, body: JSON.stringify(body ?? {}) });

function mockUpstream(overrides: Partial<typeof upstreamDefaults> = {}) {
  const upstream = { ...upstreamDefaults, ...overrides };
  const selects = (url: URL) => url.searchParams.get('select');
  mockSignedInUpstream({
    'GET /rest/v1/subscriptions': viaSms,
    '/rest/v1/rpc/claim_sms_send': viaSms,
    'PATCH /rest/v1/sms_sends': viaSms,
    'DELETE /rest/v1/sms_sends': viaSms,
    '/auth/v1/admin/users': () => upstream.createUser(),
    [`/auth/v1/admin/users/${accountId}`]: ({ method }) =>
      method === 'PUT' ? upstream.updateUser() : upstream.getUser(),
    '/rest/v1/rpc/create_participant_invitation': () => upstream.create(),
    '/rest/v1/rpc/create_employee_invitation_at_address': () => upstream.createAtAddress(),
    '/rest/v1/rpc/resend_participant_invitation': () => upstream.resend(),
    '/rest/v1/rpc/revoke_participant_invitation': () => upstream.revokeInvitation(),
    '/rest/v1/rpc/revoke_client_participant': () => upstream.revokeParticipant(),
    '/rest/v1/rpc/auth_user_id_by_address': () => upstream.lookup(),
    '/rest/v1/participant_invitations': ({ url }) =>
      selects(url) === 'employee_id' ? upstream.openInvitations() : upstream.invitations(),
    '/rest/v1/client_participants': ({ url }) =>
      selects(url) === 'employee_id' ? upstream.activeParticipants() : upstream.participants(),
    '/rest/v1/employees': () => upstream.employees(),
    '/rest/v1/imports': () => upstream.imports(),
    '/rest/v1/clients': ({ url }) => {
      if (selects(url) === 'legal_name') {
        return Response.json({ legal_name: 'S.C. CLIENT DEMO S.R.L.' });
      }
      return selects(url)?.includes('stage') ? upstream.client() : upstream.clients();
    },
    '/rest/v1/organizations': () => Response.json({ name: 'Protect SSM' }),
  });
}

const request = (path: string, body?: unknown, targetEnv = env) =>
  apiRequest(path, { method: body === undefined ? 'GET' : 'POST', body }, targetEnv);

const reasonOf = async (response: Response) =>
  ((await response.json()) as { reason?: string }).reason;

const employeeInvitations = `/clients/${clientId}/employees/${employeeId}/participant-invitations`;

stubFetch();

beforeEach(() => {
  sms = createSmsUpstream();
  sendInvitationEmail.mockReset().mockResolvedValue({ id: 'msg_1' });
  sendInvitationSms.mockReset().mockResolvedValue({ id: 'sms_1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
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

    const [create] = callsTo('/rest/v1/rpc/create_participant_invitation');
    expect(create?.headers.get('Authorization')).toBe(`Bearer ${testAccessToken}`);
    expect(create?.body).toEqual({
      p_client_id: clientId,
      p_kind: 'employee',
      p_employee_id: employeeId,
      p_full_name: null,
      p_channel: 'email',
      p_address: 'ion@example.ro',
    });

    const [lookup] = callsTo('/rest/v1/rpc/auth_user_id_by_address');
    expect(lookup?.headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
    expect(lookup?.body).toEqual({ p_channel: 'email', p_address: 'ion@example.ro' });
    const [created] = callsTo('/auth/v1/admin/users', 'POST');
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
    expect(callsTo('/rest/v1/rpc/create_participant_invitation')[0]?.body).toMatchObject({
      p_channel: 'sms',
      p_address: '+40721000002',
    });
    expect(callsTo('/auth/v1/admin/users', 'POST')[0]?.body).toMatchObject({
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

  it('logs the SMS invitation against the organization, uncounted', async () => {
    const smsRow = { ...invitationRow, channel: 'sms', address: '+40721000002' };
    mockUpstream({
      create: () => Response.json(smsRow),
      invitations: () => Response.json([smsRow]),
    });

    await request(employeeInvitations, { channel: 'sms', address: '0721 000 002' });

    expect(sms.claims).toEqual([
      expect.objectContaining({
        p_organization_id: organizationId,
        p_kind: 'participant_invitation',
        p_allowance: null,
        p_extra_cents: null,
      }),
    ]);
    expect(sms.updates).toEqual([expect.objectContaining({ provider_id: 'sms_1' })]);
  });

  it('refuses an SMS invitation during a trial without a plan before saving anything', async () => {
    sms.subscriptions.push(plainTrial(organizationId));
    mockUpstream();

    const response = await request(employeeInvitations, {
      channel: 'sms',
      address: '0721 000 002',
    });

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('sms_trial');
    expect(callsTo('/rest/v1/rpc/create_participant_invitation')).toEqual([]);
    expect(sendInvitationSms).not.toHaveBeenCalled();
  });

  it('still invites by email during a trial', async () => {
    sms.subscriptions.push(plainTrial(organizationId));
    mockUpstream();

    const response = await request(employeeInvitations, {
      channel: 'email',
      address: 'ion@example.ro',
    });

    expect(response.status).toBe(201);
    expect(sendInvitationEmail).toHaveBeenCalledOnce();
  });

  it('refuses a number outside Romania with 422', async () => {
    mockUpstream();

    const response = await request(employeeInvitations, {
      channel: 'sms',
      address: '+33612345678',
    });

    expect(response.status).toBe(422);
    expect(await reasonOf(response)).toBe('sms_foreign_number');
    expect(callsTo('/rest/v1/rpc/create_participant_invitation')).toEqual([]);
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
    expect(callsTo('/auth/v1/admin/users', 'POST')).toEqual([]);
    const [updated] = callsTo(`/auth/v1/admin/users/${accountId}`, 'PUT');
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
    expect(callsTo(`/auth/v1/admin/users/${accountId}`, 'PUT')).toEqual([]);
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
    expect(callsTo(`/auth/v1/admin/users/${accountId}`, 'PUT')[0]?.body).toEqual({
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
    expect(callsTo('/rest/v1/rpc/create_participant_invitation')).toHaveLength(1);
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
    expect(callsTo('/rest/v1/rpc/auth_user_id_by_address')).toEqual([]);
    expect(callsTo('/auth/v1/admin/users', 'POST')).toEqual([]);
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
    expect(callsTo('/rest/v1/rpc/create_participant_invitation')).toEqual([]);
  });

  it('answers 503 before saving anything when the channel has no sender', async () => {
    mockUpstream();

    const response = await request(
      employeeInvitations,
      { channel: 'sms', address: '+40721000002' },
      { ...env, SMS: undefined }
    );

    expect(response.status).toBe(503);
    expect(callsTo('/rest/v1/rpc/create_participant_invitation')).toEqual([]);
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
    expect(callsTo('/rest/v1/rpc/create_participant_invitation')[0]?.body).toEqual({
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

    expect(callsTo('/rest/v1/rpc/create_participant_invitation')[0]?.body).toMatchObject({
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
    expect(callsTo('/rest/v1/rpc/resend_participant_invitation')[0]?.body).toEqual({
      p_invitation_id: invitationId,
    });
    expect(sendInvitationEmail).toHaveBeenCalledOnce();
  });

  it('refuses to resend an SMS invitation during a trial', async () => {
    const smsRow = { ...invitationRow, channel: 'sms', address: '+40721000002' };
    sms.subscriptions.push(plainTrial(organizationId));
    mockUpstream({ invitations: () => Response.json(smsRow) });

    const response = await request(`/participant-invitations/${invitationId}/resend`, {});

    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('sms_trial');
    expect(callsTo('/rest/v1/rpc/resend_participant_invitation')).toEqual([]);
    expect(sendInvitationSms).not.toHaveBeenCalled();
  });

  it('answers 404 for an invitation the member cannot see', async () => {
    mockUpstream({ invitations: () => Response.json([]) });

    const response = await request(`/participant-invitations/${invitationId}/resend`, {});

    expect(response.status).toBe(404);
    expect(callsTo('/rest/v1/rpc/resend_participant_invitation')).toEqual([]);
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
    expect(callsTo('/rest/v1/rpc/revoke_participant_invitation')[0]?.body).toEqual({
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
    expect(callsTo('/rest/v1/rpc/revoke_client_participant')[0]?.body).toEqual({
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
    const query = callsTo('/rest/v1/participant_invitations')[0]!.url.searchParams;
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
    expect(callsTo('/rest/v1/client_participants')[0]!.url.searchParams.get('revoked_at')).toBe(
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

  it('invites each at the address typed, by SMS for a phone and by email for an email', async () => {
    let created = 0;
    mockUpstream({
      employees: () =>
        Response.json([
          employeeRow(employeeId, { email: 'ion@example.ro' }),
          employeeRow(newcomerId),
        ]),
      createAtAddress: () => Response.json({ id: created++ === 0 ? invitationId : smsRow.id }),
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
    expect(callsTo('/rest/v1/employees', 'PATCH')).toEqual([]);
    const invited = callsTo('/rest/v1/rpc/create_employee_invitation_at_address');
    expect(invited.map((call) => call.body)).toEqual([
      {
        p_client_id: clientId,
        p_employee_id: employeeId,
        p_channel: 'email',
        p_address: 'ion@example.ro',
      },
      {
        p_client_id: clientId,
        p_employee_id: newcomerId,
        p_channel: 'sms',
        p_address: '+40742115980',
      },
    ]);
    expect(invited[0]?.headers.get('Authorization')).toBe(`Bearer ${testAccessToken}`);
    expect(sendInvitationEmail).toHaveBeenCalledOnce();
    expect(sendInvitationSms).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+40742115980', clientName: 'S.C. CLIENT DEMO S.R.L.' })
    );
  });

  it('names an SMS the plan refuses on its row, saves nothing for it, and invites the rest', async () => {
    sms.subscriptions.push(plainTrial(organizationId));
    mockUpstream({
      employees: () => Response.json([employeeRow(employeeId), employeeRow(newcomerId)]),
      createAtAddress: () => Response.json({ id: invitationId }),
      invitations: () => Response.json(invitationRow),
    });

    const response = await request(bulk, {
      invitations: [
        { employeeId, address: 'ion@example.ro' },
        { employeeId: newcomerId, address: '0742 115 980' },
      ],
    });

    const { results } = (await response.json()) as {
      results: { employeeId: string; outcome: string; reason: string | null }[];
    };
    expect(results.map((row) => [row.employeeId, row.outcome, row.reason])).toEqual([
      [employeeId, 'invited', null],
      [newcomerId, 'failed', 'sms_trial'],
    ]);
    expect(callsTo('/rest/v1/rpc/create_employee_invitation_at_address')).toHaveLength(1);
    expect(sendInvitationSms).not.toHaveBeenCalled();
  });

  it('names a foreign number on its row', async () => {
    mockUpstream({ employees: () => Response.json([employeeRow(newcomerId)]) });

    const response = await request(bulk, {
      invitations: [{ employeeId: newcomerId, address: '+33612345678' }],
    });

    const { results } = (await response.json()) as { results: { reason: string | null }[] };
    expect(results[0]?.reason).toBe('sms_foreign_number');
    expect(callsTo('/rest/v1/rpc/create_employee_invitation_at_address')).toEqual([]);
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
    expect(callsTo('/rest/v1/rpc/create_employee_invitation_at_address')).toEqual([]);
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
      createAtAddress: () =>
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

  it("names an address the employee's row refused as not saved", async () => {
    let created = 0;
    mockUpstream({
      employees: () => Response.json([employeeRow(employeeId), employeeRow(newcomerId)]),
      createAtAddress: () =>
        created++ === 0
          ? databaseError('PRT04', 'address_not_of_employee')
          : Response.json({ id: smsRow.id }),
      invitations: () => Response.json(smsRow),
    });

    const response = await request(bulk, {
      invitations: [
        { employeeId, address: 'ion@example.ro' },
        { employeeId: newcomerId, address: '0742115980' },
      ],
    });

    const { results } = (await response.json()) as {
      results: { outcome: string; reason: string | null }[];
    };
    expect(results.map((row) => [row.outcome, row.reason])).toEqual([
      ['failed', 'contact_not_saved'],
      ['invited', null],
    ]);
  });

  it('answers a row whose saved invitation cannot be read on its own and goes on with the next', async () => {
    let read = 0;
    mockUpstream({
      employees: () => Response.json([employeeRow(employeeId), employeeRow(newcomerId)]),
      createAtAddress: () => Response.json({ id: read === 0 ? invitationId : smsRow.id }),
      invitations: () =>
        read++ === 0
          ? Response.json({ code: '57014', message: 'canceling statement' }, { status: 500 })
          : Response.json(smsRow),
    });

    const response = await request(bulk, {
      invitations: [
        { employeeId, address: 'ion@example.ro' },
        { employeeId: newcomerId, address: '0742115980' },
      ],
    });

    expect(response.status).toBe(200);
    const { results } = (await response.json()) as {
      results: { outcome: string; reason: string | null }[];
    };
    expect(results.map((row) => [row.outcome, row.reason])).toEqual([
      ['failed', 'invitation_failed'],
      ['invited', null],
    ]);
    expect(sendInvitationSms).toHaveBeenCalledOnce();
  });

  it('keeps the invitation whose message failed, for a resend', async () => {
    sendInvitationSms.mockRejectedValueOnce(new Error('Twilio down'));
    mockUpstream({
      employees: () => Response.json([employeeRow(newcomerId)]),
      createAtAddress: () => Response.json({ id: smsRow.id }),
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
    expect(callsTo('/rest/v1/rpc/create_employee_invitation_at_address')).toEqual([]);
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
    const [query] = callsTo('/rest/v1/employees');
    expect(query?.url.searchParams.get('client_files.import_id')).toBe(`eq.${importId}`);
    const [found] = callsTo('/rest/v1/imports');
    expect(found?.url.searchParams.get('kind')).toBe('eq.employees');
    expect(found?.url.searchParams.get('status')).toBe('eq.confirmed');
  });

  it('answers 404 for an import that is not a confirmed employee import of the client', async () => {
    mockUpstream({ imports: () => Response.json(null), employees: () => Response.json([]) });
    expect((await request(invitees)).status).toBe(404);
  });
});
