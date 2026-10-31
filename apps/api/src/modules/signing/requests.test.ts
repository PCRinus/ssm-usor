import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import {
  callsTo,
  clientId,
  databaseError,
  env,
  fetchMock,
  mockUpstream,
  organizationId,
  sendSignatureRequestEmail,
  sendSignatureRequestSms,
  type UpstreamRoute,
  user,
} from './upstream.fixture';

const trainingId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const ionId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const mariaId = '1d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6';
const ionRecord = 'e0000000-0000-4000-8000-000000000001';
const mariaRecord = 'e0000000-0000-4000-8000-000000000002';
const ionAccount = 'a0000000-0000-4000-8000-000000000001';
const mariaAccount = 'a0000000-0000-4000-8000-000000000002';
const trainerAccount = 'a0000000-0000-4000-8000-000000000003';
const managerAccount = 'a0000000-0000-4000-8000-000000000004';

const members = [
  {
    user_id: user.id,
    email: 'ana@example.ro',
    full_name: 'Ana Specialist',
    professional_title: 'Inspector SSM',
    role: 'specialist',
    joined_at: '2026-09-01T00:00:00Z',
  },
  {
    user_id: trainerAccount,
    email: 'Dan@Example.ro',
    full_name: 'Dan Marin',
    professional_title: '',
    role: 'specialist',
    joined_at: '2026-09-02T00:00:00Z',
  },
];

const participant = (
  account: string,
  employeeId: string | null,
  employee: Record<string, unknown> | null,
  kind = 'employee'
) => ({
  user_id: account,
  kind,
  employee_id: employeeId,
  full_name: employee ? null : 'Vasile Șef',
  employees: employee,
  participant_invitations: [
    { channel: 'sms', address: '+40722000999', accepted_at: '2026-10-01T00:00:00Z' },
  ],
});

const participants = [
  participant(ionAccount, ionId, {
    last_name: 'Popescu',
    first_name: 'Ion',
    job_title: 'Sudor',
    email: 'ion@example.ro',
    phone: '+40722000001',
  }),
  participant(mariaAccount, mariaId, {
    last_name: 'Ionescu',
    first_name: 'Maria',
    job_title: 'Vopsitor',
    email: null,
    phone: '+40722000002',
  }),
  participant(managerAccount, null, null, 'client_administrator'),
];

const trainingDetail = {
  id: trainingId,
  client_id: clientId,
  domain: 'ssm',
  phase: 'workplace',
  held_on: '2026-10-01',
  duration_minutes: 240,
  material: 'I.P.S.S.M. Art. 1 – 290',
  trainer_name: 'Dan MARIN',
  trainer_job_title: 'Inspector SSM',
  verifier_name: null,
  verifier_job_title: null,
  supplementary_reason: null,
  source: 'app',
  themes_revision_id: null,
  notes: null,
  created_at: '2026-10-01T10:00:00+00:00',
  updated_at: '2026-10-01T10:00:00+00:00',
  training_records: [],
};

const body = {
  domain: 'ssm',
  phase: 'workplace',
  heldOn: '2026-10-01',
  durationMinutes: 240,
  material: 'I.P.S.S.M. Art. 1 – 290',
  trainer: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
  employeeIds: [ionId, mariaId],
  admission: { admittedOn: '2026-10-01', name: 'Vasile ȘEF', jobTitle: 'Șef atelier' },
  signers: { trainer: trainerAccount, admitter: managerAccount },
};

let nextRequestId = 0;

type Issue = {
  training_record_id: string;
  slot: string;
  signer_account_id: string | null;
  replaces: string | null;
  reason: string | null;
};

const issued = () =>
  (callsTo('/rest/v1/rpc/issue_signature_requests', 'POST')[0]?.body as { p_requests: Issue[] })
    ?.p_requests;

