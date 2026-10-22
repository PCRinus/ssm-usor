import { readFileSync } from 'node:fs';

import {
  portalSignatureRequestsResponseSchema,
  portalSigningAgreementsResponseSchema,
  recordSignaturesResponseSchema,
  signatureRequestListResponseSchema,
  signerCandidatesResponseSchema,
} from '@ssm-usor/contracts';
import { documentText } from '@ssm-usor/document-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import {
  callsTo,
  clientId,
  databaseError,
  env,
  fetchMock,
  mockUpstream,
  organizationId,
  type UpstreamRoute,
  user,
} from './upstream.fixture';

const recordId = 'e0000000-0000-4000-8000-000000000001';
const trainingId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const participantId = '88888888-0000-4000-8000-000000000001';
const ionAccount = 'a0000000-0000-4000-8000-000000000001';
const trainerAccount = 'a0000000-0000-4000-8000-000000000003';

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
    email: 'dan@example.ro',
    full_name: 'Dan Marin',
    professional_title: '',
    role: 'specialist',
    joined_at: '2026-09-02T00:00:00Z',
  },
];

const ionParticipant = {
  user_id: ionAccount,
  kind: 'employee',
  employee_id: employeeId,
  full_name: null,
  employees: {
    last_name: 'Popescu',
    first_name: 'Ion',
    job_title: 'Sudor',
    email: 'ion@example.ro',
    phone: null,
  },
  participant_invitations: [],
};

