import { readFileSync } from 'node:fs';

import {
  portalSignatureRequestsResponseSchema,
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
  it("gives each of the record's slots its state", async () => {
    recordUpstream();

    const response = await request(signaturesPath);

    expect(response.status).toBe(200);
    const { slots } = recordSignaturesResponseSchema.parse(await response.json());
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

  it('voids the signatures with the reason', async () => {
    recordUpstream({ '/rest/v1/rpc/void_training_signatures': () => 2 });

    const response = await request(`${signaturesPath}/void`, {
      method: 'POST',
      body: { reason: ' Data greșită ' },
    });

    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/rpc/void_training_signatures')[0]!.body).toEqual({
      p_record_id: recordId,
      p_reason: 'Data greșită',
    });
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
        slot: 'trainer',
        state: 'pending',
        issuedAt: '2026-10-02T08:00:00.000Z',
        notifiedAt: null,
        client: { id: clientId, name: 'Fabrica Sigma SRL' },
        record: {
          id: recordId,
          trainingId,
          employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
          domain: 'ssm',
          phase: 'periodic',
          heldOn: '2026-10-01',
        },
        signer: { accountId: user.id, name: null },
        agreementState: null,
      },
    ]);
    const [call] = callsTo('/rest/v1/signature_requests');
    expect(call!.url.searchParams.get('signer_account_id')).toBe(`eq.${user.id}`);
    expect(call!.url.searchParams.get('state')).toBe('eq.pending');
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
              employee_signing_agreements: [{ state: 'signed_on_paper' }],
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
      agreementState: 'signed_on_paper',
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
    employee_signing_agreements: [{ state: 'generated' }],
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
      agreementState: 'generated',
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
          training_records: portalRecord,
        },
      ],
    });

    const response = await request(
      `/portal/participants/${participantId}/employees/signature-requests`
    );

    expect(response.status).toBe(200);
    const { items } = portalSignatureRequestsResponseSchema.parse(await response.json());
    expect(items[0]).toMatchObject({ slot: 'trainee', signerName: 'Popescu Ion' });
    const [call] = callsTo('/rest/v1/signature_requests');
    expect(call!.secret).toBe(false);
    expect(call!.url.searchParams.get('select')).not.toMatch(/cnp|notes/);
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

  it('answers 404 to a client administrator who is not an employee', async () => {
    portalUpstream('client_administrator');

    const response = await request(`/portal/participants/${participantId}/signing-agreement/state`);

    expect(response.status).toBe(404);
  });
});

describe('the signing agreement state', () => {
  const statePath = `${agreementPath}/state`;

  it('is null until one is recorded', async () => {
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId }],
      '/rest/v1/employee_signing_agreements': () => [],
    });

    expect(await (await request(statePath)).json()).toEqual({ agreement: null });
  });

  it('inserts a first state as the member, for the organization and the client', async () => {
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId }],
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
      marked_by: null,
    });
  });

  it('updates only the columns members may change when the paper copy comes back', async () => {
    const fileId = 'c0000000-0000-4000-8000-000000000001';
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId }],
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
      'marked_by',
      'signed_at',
      'state',
    ]);
    expect(update!.body).toMatchObject({ marked_by: user.id });
  });

  it('answers 409 for an agreement signed electronically', async () => {
    mockUpstream({
      '/rest/v1/employees': () => [{ id: employeeId }],
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