function upstream(overrides: Record<string, UpstreamRoute> = {}) {
  mockUpstream({
    '/rest/v1/clients': () => [
      {
        id: clientId,
        legal_representative_name: null,
        legal_representative_role: null,
        periodic_training_minutes: null,
      },
    ],
    '/rest/v1/rpc/organization_member_list': () => members,
    '/rest/v1/client_participants': () => participants,
    '/rest/v1/employees': () => [
      { id: ionId, job_positions: { name: 'Sudor' } },
      { id: mariaId, job_positions: { name: 'Vopsitor' } },
    ],
    '/rest/v1/rpc/save_training': () => trainingId,
    '/rest/v1/trainings': ({ url }) =>
      url.searchParams.get('select')!.startsWith('id,source')
        ? [
            {
              id: trainingId,
              source: 'app',
              verifier_name: null,
              training_records: [
                { id: ionRecord, employee_id: ionId, admitted_on: '2026-10-01' },
                { id: mariaRecord, employee_id: mariaId, admitted_on: '2026-10-01' },
              ],
            },
          ]
        : [trainingDetail],
    'GET /rest/v1/signature_requests': () => [],
    '/rest/v1/rpc/issue_signature_requests': ({ body: payload }) =>
      (payload as { p_requests: Issue[] }).p_requests
        .filter((row) => row.signer_account_id)
        .map((row) => ({
          id: `f0000000-0000-4000-8000-${String((nextRequestId += 1)).padStart(12, '0')}`,
          training_record_id: row.training_record_id,
          slot: row.slot,
          signer_account_id: row.signer_account_id,
        })),
    'PATCH /rest/v1/signature_requests': () => [],
    '/rest/v1/employee_signing_agreements': () => [],
    '/rest/v1/training_records': () => [],
    '/rest/v1/organizations': () => [{ name: 'Protect SSM' }],
    ...overrides,
  });
}