const request = (path: string, init: { method?: string; body?: unknown } = {}, bindings = env) =>
  createApp().request(
    path,
    {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-token' },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
    bindings
  );

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /clients/{clientId}/signer-candidates', () => {
  it('lists the members, then the participants, each account once and without its address', async () => {
    mockUpstream({
      '/rest/v1/clients': () => [{ id: clientId }],
      '/rest/v1/rpc/organization_member_list': () => members,
      '/rest/v1/client_participants': () => [
        ionParticipant,
        { ...ionParticipant, user_id: trainerAccount, kind: 'client_administrator' },
      ],
    });

    const response = await request(`/clients/${clientId}/signer-candidates`);

    expect(response.status).toBe(200);
    const body = signerCandidatesResponseSchema.parse(await response.json());
    expect(body.items).toEqual([
      {
        accountId: user.id,
        name: 'Ana Specialist',
        jobTitle: 'Inspector SSM',
        kind: 'member',
        employeeId: null,
      },
      {
        accountId: trainerAccount,
        name: 'Dan Marin',
        jobTitle: null,
        kind: 'member',
        employeeId: null,
      },
      {
        accountId: ionAccount,
        name: 'Popescu Ion',
        jobTitle: 'Sudor',
        kind: 'employee',
        employeeId,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('@example.ro');
    const [participants] = callsTo('/rest/v1/client_participants');
    expect(participants!.url.searchParams.get('revoked_at')).toBe('is.null');
    expect(participants!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('answers 404 for a client outside the organization', async () => {
    mockUpstream({ '/rest/v1/clients': () => [] });

    expect((await request(`/clients/${clientId}/signer-candidates`)).status).toBe(404);
  });
});

const signaturesPath = `/clients/${clientId}/training-records/${recordId}/signatures`;

const requestRow = (overrides: Record<string, unknown>) => ({
  id: 'f0000000-0000-4000-8000-000000000001',
  slot: 'trainee',
  signer_account_id: ionAccount,
  state: 'pending',
  issued_at: '2026-10-02T08:00:00+00:00',
  notified_at: '2026-10-02T08:00:01+00:00',
  voided_at: null,
  void_reason: null,
  created_at: '2026-10-02T08:00:00+00:00',
  ...overrides,
});

function recordUpstream(overrides: Record<string, UpstreamRoute> = {}) {
  mockUpstream({
    '/rest/v1/training_records': () => [
      { id: recordId, admitted_on: '2026-10-01', trainings: { verifier_name: null } },
    ],
    '/rest/v1/signature_requests': () => [
      requestRow({}),
      requestRow({
        id: 'f0000000-0000-4000-8000-000000000002',
        slot: 'trainer',
        signer_account_id: trainerAccount,
        state: 'signed',
      }),
      requestRow({
        id: 'f0000000-0000-4000-8000-000000000003',
        slot: 'admitter',
        signer_account_id: null,
        state: 'void',
        voided_at: '2026-10-03T08:00:00+00:00',
        void_reason: 'Data greșită',
      }),
    ],
    '/rest/v1/training_signatures': () => [
      {
        request_id: 'f0000000-0000-4000-8000-000000000002',
        slot: 'trainer',
        method: 'electronic',
        signer_account_id: trainerAccount,
        signer_name: 'Dan MARIN',
        signer_job_title: 'Inspector SSM',
        signed_at: '2026-10-02T09:00:00+00:00',
        voided_at: null,
        void_reason: null,
      },
    ],
    '/rest/v1/rpc/organization_member_list': () => members,
    '/rest/v1/client_participants': () => [ionParticipant],
    ...overrides,
  });
}

describe('GET …/training-records/{recordId}/signatures', () => {
  it('says the record has no signature while nothing was signed, on paper or otherwise', async () => {
    recordUpstream({ '/rest/v1/training_signatures': () => [] });

    const body = recordSignaturesResponseSchema.parse(await (await request(signaturesPath)).json());

    expect(body.hasSignatures).toBe(false);
  });

  it("gives each of the record's slots its state", async () => {
    recordUpstream();

    const response = await request(signaturesPath);

    expect(response.status).toBe(200);
    const { slots, hasSignatures } = recordSignaturesResponseSchema.parse(await response.json());
    expect(hasSignatures).toBe(true);
    expect(slots.map((slot) => [slot.slot, slot.state])).toEqual([
      ['trainee', 'pending'],
      ['trainer', 'signed'],
      ['admitter', 'void'],
    ]);
    expect(slots[0]).toMatchObject({
      signer: { accountId: ionAccount, name: 'Popescu Ion' },
      issuedAt: '2026-10-02T08:00:00.000Z',
      notifiedAt: '2026-10-02T08:00:01.000Z',
    });
    expect(slots[1]).toMatchObject({
      signer: { accountId: trainerAccount, name: 'Dan Marin' },
      signedAt: '2026-10-02T09:00:00.000Z',
      signerName: 'Dan MARIN',
      signerJobTitle: 'Inspector SSM',
    });
    expect(slots[2]).toMatchObject({ voidReason: 'Data greșită', signer: null });
  });

  it('shows a verifier slot only with a verifier, a paper signature, and an untouched slot', async () => {
    recordUpstream({
      '/rest/v1/training_records': () => [
        { id: recordId, admitted_on: null, trainings: { verifier_name: 'Dan MARIN' } },
      ],
      '/rest/v1/signature_requests': () => [
        requestRow({ slot: 'trainer', signer_account_id: null, state: 'signed' }),
      ],
      '/rest/v1/training_signatures': () => [
        {
          request_id: 'f0000000-0000-4000-8000-000000000001',
          slot: 'trainer',
          method: 'paper',
          signer_account_id: null,
          signer_name: 'Ion POP',
          signer_job_title: null,
          signed_at: '2026-10-02T09:00:00+00:00',
          voided_at: null,
          void_reason: null,
        },
      ],
    });

    const { slots } = recordSignaturesResponseSchema.parse(
      await (await request(signaturesPath)).json()
    );

    expect(slots.map((slot) => [slot.slot, slot.state])).toEqual([
      ['trainee', 'unassigned'],
      ['trainer', 'paper'],
      ['verifier', 'unassigned'],
    ]);
    expect(slots[1]).toMatchObject({ signerName: 'Ion POP', signer: null });
    expect(callsTo('/rest/v1/rpc/organization_member_list')).toHaveLength(0);
  });

  it('answers 404 for a record of another client', async () => {
    recordUpstream({ '/rest/v1/training_records': () => [] });

    expect((await request(signaturesPath)).status).toBe(404);
  });
});

describe('POST …/signatures/paper and …/signatures/void', () => {
  it('marks a slot as signed by hand and answers with the slots', async () => {
    recordUpstream({ '/rest/v1/rpc/mark_paper_signature': () => ({}) });

    const response = await request(`${signaturesPath}/paper`, {
      method: 'POST',
      body: { slot: 'admitter', signerName: ' Vasile ȘEF ', signerJobTitle: 'Șef atelier' },
    });

    expect(response.status).toBe(200);
    expect(recordSignaturesResponseSchema.parse(await response.json()).recordId).toBe(recordId);
    const [call] = callsTo('/rest/v1/rpc/mark_paper_signature');
    expect(call!.headers.get('Authorization')).toBe('Bearer user-token');
    expect(call!.body).toEqual({
      p_record_id: recordId,
      p_slot: 'admitter',
      p_signer_name: 'Vasile ȘEF',
      p_signer_job_title: 'Șef atelier',
    });
  });

  it.each([
    ['SIG02', 'slot_signed', 409],
    ['SIG03', 'slot_not_on_record', 422],
    ['CLA01', 'client_archived', 409],
  ])('answers %s from the database with its reason', async (code, reason, status) => {
    recordUpstream({
      '/rest/v1/rpc/mark_paper_signature': () =>
        databaseError(code, code === 'CLA01' ? 'An archived client is not changed.' : reason),
    });

    const response = await request(`${signaturesPath}/paper`, {
      method: 'POST',
      body: { slot: 'verifier', signerName: 'Dan MARIN' },
    });

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ reason });
  });

  it('does not call the function for a record of another client', async () => {
    recordUpstream({ '/rest/v1/training_records': () => [] });

    const response = await request(`${signaturesPath}/void`, {
      method: 'POST',
      body: { reason: 'Data greșită' },
    });

    expect(response.status).toBe(404);
    expect(callsTo('/rest/v1/rpc/void_training_signatures')).toHaveLength(0);
  });

  it('voids the signatures with the reason, then marks the row the database struck on its sheet', async () => {
    recordUpstream({
      '/rest/v1/rpc/void_training_signatures': () => 2,
      'GET /rest/v1/signed_sheet_rows': () => [],
    });

    const response = await request(`${signaturesPath}/void`, {
      method: 'POST',
      body: { reason: ' Data greșită ' },
    });

    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/rpc/void_training_signatures')[0]!.body).toEqual({
      p_record_id: recordId,
      p_reason: 'Data greșită',
    });
    const rows = callsTo('/rest/v1/signed_sheet_rows');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((call) => call.secret)).toBe(true);
  });

  it('refuses a blank reason before the database', async () => {
    recordUpstream();

    const response = await request(`${signaturesPath}/void`, {
      method: 'POST',
      body: { reason: '   ' },
    });

    expect(response.status).toBe(400);
  });
});

const listRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'f0000000-0000-4000-8000-000000000001',
  slot: 'trainer',
  state: 'pending',
  signer_account_id: trainerAccount,
  issued_at: '2026-10-02T08:00:00+00:00',
  notified_at: null,
  clients: { id: clientId, legal_name: 'Fabrica Sigma SRL' },
  training_records: {
    id: recordId,
    training_id: trainingId,
    employees: {
      id: employeeId,
      last_name: 'Popescu',
      first_name: 'Ion',
      employee_signing_agreements: [],
    },
    trainings: { domain: 'ssm', phase: 'periodic', held_on: '2026-10-01' },
  },
  ...overrides,
});

describe('the members’ request lists', () => {
  it("GET /me/signature-requests lists the caller's own pending requests, with the agreement's state", async () => {
    mockUpstream({ '/rest/v1/signature_requests': () => [listRow()] });

    const response = await request('/me/signature-requests');

    expect(response.status).toBe(200);
    const { items } = signatureRequestListResponseSchema.parse(await response.json());
    expect(items).toEqual([
      {
        id: 'f0000000-0000-4000-8000-000000000001',
        kind: 'training_record',
        label: 'Instruire periodică SSM · 01.10.2026',
        slot: 'trainer',
        state: 'pending',
        issuedAt: '2026-10-02T08:00:00.000Z',
        notifiedAt: null,
        client: { id: clientId, name: 'Fabrica Sigma SRL' },
        employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
        record: {
          id: recordId,
          trainingId,
          employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
          domain: 'ssm',
          phase: 'periodic',
          heldOn: '2026-10-01',
        },
        testSheet: null,
        signer: { accountId: user.id, name: null },
        agreement: null,
      },
    ]);
    const [call] = callsTo('/rest/v1/signature_requests');
    expect(call!.url.searchParams.get('signer_account_id')).toBe(`eq.${user.id}`);
    expect(call!.url.searchParams.get('state')).toBe('eq.pending');
    expect(call!.url.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(call!.url.searchParams.get('slot')).toBe('neq.trainee');
  });

  it('GET /me/signature-requests leaves out a request whose record a policy hides', async () => {
    mockUpstream({
      '/rest/v1/signature_requests': () => [
        listRow(),
        { ...listRow({ id: 'f0000000-0000-4000-8000-000000000002' }), training_records: null },
        { ...listRow({ id: 'f0000000-0000-4000-8000-000000000003' }), clients: null },
      ],
    });

    const response = await request('/me/signature-requests');

    expect(response.status).toBe(200);
    const { items } = signatureRequestListResponseSchema.parse(await response.json());
    expect(items.map((item) => item.id)).toEqual(['f0000000-0000-4000-8000-000000000001']);
  });

  it('GET /me/signature-requests lists an examiner request of a test sheet in the same shape', async () => {
    mockUpstream({
      '/rest/v1/signature_requests': () => [
        {
          ...listRow({ id: 'f0000000-0000-4000-8000-000000000004', slot: 'examiner' }),
          training_records: null,
          test_sheets: {
            id: '75757575-0000-4000-8000-000000000001',
            test_result_id: '7e7e7e7e-0000-4000-8000-000000000001',
            employees: {
              id: employeeId,
              last_name: 'Popescu',
              first_name: 'Ion',
              employee_signing_agreements: [],
            },
            test_results: { domain: 'psi', test: 'annual', taken_on: '2026-10-21' },
          },
        },
      ],
    });

    const response = await request('/me/signature-requests');

    const { items } = signatureRequestListResponseSchema.parse(await response.json());
    expect(items).toEqual([
      expect.objectContaining({
        kind: 'test_sheet',
        label: 'Fișa de test · Test anual PSI · 21.10.2026',
        slot: 'examiner',
        employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
        record: null,
        testSheet: {
          id: '75757575-0000-4000-8000-000000000001',
          resultId: '7e7e7e7e-0000-4000-8000-000000000001',
          domain: 'psi',
          test: 'annual',
          takenOn: '2026-10-21',
        },
        agreement: null,
      }),
    ]);
  });

  it("GET /clients/{clientId}/signature-requests lists the client's requests in a state, with the signers' names", async () => {
    mockUpstream({
      '/rest/v1/clients': () => [{ id: clientId }],
      '/rest/v1/signature_requests': () => [
        listRow({
          training_records: {
            ...listRow().training_records,
            employees: {
              ...listRow().training_records.employees,
              employee_signing_agreements: [
                { state: 'signed_on_paper', employee_signed_at: null, employer_signed_at: null },
              ],
            },
          },
        }),
      ],
      '/rest/v1/rpc/organization_member_list': () => members,
      '/rest/v1/client_participants': () => [],
    });

    const response = await request(`/clients/${clientId}/signature-requests?state=signed`);

    const { items } = signatureRequestListResponseSchema.parse(await response.json());
    expect(items[0]).toMatchObject({
      signer: { accountId: trainerAccount, name: 'Dan Marin' },
      agreement: { state: 'signed_on_paper', employeeSignedAt: null, employerSignedAt: null },
    });
    const [call] = callsTo('/rest/v1/signature_requests');
    expect(call!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(call!.url.searchParams.get('state')).toBe('eq.signed');
  });
});

const participation = (kind: string, employee: string | null) => ({
  participant_id: participantId,
  organization_id: organizationId,
  organization_name: 'Protect SSM',
  client_id: clientId,
  client_name: 'Fabrica Sigma SRL',
  kind,
  employee_id: employee,
  full_name: 'Popescu Ion',
  notice_version: '2026-10-17',
  language: null,
});

const portalRecord = {
  id: recordId,
  occupation: 'Sudor',
  admitted_on: '2026-10-01',
  admitted_by_name: 'Vasile ȘEF',
  admitted_by_job_title: 'Șef atelier',
  employees: {
    id: employeeId,
    last_name: 'Popescu',
    first_name: 'Ion',
    employee_signing_agreements: [
      { state: 'generated', employee_signed_at: null, employer_signed_at: null },
    ],
  },
  trainings: {
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
  },
};

const testSheetId = '75757575-0000-4000-8000-000000000001';
const testResultId = '7e7e7e7e-0000-4000-8000-000000000001';

const portalTestSheet = {
  id: testSheetId,
  test_result_id: testResultId,
  employees: portalRecord.employees,
  test_results: {
    domain: 'ssm',
    test: 'hiring',
    taken_on: '2026-10-21',
    examiner_name: 'Ana IONESCU',
    examiner_job_title: 'Inspector SSM',
    test_attempts: { score: 8, total: 10 },
  },
};

function portalUpstream(kind: string, overrides: Record<string, UpstreamRoute> = {}) {
  mockUpstream({
    '/rest/v1/rpc/accept_participant_invitations': () => 0,
    '/rest/v1/rpc/current_participations': () => [
      participation(kind, kind === 'employee' ? employeeId : null),
    ],
    ...overrides,
  });
}

describe('the portal’s request lists', () => {
  it('lists the requests addressed to the participant, reading the records by id with the secret key', async () => {
    portalUpstream('employee', {
      '/rest/v1/signature_requests': () => [
        {
          id: 'f0000000-0000-4000-8000-000000000001',
          slot: 'admitter',
          issued_at: '2026-10-02T08:00:00+00:00',
          training_record_id: recordId,
        },
      ],
      '/rest/v1/training_records': () => [portalRecord],
    });

    const response = await request(`/portal/participants/${participantId}/signature-requests`);

    expect(response.status).toBe(200);
    const { items } = portalSignatureRequestsResponseSchema.parse(await response.json());
    expect(items[0]).toMatchObject({
      slot: 'admitter',
      signerName: 'Vasile ȘEF',
      agreement: { state: 'generated', employeeSignedAt: null, employerSignedAt: null },
      record: {
        heldOn: '2026-10-01',
        admission: { admittedOn: '2026-10-01', name: 'Vasile ȘEF', jobTitle: 'Șef atelier' },
      },
    });
    const [requests] = callsTo('/rest/v1/signature_requests');
    expect(requests!.secret).toBe(false);
    expect(requests!.url.searchParams.get('signer_account_id')).toBe(`eq.${user.id}`);
    expect(requests!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    const [records] = callsTo('/rest/v1/training_records');
    expect(records!.secret).toBe(true);
    expect(records!.url.searchParams.get('id')).toBe(`in.(${recordId})`);
    expect(records!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(records!.url.searchParams.get('select')).not.toMatch(/cnp|notes/);
  });

  it('reads nothing with the secret key when nothing is pending', async () => {
    portalUpstream('employee', { '/rest/v1/signature_requests': () => [] });

    const response = await request(`/portal/participants/${participantId}/signature-requests`);

    expect(await response.json()).toEqual({ items: [] });
    expect(callsTo('/rest/v1/training_records')).toHaveLength(0);
  });

  it("gives the client administrator the client's pending requests, as the administrator", async () => {
    portalUpstream('client_administrator', {
      '/rest/v1/signature_requests': () => [
        {
          id: 'f0000000-0000-4000-8000-000000000001',
          slot: 'trainee',
          issued_at: '2026-10-02T08:00:00+00:00',
          training_record_id: recordId,
          test_sheet_id: null,
        },
        {
          id: 'f0000000-0000-4000-8000-000000000002',
          slot: 'examiner',
          issued_at: '2026-10-21T08:00:00+00:00',
          training_record_id: null,
          test_sheet_id: testSheetId,
        },
      ],
      '/rest/v1/training_records': () => [portalRecord],
      '/rest/v1/test_sheets': () => [portalTestSheet],
    });

    const response = await request(
      `/portal/participants/${participantId}/employees/signature-requests`
    );

    expect(response.status).toBe(200);
    const { items } = portalSignatureRequestsResponseSchema.parse(await response.json());
    expect(items[0]).toMatchObject({
      kind: 'training_record',
      slot: 'trainee',
      signerName: 'Popescu Ion',
      testSheet: null,
    });
    expect(items[1]).toMatchObject({
      kind: 'test_sheet',
      label: 'Fișa de test · Test la angajare SSM · 21.10.2026',
      slot: 'examiner',
      signerName: 'Ana IONESCU',
      employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
      record: null,
      testSheet: {
        id: testSheetId,
        resultId: testResultId,
        code: 'TASSM',
        title: 'Test de verificare a cunoștințelor la angajare (TASSM)',
        takenOn: '2026-10-21',
        score: 8,
        total: 10,
        examiner: { name: 'Ana IONESCU', jobTitle: 'Inspector SSM' },
      },
    });
    const [call] = callsTo('/rest/v1/signature_requests');
    expect(call!.secret).toBe(false);
    expect(call!.url.searchParams.get('select')).not.toMatch(/cnp|notes/);
    const [sheets] = callsTo('/rest/v1/test_sheets');
    expect(sheets!.secret).toBe(true);
    expect(sheets!.url.searchParams.get('id')).toBe(`in.(${testSheetId})`);
    expect(sheets!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
  });

  it("lists the trainee's request on their own test sheet beside the records'", async () => {
    portalUpstream('employee', {
      '/rest/v1/signature_requests': () => [
        {
          id: 'f0000000-0000-4000-8000-000000000003',
          slot: 'trainee',
          issued_at: '2026-10-21T08:00:00+00:00',
          training_record_id: null,
          test_sheet_id: testSheetId,
        },
      ],
      '/rest/v1/test_sheets': () => [portalTestSheet],
    });

    const response = await request(`/portal/participants/${participantId}/signature-requests`);

    const { items } = portalSignatureRequestsResponseSchema.parse(await response.json());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'test_sheet',
      slot: 'trainee',
      signerName: 'Popescu Ion',
      agreement: { state: 'generated' },
    });
    expect(callsTo('/rest/v1/training_records')).toHaveLength(0);
  });

  it("refuses the client's list to an employee", async () => {
    portalUpstream('employee');

    const response = await request(
      `/portal/participants/${participantId}/employees/signature-requests`
    );

    expect(response.status).toBe(403);
  });
});

const templatesUrl = new URL('../../../../../packages/document-engine/templates/', import.meta.url);

const employeeRow = {
  last_name: 'Popescu',
  first_name: 'Ion',
  employee_number: '0042',
  job_title: 'Sudor',
  contract_number: '118/2024',
  hired_at: '2024-03-01',
  birth_date: '1988-03-14',
  birth_place: 'Lugoj',
  home_address: 'Str. Lungă 12, Timișoara',
  email: 'ion@example.ro',
  phone: '+40722000001',
};

const convertDocx = vi.fn<(docx: ArrayBuffer) => Promise<ArrayBuffer>>(
  async () => new TextEncoder().encode('%PDF-1.7 agreement').buffer
);
const withConverter = {
  ...env,
  PDF_CONVERSION: 'service',
  PDF: {
    convertDocx,
    convertDocuments: (files: ArrayBuffer[]) => convertDocx(files[0]!),
    convertForm: convertDocx,
    mergePdfs: (files: ArrayBuffer[]) => convertDocx(files[0]!),
  },
} as ApiEnv['Bindings'];

function agreementUpstream(overrides: Record<string, UpstreamRoute> = {}) {
  return {
    '/rest/v1/employee_signing_agreements': () => [],
    '/rest/v1/employees': () => [employeeRow],
    '/rest/v1/clients': () => [
      {
        organization_id: organizationId,
        legal_name: 'Fabrica Sigma SRL',
        cui: 'RO123456',
        county_code: 'TM',
        locality: 'Timișoara',
        address_line: 'Str. Fabricii 3',
        legal_representative_name: 'Maria IONESCU',
        legal_representative_role: 'Administrator',
      },
    ],
    '/rest/v1/organizations': () => [{ name: 'Protect', legal_name: 'Protect SSM Consult SRL' }],
    '/rest/v1/document_templates': () => [
      {
        type_key: 'signing_agreement',
        title: 'Act adițional',
        document_template_versions: [
          { id: 'v1', version: 1, storage_path: 'built-in/signing_agreement/v1.docx' },
        ],
      },
    ],
    'POST /storage/v1/object/sign/document-templates/built-in/signing_agreement/v1.docx': () => ({
      signedURL: '/object/sign/document-templates/built-in/signing_agreement/v1.docx?token=t',
    }),
    'GET /storage/v1/object/sign/document-templates/built-in/signing_agreement/v1.docx': () =>
      new Response(readFileSync(new URL('act_aditional_semnare_electronica.docx', templatesUrl))),
    ...overrides,
  };
}

const agreementPath = `/clients/${clientId}/employees/${employeeId}/signing-agreement`;

describe('the signing agreement', () => {
  beforeEach(() => convertDocx.mockClear());

  it('is drawn up from the template with the employee, the client and the provider', async () => {
    mockUpstream(agreementUpstream());

    const response = await request(agreementPath, {}, withConverter);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain(
      'filename="Act-aditional-semnare-electronica-Popescu-Ion.pdf"'
    );
    const text = documentText(new Uint8Array(convertDocx.mock.calls[0]![0]));
    expect(text).toContain('POPESCU Ion');
    expect(text).toContain('Fabrica Sigma SRL');
    expect(text).toContain('Protect SSM Consult SRL');
    expect(text).toContain('adresa de e-mail comunicată angajatorului');
    expect(text).not.toContain('{');
    const [employee] = callsTo('/rest/v1/employees');
    expect(employee!.url.searchParams.get('select')).toContain('contract_number');
    const [read] = callsTo(
      '/storage/v1/object/sign/document-templates/built-in/signing_agreement/v1.docx',
      'POST'
    );
    expect(read!.secret).toBe(false);
  });

  it('names the phone for an employee without an email, and refuses one with neither', async () => {
    mockUpstream(
      agreementUpstream({ '/rest/v1/employees': () => [{ ...employeeRow, email: null }] })
    );
    await request(agreementPath, {}, withConverter);
    expect(documentText(new Uint8Array(convertDocx.mock.calls[0]![0]))).toContain(
      'numărul de telefon mobil comunicat angajatorului'
    );

    mockUpstream(
      agreementUpstream({
        '/rest/v1/employees': () => [{ ...employeeRow, email: null, phone: null }],
      })
    );
    const response = await request(agreementPath, {}, withConverter);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'employee_has_no_address' });
  });

  it('is drawn up for the participant from their own record, the template read with the secret key', async () => {
    portalUpstream('employee', agreementUpstream());

    const response = await request(
      `/portal/participants/${participantId}/signing-agreement`,
      {},
      withConverter
    );

    expect(response.status).toBe(200);
    const [employee] = callsTo('/rest/v1/employees');
    expect(employee!.url.searchParams.get('id')).toBe(`eq.${employeeId}`);
    expect(employee!.url.searchParams.get('select')).not.toContain('cnp');
    const [templates] = callsTo('/rest/v1/document_templates');
    expect(templates!.secret).toBe(false);
    const [read] = callsTo(
      '/storage/v1/object/sign/document-templates/built-in/signing_agreement/v1.docx',
      'POST'
    );
    expect(read!.secret).toBe(true);
  });

  const stateSources = (
    client: Record<string, unknown> = {},
    employee: Record<string, unknown> = {}
  ): Record<string, UpstreamRoute> => ({
    '/rest/v1/employees': () => [
      { id: employeeId, email: 'ion@example.ro', phone: null, ...employee },
    ],
    '/rest/v1/employee_signing_agreements': () => [],
    '/rest/v1/clients': () => [
      {
        legal_representative_name: 'Maria IONESCU',
        legal_representative_role: 'Administrator',
        ...client,
      },
    ],
  });
  const memberStatePath = `/clients/${clientId}/employees/${employeeId}/signing-agreement/state`;
  const portalStatePath = `/portal/participants/${participantId}/signing-agreement/state`;

  it('awaits the employee before any member records it, in the app and in the portal', async () => {
    mockUpstream(stateSources());
    expect(await (await request(memberStatePath)).json()).toEqual({
      agreement: null,
      unavailable: null,
    });

    portalUpstream('employee', stateSources());
    expect(await (await request(portalStatePath)).json()).toEqual({
      agreement: null,
      unavailable: null,
    });
  });

  it("says why the employee cannot sign it yet: the client's representative, or their own address", async () => {
    portalUpstream('employee', stateSources({ legal_representative_role: null }));
    expect(await (await request(portalStatePath)).json()).toEqual({
      agreement: null,
      unavailable: { reason: 'missing_document_data', missing: ['client.representativeRole'] },
    });

    mockUpstream(stateSources({}, { email: null }));
    expect(await (await request(memberStatePath)).json()).toEqual({
      agreement: null,
      unavailable: { reason: 'employee_has_no_address', missing: [] },
    });
  });

  it('says nothing once the agreement no longer awaits the employee', async () => {
    mockUpstream({
      ...stateSources({ legal_representative_role: null }),
      '/rest/v1/employee_signing_agreements': () => [
        {
          state: 'signed_on_paper',
          generated_at: '2026-10-01T08:00:00+00:00',
          signed_at: '2026-10-02T08:00:00+00:00',
          client_file_id: null,
          storage_path: null,
          employee_signed_at: null,
          employer_signed_at: null,
        },
      ],
    });
    expect(await (await request(memberStatePath)).json()).toMatchObject({
      agreement: { state: 'signed_on_paper', awaiting: null },
      unavailable: null,
    });
  });

  it('answers 404 to a client administrator who is not an employee', async () => {
    portalUpstream('client_administrator');

    const response = await request(`/portal/participants/${participantId}/signing-agreement/state`);

    expect(response.status).toBe(404);
  });

  const storedPath = `signing-agreements/${clientId}/${employeeId}/v1-abcd1234.pdf`;
  const stored = {
    '/rest/v1/employee_signing_agreements': () => [{ storage_path: storedPath }],
    '/rest/v1/employees': () => [{ last_name: 'Popescu', first_name: 'Ion' }],
    [`POST /storage/v1/object/sign/documents/${storedPath}`]: () => ({
      signedURL: `/object/sign/documents/${storedPath}?token=t`,
    }),
    [`GET /storage/v1/object/sign/documents/${storedPath}`]: () =>
      new Response('%PDF-1.7 signed agreement'),
  };

  it('answers the stored, signed file once a party has signed, read with the secret key', async () => {
    mockUpstream(stored);

    const response = await request(agreementPath, {}, withConverter);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('%PDF-1.7 signed agreement');
    expect(convertDocx).not.toHaveBeenCalled();
    const [row] = callsTo('/rest/v1/employee_signing_agreements');
    expect(row!.secret).toBe(false);
    expect(row!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    const [read] = callsTo(`/storage/v1/object/sign/documents/${storedPath}`, 'POST');
    expect(read!.secret).toBe(true);
  });

  it('signs a ten-minute link to the stored file with the secret key, for a real anchor', async () => {
    mockUpstream(stored);

    const response = await request(`${agreementPath}/link`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: expect.stringContaining(`/storage/v1/object/sign/documents/${storedPath}`),
      fileName: 'Act-aditional-semnare-electronica-Popescu-Ion.pdf',
      expiresInSeconds: 600,
    });
    const [row] = callsTo('/rest/v1/employee_signing_agreements');
    expect(row!.secret).toBe(false);
    const [signed] = callsTo(`/storage/v1/object/sign/documents/${storedPath}`, 'POST');
    expect(signed!.secret).toBe(true);
    expect(signed!.body).toEqual({ expiresIn: 600 });
    expect(convertDocx).not.toHaveBeenCalled();
  });

  it('has no link before anyone has signed the agreement', async () => {
    mockUpstream(agreementUpstream());

    const response = await request(`${agreementPath}/link`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ reason: 'agreement_not_stored' });
    expect(callsTo(`/storage/v1/object/sign/documents/${storedPath}`, 'POST')).toEqual([]);
  });

  it("signs the link to the participant's own stored agreement, and to an employee's for the administrator", async () => {
    portalUpstream('employee', stored);
    const own = await request(`/portal/participants/${participantId}/signing-agreement/link`);
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({
      fileName: 'Act-aditional-semnare-electronica-Popescu-Ion.pdf',
      expiresInSeconds: 600,
    });

    portalUpstream('client_administrator', stored);
    const administered = await request(
      `/portal/participants/${participantId}/employees/${employeeId}/signing-agreement/link`
    );
    expect(administered.status).toBe(200);
    expect(await administered.json()).toMatchObject({ expiresInSeconds: 600 });

    portalUpstream('employee', stored);
    const refused = await request(
      `/portal/participants/${participantId}/employees/${employeeId}/signing-agreement/link`
    );
    expect(refused.status).toBe(403);
  });

  it("answers the client administrator an employee's stored agreement", async () => {
    portalUpstream('client_administrator', stored);

    const response = await request(
      `/portal/participants/${participantId}/employees/${employeeId}/signing-agreement`,
      {},
      withConverter
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('%PDF-1.7 signed agreement');
  });

  it("refuses an employee the route of the administrator's", async () => {
    portalUpstream('employee', stored);

    const response = await request(
      `/portal/participants/${participantId}/employees/${employeeId}/signing-agreement`
    );

    expect(response.status).toBe(403);
  });
});

describe("the client's signing agreements for the administrator", () => {
  const listPath = `/portal/participants/${participantId}/employees/signing-agreements`;
  const row = (overrides: Record<string, unknown>) => ({
    state: 'generated',
    generated_at: '2026-10-01T09:00:00+00:00',
    signed_at: null,
    client_file_id: null,
    employee_signed_at: '2026-10-02T09:00:00+00:00',
    employer_signed_at: null,
    employees: { id: employeeId, last_name: 'Popescu', first_name: 'Ion' },
    ...overrides,
  });

  it('lists those awaiting the employer first, then the signed ones, by name', async () => {
    const other = 'e0000000-0000-4000-8000-0000000000aa';
    portalUpstream('client_administrator', {
      '/rest/v1/employee_signing_agreements': () => [
        row({
          state: 'signed_electronically',
          signed_at: '2026-10-03T09:00:00+00:00',
          employer_signed_at: '2026-10-03T09:00:00+00:00',
          employees: { id: other, last_name: 'Albu', first_name: 'Dan' },
        }),
        row({}),
      ],
    });

    const response = await request(listPath);

    expect(response.status).toBe(200);
    const body = portalSigningAgreementsResponseSchema.parse(await response.json());
    expect(body.items.map((item) => [item.employee.id, item.awaitingEmployer])).toEqual([
      [employeeId, true],
      [other, false],
    ]);
    expect(body.items[0]!.agreement.employeeSignedAt).toBe('2026-10-02T09:00:00.000Z');
    const [query] = callsTo('/rest/v1/employee_signing_agreements');
    expect(query!.secret).toBe(false);
    expect(query!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(query!.url.searchParams.get('or')).toBe(
      '(state.eq.signed_electronically,and(state.eq.generated,employee_signed_at.not.is.null,employer_signed_at.is.null))'
    );
  });

  it('answers 403 to an employee', async () => {
    portalUpstream('employee');

    expect((await request(listPath)).status).toBe(403);
  });
});

describe('the signing agreement state', () => {
  const statePath = `${agreementPath}/state`;

  it('is null until one is recorded or the employee signs it', async () => {
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId, email: 'ion@example.ro', phone: null }],
      '/rest/v1/clients': () => [
        { legal_representative_name: 'Maria IONESCU', legal_representative_role: 'Administrator' },
      ],
      '/rest/v1/employee_signing_agreements': () => [],
    });

    expect(await (await request(statePath)).json()).toEqual({ agreement: null, unavailable: null });
  });

  it('inserts a first state as the member, for the organization and the client', async () => {
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId, email: 'ion@example.ro', phone: null }],
      '/rest/v1/clients': () => [
        { legal_representative_name: 'Maria IONESCU', legal_representative_role: 'Administrator' },
      ],
      'GET /rest/v1/employee_signing_agreements': () => [],
      'POST /rest/v1/employee_signing_agreements': ({ body }) => [
        {
          ...(body as Record<string, unknown>),
          generated_at: '2026-10-18T09:00:00+00:00',
        },
      ],
    });

    const response = await request(statePath, { method: 'PUT', body: { state: 'generated' } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      agreement: { state: 'generated', signedAt: null, clientFileId: null },
    });
    const [insert] = callsTo('/rest/v1/employee_signing_agreements', 'POST');
    expect(insert!.secret).toBe(false);
    expect(insert!.body).toMatchObject({
      employee_id: employeeId,
      client_id: clientId,
      organization_id: organizationId,
      state: 'generated',
    });
    expect(insert!.body).not.toHaveProperty('marked_by');
  });

  it('refuses to hand out an agreement of a client without a legal representative', async () => {
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId, email: 'ion@example.ro', phone: null }],
      '/rest/v1/clients': () => [
        { legal_representative_name: 'Maria IONESCU', legal_representative_role: null },
      ],
      'GET /rest/v1/employee_signing_agreements': () => [],
    });

    const response = await request(statePath, { method: 'PUT', body: { state: 'generated' } });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: 'missing_document_data',
      missing: ['client.representativeRole'],
    });
    expect(callsTo('/rest/v1/employee_signing_agreements', 'POST')).toHaveLength(0);
  });

  it.each(['withdrawn', 'in_contract'] as const)(
    'records an agreement as %s, without a signing moment',
    async (state) => {
      mockUpstream({
        '/rest/v1/employees': () => [{ id: employeeId, email: 'ion@example.ro', phone: null }],
        '/rest/v1/clients': () => [
          {
            legal_representative_name: 'Maria IONESCU',
            legal_representative_role: 'Administrator',
          },
        ],
        'GET /rest/v1/employee_signing_agreements': () => [],
        'POST /rest/v1/employee_signing_agreements': ({ body }) => [
          { ...(body as Record<string, unknown>), generated_at: '2026-10-18T09:00:00+00:00' },
        ],
      });

      const response = await request(statePath, { method: 'PUT', body: { state } });

      expect(await response.json()).toMatchObject({
        agreement: { state, signedAt: null, awaiting: null },
      });
    }
  );

  it('updates only the columns members may change when the paper copy comes back', async () => {
    const fileId = 'c0000000-0000-4000-8000-000000000001';
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId, email: 'ion@example.ro', phone: null }],
      '/rest/v1/clients': () => [
        { legal_representative_name: 'Maria IONESCU', legal_representative_role: 'Administrator' },
      ],
      'GET /rest/v1/employee_signing_agreements': () => [
        {
          state: 'generated',
          generated_at: '2026-10-01T09:00:00+00:00',
          signed_at: null,
          client_file_id: null,
        },
      ],
      'PATCH /rest/v1/employee_signing_agreements': ({ body }) => [
        { generated_at: '2026-10-01T09:00:00+00:00', ...(body as Record<string, unknown>) },
      ],
    });

    const response = await request(statePath, {
      method: 'PUT',
      body: { state: 'signed_on_paper', clientFileId: fileId },
    });

    expect(await response.json()).toMatchObject({
      agreement: { state: 'signed_on_paper', clientFileId: fileId, signedAt: expect.any(String) },
    });
    const [update] = callsTo('/rest/v1/employee_signing_agreements', 'PATCH');
    expect(Object.keys(update!.body as object).sort()).toEqual([
      'client_file_id',
      'signed_at',
      'state',
    ]);
  });

  it('answers 409 for an agreement signed electronically', async () => {
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId, email: 'ion@example.ro', phone: null }],
      '/rest/v1/clients': () => [
        { legal_representative_name: 'Maria IONESCU', legal_representative_role: 'Administrator' },
      ],
      'GET /rest/v1/employee_signing_agreements': () => [
        {
          state: 'signed_electronically',
          generated_at: '2026-10-01T09:00:00+00:00',
          signed_at: '2026-10-02T09:00:00+00:00',
          client_file_id: null,
        },
      ],
      'PATCH /rest/v1/employee_signing_agreements': () =>
        databaseError('SIG07', 'agreement_signed_electronically'),
    });

    const response = await request(statePath, { method: 'PUT', body: { state: 'generated' } });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'agreement_signed_electronically' });
  });

  it('refuses signed_electronically from a member', async () => {
    mockUpstream({});

    const response = await request(statePath, {
      method: 'PUT',
      body: { state: 'signed_electronically' },
    });

    expect(response.status).toBe(400);
  });
});