const save = (payload: unknown = body, path = `/clients/${clientId}/trainings`, method = 'POST') =>
  createApp().request(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-token' },
      body: JSON.stringify(payload),
    },
    env
  );

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  nextRequestId = 0;
  sendSignatureRequestEmail.mockReset().mockResolvedValue({ id: 'm1' });
  sendSignatureRequestSms.mockReset().mockResolvedValue({ id: 's1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requests issued when a training is saved', () => {
  it("issues every slot with a signer as the member, the trainee's to the employee's own participant", async () => {
    upstream();

    const response = await save();

    expect(response.status).toBe(201);
    const [insert] = callsTo('/rest/v1/rpc/issue_signature_requests', 'POST');
    expect(insert!.secret).toBe(false);
    expect(insert!.headers.get('Authorization')).toBe('Bearer user-token');
    expect(issued()).toEqual(
      [
        [ionRecord, 'trainee', ionAccount],
        [ionRecord, 'trainer', trainerAccount],
        [ionRecord, 'admitter', managerAccount],
        [mariaRecord, 'trainee', mariaAccount],
        [mariaRecord, 'trainer', trainerAccount],
        [mariaRecord, 'admitter', managerAccount],
      ].map(([record, slot, signer]) => ({
        training_record_id: record,
        slot,
        signer_account_id: signer,
        replaces: null,
        reason: null,
      }))
    );
  });

  it('asks no trainee whose agreement is withdrawn', async () => {
    upstream({ '/rest/v1/employee_signing_agreements': () => [{ employee_id: mariaId }] });

    await save();

    expect(
      issued()!
        .filter((row) => row.slot === 'trainee')
        .map((row) => row.signer_account_id)
    ).toEqual([ionAccount]);
  });

  it('refuses a signer whose own name is not the name the slot prints, before saving anything', async () => {
    upstream();

    const response = await save({ ...body, trainer: { name: 'Ion POP', jobTitle: 'Șef atelier' } });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      reason: 'signer_name_mismatch',
      issues: [{ path: 'signers.trainer' }],
    });
    expect(callsTo('/rest/v1/rpc/save_training')).toHaveLength(0);
  });

  it('tells each signer once, with a count, by email where there is one and in the place they sign', async () => {
    upstream();

    await save();

    expect(sendSignatureRequestEmail.mock.calls.map(([message]) => message)).toEqual([
      {
        to: 'ion@example.ro',
        count: 1,
        organizationName: 'Protect SSM',
        signUrl: 'https://portal.example.ro',
        place: 'portal',
      },
      {
        to: 'dan@example.ro',
        count: 2,
        organizationName: 'Protect SSM',
        signUrl: 'https://app.example.ro',
        place: 'app',
      },
    ]);
    expect(sendSignatureRequestSms.mock.calls.map(([message]) => message)).toEqual([
      { to: '+40722000999', count: 2, signUrl: 'https://portal.example.ro', place: 'portal' },
      { to: '+40722000002', count: 1, signUrl: 'https://portal.example.ro', place: 'portal' },
    ]);
    const [stamp] = callsTo('/rest/v1/signature_requests', 'PATCH');
    expect(stamp!.secret).toBe(true);
    expect(stamp!.url.searchParams.get('id')).toMatch(/^in\.\(.+\)$/);
    expect(stamp!.url.searchParams.get('id')!.split(',')).toHaveLength(6);
    expect(stamp!.body).toEqual({ notified_at: expect.any(String) });
  });

  it('leaves a slot with a live request alone, so a save after an edit issues only what it voided', async () => {
    upstream({
      'GET /rest/v1/signature_requests': () => [
        { training_record_id: ionRecord, slot: 'trainee' },
        { training_record_id: ionRecord, slot: 'trainer' },
        { training_record_id: ionRecord, slot: 'admitter' },
        { training_record_id: mariaRecord, slot: 'trainer' },
      ],
    });

    const response = await save(body, `/clients/${clientId}/trainings/${trainingId}`, 'PUT');

    expect(response.status).toBe(200);
    const [live] = callsTo('/rest/v1/signature_requests', 'GET');
    expect(live!.url.searchParams.get('state')).toBe('neq.void');
    expect(
      issued()!.map(
        (row) => `${row.training_record_id === ionRecord ? 'ion' : 'maria'} ${row.slot}`
      )
    ).toEqual(['maria trainee', 'maria admitter']);
  });

  it('voids a pending request to another signer, or one left to paper, in the same call that issues its replacement', async () => {
    const pending = (id: string, record: string, slot: string, signer: string) => ({
      id: `f0000000-0000-4000-8000-0000000000${id}`,
      training_record_id: record,
      slot,
      state: 'pending',
      signer_account_id: signer,
    });
    upstream({
      'GET /rest/v1/signature_requests': () => [
        pending('a1', ionRecord, 'trainee', ionAccount),
        pending('a2', ionRecord, 'trainer', managerAccount),
        pending('a3', ionRecord, 'admitter', managerAccount),
        pending('a4', mariaRecord, 'trainee', mariaAccount),
        { ...pending('a5', mariaRecord, 'trainer', managerAccount), state: 'signed' },
        pending('a6', mariaRecord, 'admitter', managerAccount),
      ],
    });

    const response = await save(
      { ...body, signers: { trainer: trainerAccount, admitter: null } },
      `/clients/${clientId}/trainings/${trainingId}`,
      'PUT'
    );

    expect(response.status).toBe(200);
    expect(
      callsTo('/rest/v1/signature_requests', 'PATCH').filter(
        (call) => (call.body as { state?: string }).state === 'void'
      )
    ).toHaveLength(0);
    expect(
      issued()!.map((row) => [row.slot, row.signer_account_id, row.replaces, row.reason])
    ).toEqual([
      ['trainer', trainerAccount, 'f0000000-0000-4000-8000-0000000000a2', 'signer_changed'],
      ['admitter', null, 'f0000000-0000-4000-8000-0000000000a3', 'paper'],
      ['admitter', null, 'f0000000-0000-4000-8000-0000000000a6', 'paper'],
    ]);
  });

  it('asks nobody without the signers field, nor for a training typed from paper', async () => {
    upstream();

    const withoutSigners = { ...body, signers: undefined };
    expect((await save(withoutSigners)).status).toBe(201);
    expect(callsTo('/rest/v1/client_participants')).toHaveLength(0);

    fetchMock.mockClear();
    upstream({
      '/rest/v1/trainings': ({ url }) =>
        url.searchParams.get('select')!.startsWith('id,source')
          ? [{ id: trainingId, source: 'paper', verifier_name: null, training_records: [] }]
          : [trainingDetail],
    });
    expect((await save({ ...body, source: 'paper' })).status).toBe(201);
    expect(callsTo('/rest/v1/signature_requests')).toHaveLength(0);
    expect(callsTo('/rest/v1/rpc/issue_signature_requests')).toHaveLength(0);
    expect(sendSignatureRequestEmail).not.toHaveBeenCalled();
  });

  it('refuses a signer who is neither a member nor a participant before saving anything', async () => {
    upstream();

    const response = await save({
      ...body,
      signers: { trainer: 'b0000000-0000-4000-8000-000000000009' },
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: 'unprocessable',
      reason: 'signer_not_of_client',
      issues: [{ path: 'signers.trainer' }],
    });
    expect(callsTo('/rest/v1/rpc/save_training')).toHaveLength(0);
  });

  it('keeps the saved training when the database refuses the requests, and tells nobody', async () => {
    upstream({
      '/rest/v1/rpc/issue_signature_requests': () => databaseError('SIG05', 'signer_not_of_client'),
    });

    const response = await save();

    expect(response.status).toBe(201);
    expect(sendSignatureRequestEmail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('signer_not_of_client'));
  });

  it('refuses a verifier signer on a training without a verifier', async () => {
    upstream();

    const response = await save({ ...body, signers: { verifier: trainerAccount } });

    expect(response.status).toBe(400);
    expect(callsTo('/rest/v1/rpc/save_training')).toHaveLength(0);
  });

  it('keeps the requests when a message fails, and stamps only those whose signer was told', async () => {
    upstream();
    sendSignatureRequestEmail.mockImplementation(async ({ to }) => {
      if (to === 'dan@example.ro') throw new Error('Resend refused');
      return { id: 'm1' };
    });

    const response = await save();

    expect(response.status).toBe(201);
    const [stamp] = callsTo('/rest/v1/signature_requests', 'PATCH');
    expect(stamp!.url.searchParams.get('id')!.split(',')).toHaveLength(4);
  });

  it('logs each texted notice against the organization, uncounted', async () => {
    upstream();

    await save();

    const claims = callsTo('/rest/v1/rpc/claim_sms_send', 'POST');
    expect(claims.map((claim) => claim.body)).toEqual([
      expect.objectContaining({ p_kind: 'signature_request', p_organization_id: organizationId }),
      expect.objectContaining({ p_kind: 'signature_request', p_organization_id: organizationId }),
    ]);
  });

  it('skips the texted notices during a trial without a plan, emails the rest and stamps only those', async () => {
    upstream({
      'GET /rest/v1/subscriptions': () => ({
        organization_id: organizationId,
        plan: 'profesional',
        status: 'trialing',
        created_at: '2026-10-01T00:00:00Z',
        trial_ends_at: '2099-01-01T00:00:00Z',
        stripe_subscription_id: null,
        stripe_customer_id: null,
        tester_allowances: false,
        first_paid_at: null,
        billing_anchor_at: null,
        current_period_end: null,
        sms_cap_factor: 3,
      }),
    });

    const response = await save();

    expect(response.status).toBe(201);
    expect(sendSignatureRequestSms).not.toHaveBeenCalled();
    expect(sendSignatureRequestEmail).toHaveBeenCalledTimes(2);
    const [stamp] = callsTo('/rest/v1/signature_requests', 'PATCH');
    expect(stamp!.url.searchParams.get('id')!.split(',')).toHaveLength(3);
  });

  it('answers 409 when the training is signed and the edit changes what it prints', async () => {
    upstream({ '/rest/v1/rpc/save_training': () => databaseError('SIG01', 'record_signed') });

    const response = await save(body, `/clients/${clientId}/trainings/${trainingId}`, 'PUT');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'conflict', reason: 'record_signed' });
  });
});
