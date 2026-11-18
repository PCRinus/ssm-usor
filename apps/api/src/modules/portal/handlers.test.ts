import { readFileSync } from 'node:fs';

import {
  portalEmployeeDataSchema,
  portalMeSchema,
  portalResponsiblePersonsResponseSchema,
  portalTrainingRecordsResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from '../../lib/env';
import { apiRequest, testAccessToken } from '../../test/request';
import {
  callsTo,
  fetchMock,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
  testEnv,
  testSecretKey,
  testUser as user,
  type UpstreamCall,
} from '../../test/upstream';

const pdfBytes = new TextEncoder().encode('%PDF-1.7 sheet');
const convertDocx = vi.fn<(docx: ArrayBuffer) => Promise<ArrayBuffer>>(
  async () => pdfBytes.slice().buffer
);
const mergePdfs = vi.fn<(files: ArrayBuffer[]) => Promise<ArrayBuffer>>(
  async () => new TextEncoder().encode('%PDF-1.7 merged').buffer as ArrayBuffer
);

const env = testEnv({
  SUPABASE_SECRET_KEY: testSecretKey,
  PDF_CONVERSION: 'service',
  PDF: {
    convertDocx,
    convertDocuments: (files: ArrayBuffer[]) => convertDocx(files[0]!),
    convertForm: convertDocx,
    mergePdfs,
  },
} as Partial<ApiEnv['Bindings']>);

const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const clientId = 'c1c1c1c1-0000-4000-8000-000000000001';
const otherClientId = 'c1c1c1c1-0000-4000-8000-000000000002';
const employeeId = 'e1e1e1e1-0000-4000-8000-000000000001';
const colleagueId = 'e1e1e1e1-0000-4000-8000-000000000002';
const employeeParticipantId = '88888888-0000-4000-8000-000000000001';
const administratorParticipantId = '88888888-0000-4000-8000-000000000002';
const strangerParticipantId = '88888888-0000-4000-8000-000000000009';

const employeeParticipation = {
  participant_id: employeeParticipantId,
  organization_id: organizationId,
  organization_name: 'Protect SSM',
  client_id: clientId,
  client_name: 'S.C. CLIENT DEMO S.R.L.',
  kind: 'employee',
  employee_id: employeeId,
  full_name: 'Popescu Ion',
  notice_version: null,
  language: null,
};

const administratorParticipation = {
  participant_id: administratorParticipantId,
  organization_id: organizationId,
  organization_name: 'Protect SSM',
  client_id: otherClientId,
  client_name: 'S.C. ALTA S.R.L.',
  kind: 'client_administrator',
  employee_id: null,
  full_name: 'Popescu Ion',
  notice_version: '2026-10-17',
  language: 'en',
};

const trainingStatus = {
  ssm_state: 'current',
  ssm_due_on: '2027-01-06',
  ssm_last_periodic_on: '2026-04-03',
  ssm_interval_months: 6,
  ssm_interval_source: 'client',
  su_state: 'untrained',
  su_due_on: null,
  su_last_periodic_on: null,
  su_interval_months: null,
  su_interval_source: null,
};

const employeeRow = {
  id: employeeId,
  last_name: 'Popescu',
  first_name: 'Ion',
  employee_number: '0042',
  job_title: 'Sudor',
  hired_at: '2020-03-01',
  home_address: 'Str. Lungă 12, Timișoara',
  residence_address: 'Str. Florilor 3, Dumbrăvița',
  birth_date: '1988-03-14',
  birth_place: 'Lugoj',
  blood_group: 'A(II)',
  rh_factor: '+',
  qualification: null,
  education: null,
  authorizations: null,
  commute_route: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
  commute_means: ['public_transport', 'on_foot'],
  commute_means_other: null,
  commute_minutes: 25,
  job_positions: { name: 'Sudor', work_zone: 'Atelier' },
  client_workplaces: { id: 'b1b1b1b1-0000-4000-8000-000000000001', name: 'Atelier' },
  training_status: trainingStatus,
  test_status: {
    ssm_state: 'pending',
    ssm_awaiting_test: 'hiring',
    ssm_last_passed_on: null,
    su_state: 'none',
    su_awaiting_test: null,
    su_last_passed_on: null,
    su_due_on: null,
  },
};

const recordRow = {
  id: 'a1a1a1a1-0000-4000-8000-000000000001',
  occupation: 'Sudor',
  admitted_on: '2026-01-06',
  admitted_by_name: 'Ion POP',
  admitted_by_job_title: 'Șef atelier',
  trainings: {
    domain: 'ssm',
    phase: 'workplace',
    held_on: '2026-01-06',
    duration_minutes: 120,
    material: 'I.P.S.S.M. Art. 1 – 60',
    trainer_name: 'Ion POP',
    trainer_job_title: 'Șef atelier',
    verifier_name: null,
    verifier_job_title: null,
    supplementary_reason: null,
    source: 'app',
    created_at: '2026-01-06T10:00:00+00:00',
  },
  signature_requests: [],
  training_signatures: [],
};

const signerAccountId = '7a7a7a7a-0000-4000-8000-000000000001';
const traineeRequestId = '9b9b9b9b-0000-4000-8000-000000000001';
const voidedRequestId = '9b9b9b9b-0000-4000-8000-000000000002';
const paperRequestId = '9b9b9b9b-0000-4000-8000-000000000003';

const signedRecordRow = {
  ...recordRow,
  trainings: {
    ...recordRow.trainings,
    verifier_name: 'Maria IONESCU',
    verifier_job_title: 'Inspector SSM',
  },
  signature_requests: [
    {
      id: paperRequestId,
      slot: 'trainer',
      signer_account_id: null,
      state: 'signed',
      issued_at: '2026-10-17T10:00:00+00:00',
      notified_at: null,
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-17T10:00:00+00:00',
    },
    {
      id: voidedRequestId,
      slot: 'admitter',
      signer_account_id: signerAccountId,
      state: 'void',
      issued_at: '2026-10-17T08:00:00+00:00',
      notified_at: '2026-10-17T08:00:05+00:00',
      voided_at: '2026-10-17T09:00:00+00:00',
      void_reason: 'Greșeală la data admiterii',
      created_at: '2026-10-17T08:00:00+00:00',
    },
    {
      id: traineeRequestId,
      slot: 'trainee',
      signer_account_id: user.id,
      state: 'signed',
      issued_at: '2026-10-16T08:00:00+00:00',
      notified_at: '2026-10-16T08:00:05+00:00',
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-16T08:00:00+00:00',
    },
  ],
  training_signatures: [
    {
      request_id: traineeRequestId,
      slot: 'trainee',
      method: 'electronic',
      signer_account_id: user.id,
      signer_name: 'Popescu Ion',
      signer_job_title: null,
      signed_at: '2026-10-18T07:12:00+00:00',
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-18T07:12:00+00:00',
    },
    {
      request_id: paperRequestId,
      slot: 'trainer',
      method: 'paper',
      signer_account_id: null,
      signer_name: 'Ion POP',
      signer_job_title: 'Șef atelier',
      signed_at: '2026-10-17T10:00:00+00:00',
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-17T10:00:00+00:00',
    },
  ],
};

const responsiblePersonRow = {
  id: 'f1f1f1f1-0000-4000-8000-000000000001',
  full_name: 'Ion Pop',
  job_title: 'Șef atelier',
  roles: ['workplace_manager', 'first_aid'],
  employee_id: colleagueId,
  client_workplaces: { name: 'Atelier' },
};

const templatesUrl = new URL('../../../../../packages/document-engine/templates/', import.meta.url);

const upstreamDefaults = {
  participations: () => Response.json([employeeParticipation, administratorParticipation]),
  notice: () => Response.json(true),
  language: () => Response.json(true),
  employees: () => Response.json([employeeRow]),
  records: () => Response.json([recordRow]),
  testResults: (url: URL): Response => {
    void url;
    return Response.json([]);
  },
  responsiblePersons: () => Response.json([responsiblePersonRow]),
  signedSheets: (url: URL): Response => {
    void url;
    return Response.json([]);
  },
};

const storedSheetBytes = new TextEncoder().encode('%PDF-1.7 signed sheet');
const storedSheetRow = {
  id: '5d5d5d5d-0000-4000-8000-000000000001',
  organization_id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10',
  client_id: clientId,
  employee_id: employeeId,
  domain: 'ssm',
  sequence: 1,
  storage_path: `signed-sheets/${clientId}/${employeeId}/ssm-1/v3-abcdef12.pdf`,
  digest: 'd'.repeat(64),
  version: 3,
  row_capacity: 17,
  rows_used: 1,
  certified_at: '2026-10-18T09:30:00+00:00',
  created_at: '2026-10-18T09:00:00+00:00',
};
const withStoredSheet = (url: URL) =>
  Response.json(
    [url.searchParams.get('domain') ?? 'eq.ssm'].includes('eq.ssm') ? [storedSheetRow] : []
  );

const unsigned = (slot: string) => ({
  slot,
  state: 'unassigned',
  signedAt: null,
  signerName: null,
  signerJobTitle: null,
});

const signedUrl = ({ method, url }: UpstreamCall, file: () => BodyInit) =>
  method === 'POST'
    ? Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` })
    : new Response(file());

function mockUpstream(overrides: Partial<typeof upstreamDefaults> = {}) {
  const upstream = { ...upstreamDefaults, ...overrides };
  mockSignedInUpstream({
    [`/storage/v1/object/sign/documents/${storedSheetRow.storage_path}`]: (call) =>
      signedUrl(call, () => storedSheetBytes),
    '/storage/v1/object/sign/document-templates/built-in/training_sheet_ssm/new.docx': (call) =>
      signedUrl(call, () => readFileSync(new URL('fisa_instruire_ssm.docx', templatesUrl))),
    '/rest/v1/rpc/accept_participant_invitations': () => 0,
    '/rest/v1/rpc/current_participations': () => upstream.participations(),
    '/rest/v1/rpc/record_participant_notice': () => upstream.notice(),
    '/rest/v1/rpc/set_participant_language': () => upstream.language(),
    '/rest/v1/employees': () => upstream.employees(),
    '/rest/v1/training_records': () => upstream.records(),
    '/rest/v1/test_results': ({ url }) => upstream.testResults(url),
    '/rest/v1/client_responsible_persons': () => upstream.responsiblePersons(),
    '/rest/v1/signed_sheets': ({ url }) => upstream.signedSheets(url),
    '/rest/v1/organizations': () => ({ name: 'Protect SSM', phone: '+40256000000' }),
    '/rest/v1/clients': () => Response.json([{ legal_name: 'S.C. CLIENT DEMO S.R.L.' }]),
    '/rest/v1/client_workplaces': () =>
      Response.json([{ id: 'b1b1b1b1-0000-4000-8000-000000000001', name: 'Atelier' }]),
    '/rest/v1/document_templates': () =>
      Response.json([
        {
          type_key: 'training_sheet_ssm',
          title: 'Fișa',
          document_template_versions: [
            { id: 'v1', version: 1, storage_path: 'built-in/training_sheet_ssm/new.docx' },
          ],
        },
      ]),
  });
}

const request = (path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') =>
  apiRequest(path, { method, body, client: 'portal' }, env);

const own = (path: string) => `/portal/participants/${employeeParticipantId}${path}`;
const administered = (path: string) => `/portal/participants/${administratorParticipantId}${path}`;

stubFetch();

beforeEach(() => {
  convertDocx.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireParticipant', () => {
  it('accepts the open invitations before reading the participations', async () => {
    mockUpstream();

    await request('/portal/me');

    const order = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)).pathname)
      .filter((pathname) => pathname.startsWith('/rest/v1/rpc/'));
    expect(order).toEqual([
      '/rest/v1/rpc/accept_participant_invitations',
      '/rest/v1/rpc/current_participations',
    ]);
    expect(callsTo('/rest/v1/rpc/current_participations')[0]?.headers.get('Authorization')).toBe(
      `Bearer ${testAccessToken}`
    );
  });

  it('answers 403 to an account without participations', async () => {
    mockUpstream({ participations: () => Response.json([]) });

    const response = await request('/portal/me');

    expect(response.status).toBe(403);
  });

  it("answers 404 for a participation that is not the account's", async () => {
    mockUpstream();

    const response = await request(
      `/portal/participants/${strangerParticipantId}/training-records`
    );

    expect(response.status).toBe(404);
    expect(callsTo('/rest/v1/training_records')).toEqual([]);
  });
});

describe('GET /portal/me', () => {
  it('lists the participations without the organization id', async () => {
    mockUpstream();

    const response = await request('/portal/me');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(portalMeSchema.parse(body).participations).toEqual([
      {
        participantId: employeeParticipantId,
        organizationName: 'Protect SSM',
        clientId,
        clientName: 'S.C. CLIENT DEMO S.R.L.',
        kind: 'employee',
        employeeId,
        fullName: 'Popescu Ion',
        noticeVersion: null,
        language: null,
      },
      {
        participantId: administratorParticipantId,
        organizationName: 'Protect SSM',
        clientId: otherClientId,
        clientName: 'S.C. ALTA S.R.L.',
        kind: 'client_administrator',
        employeeId: null,
        fullName: 'Popescu Ion',
        noticeVersion: '2026-10-17',
        language: 'en',
      },
    ]);
    expect(JSON.stringify(body)).not.toContain(organizationId);
  });
});

describe('POST /portal/participants/{participantId}/notice', () => {
  it('records the version shown', async () => {
    mockUpstream();

    const response = await request(own('/notice'), { version: '2026-10-17' });

    expect(response.status).toBe(204);
    expect(callsTo('/rest/v1/rpc/record_participant_notice')[0]?.body).toEqual({
      p_participant_id: employeeParticipantId,
      p_version: '2026-10-17',
    });
  });

  it("does not record on a participation that is not the account's", async () => {
    mockUpstream();

    const response = await request(`/portal/participants/${strangerParticipantId}/notice`, {
      version: '2026-10-17',
    });

    expect(response.status).toBe(404);
    expect(callsTo('/rest/v1/rpc/record_participant_notice')).toEqual([]);
  });
});

describe('PUT /portal/participants/{participantId}/language', () => {
  it('saves the language on the participation', async () => {
    mockUpstream();

    const response = await request(own('/language'), { language: 'en' }, 'PUT');

    expect(response.status).toBe(204);
    expect(callsTo('/rest/v1/rpc/set_participant_language')[0]?.body).toEqual({
      p_participant_id: employeeParticipantId,
      p_language: 'en',
    });
  });

  it('refuses a language the portal does not have', async () => {
    mockUpstream();

    const response = await request(own('/language'), { language: 'fr' }, 'PUT');

    expect(response.status).toBe(400);
    expect(callsTo('/rest/v1/rpc/set_participant_language')).toEqual([]);
  });

  it("does not save on a participation that is not the account's", async () => {
    mockUpstream();

    const response = await request(
      `/portal/participants/${strangerParticipantId}/language`,
      { language: 'ro' },
      'PUT'
    );

    expect(response.status).toBe(404);
    expect(callsTo('/rest/v1/rpc/set_participant_language')).toEqual([]);
  });

  it('answers 404 when the database no longer finds the participation active', async () => {
    mockUpstream({ language: () => Response.json(false) });

    const response = await request(own('/language'), { language: 'ro' }, 'PUT');

    expect(response.status).toBe(404);
  });
});

describe('GET /portal/participants/{participantId}/training-records', () => {
  it('lists their own records newest first with the training state', async () => {
    mockUpstream();

    const response = await request(own('/training-records'));

    expect(response.status).toBe(200);
    const body = portalTrainingRecordsResponseSchema.parse(await response.json());
    expect(body.items).toEqual([
      {
        id: recordRow.id,
        domain: 'ssm',
        phase: 'workplace',
        heldOn: '2026-01-06',
        durationMinutes: 120,
        material: 'I.P.S.S.M. Art. 1 – 60',
        trainer: { name: 'Ion POP', jobTitle: 'Șef atelier' },
        verifier: null,
        supplementaryReason: null,
        source: 'app',
        occupation: 'Sudor',
        admission: { admittedOn: '2026-01-06', name: 'Ion POP', jobTitle: 'Șef atelier' },
        slots: [unsigned('trainee'), unsigned('trainer'), unsigned('admitter')],
      },
    ]);
    expect(body.training.ssm).toMatchObject({ state: 'current', dueOn: '2027-01-06' });
    expect(body.training.su.state).toBe('untrained');

    const query = callsTo('/rest/v1/training_records')[0]!.url.searchParams;
    expect(query.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('select')).not.toContain('notes');
    expect(query.get('order')).toContain('trainings(held_on).desc');
  });

  it('carries the state of each slot the record has, as the sheet prints it', async () => {
    mockUpstream({ records: () => Response.json([signedRecordRow]) });

    const response = await request(own('/training-records'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(portalTrainingRecordsResponseSchema.parse(body).items[0]!.slots).toEqual([
      {
        slot: 'trainee',
        state: 'signed',
        signedAt: '2026-10-18T07:12:00.000Z',
        signerName: 'Popescu Ion',
        signerJobTitle: null,
      },
      {
        slot: 'trainer',
        state: 'paper',
        signedAt: '2026-10-17T10:00:00.000Z',
        signerName: 'Ion POP',
        signerJobTitle: 'Șef atelier',
      },
      unsigned('verifier'),
      { ...unsigned('admitter'), state: 'void' },
    ]);
    const text = JSON.stringify(body);
    for (const kept of [
      signerAccountId,
      user.id,
      traineeRequestId,
      voidedRequestId,
      paperRequestId,
    ]) {
      expect(text).not.toContain(kept);
    }
    expect(text).not.toContain('Greșeală la data admiterii');
    expect(text).not.toMatch(/notifiedAt|issuedAt|voidReason|requestId/);

    const [records] = callsTo('/rest/v1/training_records');
    expect(records!.headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
    const query = records!.url.searchParams;
    expect(query.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('select')).toContain(
      'signature_requests!signature_requests_record_of_client('
    );
    expect(query.get('select')).toContain(
      'training_signatures!training_signatures_record_of_client('
    );
    expect(query.get('signature_requests.order')).toBe('created_at.desc');
    expect(query.get('training_signatures.order')).toBe('created_at.desc');
  });

  it('answers 404 for a client administrator who is not an employee', async () => {
    mockUpstream();

    const response = await request(administered('/training-records'));

    expect(response.status).toBe(404);
    expect(callsTo('/rest/v1/training_records')).toEqual([]);
  });
});

describe('GET /portal/participants/{participantId}/data', () => {
  it('answers what the sheets print and who corrects it, never the CNP or the notes', async () => {
    mockUpstream({
      employees: () => Response.json([{ ...employeeRow, cnp: '1880314350011', notes: 'Intern' }]),
    });

    const response = await request(own('/data'));

    expect(response.status).toBe(200);
    const body = await response.json();
    const text = JSON.stringify(body);
    expect(text).not.toContain('1880314350011');
    expect(text).not.toContain('Intern');
    expect(portalEmployeeDataSchema.parse(body)).toEqual({
      employee: {
        lastName: 'Popescu',
        firstName: 'Ion',
        employeeNumber: '0042',
        contractTitle: 'Sudor',
        position: 'Sudor',
        workplace: 'Atelier',
        hiredAt: '2020-03-01',
        homeAddress: 'Str. Lungă 12, Timișoara',
        residenceAddress: 'Str. Florilor 3, Dumbrăvița',
        birthDate: '1988-03-14',
        birthPlace: 'Lugoj',
        bloodGroup: 'A(II)',
        rhFactor: '+',
        qualification: null,
        education: null,
        authorizations: null,
        commuteRoute: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
        commuteMeans: ['on_foot', 'public_transport'],
        commuteMeansOther: null,
        commuteMinutes: 25,
      },
      training: expect.objectContaining({ ssm: expect.objectContaining({ state: 'current' }) }),
      client: { name: 'S.C. CLIENT DEMO S.R.L.' },
      provider: { name: 'Protect SSM', phone: '+40256000000' },
    });

    const employeeSelect = callsTo('/rest/v1/employees')[0]!.url.searchParams.get('select')!;
    expect(employeeSelect).not.toMatch(/\bcnp\b|\bnotes\b|\*/);
    const organizationSelect = callsTo('/rest/v1/organizations')[0]!.url.searchParams.get('select');
    expect(organizationSelect).toBe('name,phone');
  });
});

describe('the sheets', () => {
  it('answers the readiness of their own sheets', async () => {
    mockUpstream();

    const response = await request(own('/sheets'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ssm: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
      su: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
    });
  });

  it('answers the stored signed sheet once signing has started, read with the secret key', async () => {
    mockUpstream({
      employees: () => Response.json([{ ...employeeRow, commute_route: null }]),
      signedSheets: withStoredSheet,
    });

    const readiness = await request(own('/sheets'));
    expect(await readiness.json()).toEqual({
      ssm: {
        ready: true,
        missing: [],
        stored: true,
        sequences: [1],
        versions: { 1: `${storedSheetRow.id}:${storedSheetRow.version}` },
      },
      su: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
    });

    const response = await request(own('/sheets/ssm'));
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(storedSheetBytes);
    const [signed] = callsTo(`/storage/v1/object/sign/documents/${storedSheetRow.storage_path}`);
    expect(signed?.headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
    const [sheets] = callsTo('/rest/v1/signed_sheets');
    expect(sheets?.headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
    expect(sheets?.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(convertDocx).not.toHaveBeenCalled();
  });

  it('signs a ten-minute link to their stored sheet with the secret key, for a real anchor', async () => {
    mockUpstream({
      employees: () => Response.json([{ ...employeeRow, commute_route: null }]),
      signedSheets: withStoredSheet,
    });

    const response = await request(own('/sheets/ssm/link'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: expect.stringContaining(
        `/storage/v1/object/sign/documents/${storedSheetRow.storage_path}`
      ),
      fileName: 'Fisa-SSM-Popescu-Ion.pdf',
      expiresInSeconds: 600,
    });
    const [signed] = callsTo(`/storage/v1/object/sign/documents/${storedSheetRow.storage_path}`);
    expect(signed?.headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
    expect(signed?.body).toEqual({ expiresIn: 600 });
    expect(callsTo('/rest/v1/signed_sheets')[0]?.headers.get('Authorization')).toBe(
      `Bearer ${env.SUPABASE_SECRET_KEY}`
    );
    expect(convertDocx).not.toHaveBeenCalled();
  });

  it('has no link for a sheet drawn up on the spot', async () => {
    mockUpstream();

    const response = await request(own('/sheets/su/link'));

    expect(response.status).toBe(404);
    expect(convertDocx).not.toHaveBeenCalled();
  });

  it('draws their sheet, reading the template with the secret key', async () => {
    mockUpstream();

    const response = await request(own('/sheets/ssm'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
    const [signed] = callsTo(
      '/storage/v1/object/sign/document-templates/built-in/training_sheet_ssm/new.docx'
    );
    expect(signed?.headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
    expect(callsTo('/rest/v1/document_templates')[0]?.headers.get('Authorization')).toBe(
      `Bearer ${env.SUPABASE_SECRET_KEY}`
    );
  });

  it('names what the specialist still has to fill', async () => {
    mockUpstream({ employees: () => Response.json([{ ...employeeRow, commute_route: null }]) });

    const response = await request(own('/sheets/ssm'));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: 'missing_sheet_data',
      missing: ['employee.commute_route'],
    });
    expect(convertDocx).not.toHaveBeenCalled();
  });
});

describe("the client administrator's places", () => {
  it("lists the client's current employees with their training states", async () => {
    mockUpstream();

    const response = await request(administered('/employees'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          id: employeeId,
          lastName: 'Popescu',
          firstName: 'Ion',
          position: 'Sudor',
          workplace: 'Atelier',
          training: expect.objectContaining({
            su: expect.objectContaining({ state: 'untrained' }),
          }),
          tests: {
            ssm: { state: 'pending', awaitingTest: 'hiring', lastPassedOn: null, dueOn: null },
            su: { state: 'none', awaitingTest: null, lastPassedOn: null, dueOn: null },
          },
        },
      ],
    });
    expect(callsTo('/rest/v1/employees')[0]!.url.searchParams.get('select')).toContain(
      'test_status('
    );
    const query = callsTo('/rest/v1/employees')[0]!.url.searchParams;
    expect(query.get('client_id')).toBe(`eq.${otherClientId}`);
    expect(query.get('status')).toBe('neq.terminated');
    expect(query.get('archived_at')).toBe('is.null');
  });

  it("signs a link to an employee's stored sheet under the administered client", async () => {
    mockUpstream({ signedSheets: withStoredSheet });

    const response = await request(administered(`/employees/${colleagueId}/sheets/ssm/link`));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ expiresInSeconds: 600 });
    const sheets = callsTo('/rest/v1/signed_sheets')[0]!.url.searchParams;
    expect(sheets.get('employee_id')).toBe(`eq.${colleagueId}`);
    expect(sheets.get('client_id')).toBe(`eq.${otherClientId}`);
  });

  it.each([
    '/employees',
    `/employees/${colleagueId}/training-records`,
    `/employees/${colleagueId}/sheets`,
    `/employees/${colleagueId}/sheets/su`,
    `/employees/${colleagueId}/sheets/su/link`,
  ])('answers 403 to an employee for %s', async (path) => {
    mockUpstream();

    const response = await request(own(path));

    expect(response.status).toBe(403);
    expect(callsTo('/rest/v1/employees')).toEqual([]);
  });

  it("reads an employee's records only under the administered client", async () => {
    mockUpstream();

    const response = await request(administered(`/employees/${colleagueId}/training-records`));

    expect(response.status).toBe(200);
    const employee = callsTo('/rest/v1/employees')[0]!.url.searchParams;
    expect(employee.get('id')).toBe(`eq.${colleagueId}`);
    expect(employee.get('client_id')).toBe(`eq.${otherClientId}`);
    const records = callsTo('/rest/v1/training_records')[0]!.url.searchParams;
    expect(records.get('client_id')).toBe(`eq.${otherClientId}`);
  });

  it('answers 404 for an employee who is not of the administered client', async () => {
    mockUpstream({ employees: () => Response.json([]) });

    const response = await request(administered(`/employees/${colleagueId}/sheets`));

    expect(response.status).toBe(404);
  });

  it("lists the client's active responsible persons as named, with their roles", async () => {
    mockUpstream();

    const response = await request(administered('/responsible-persons'));

    expect(response.status).toBe(200);
    expect(portalResponsiblePersonsResponseSchema.parse(await response.json())).toEqual({
      items: [
        {
          id: responsiblePersonRow.id,
          fullName: 'Ion Pop',
          jobTitle: 'Șef atelier',
          roles: ['workplace_manager', 'first_aid'],
          employeeId: colleagueId,
          workplace: 'Atelier',
        },
      ],
    });
    const query = callsTo('/rest/v1/client_responsible_persons')[0]!.url.searchParams;
    expect(query.get('client_id')).toBe(`eq.${otherClientId}`);
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('select')).not.toMatch(/\*|organization_id|created_by/);
  });

  it('says a responsible person who is not an employee and answers for every workplace', async () => {
    mockUpstream({
      responsiblePersons: () =>
        Response.json([{ ...responsiblePersonRow, employee_id: null, client_workplaces: null }]),
    });

    const response = await request(administered('/responsible-persons'));

    expect(await response.json()).toMatchObject({
      items: [{ employeeId: null, workplace: null }],
    });
  });

  it("answers 403 to an employee for the client's responsible persons", async () => {
    mockUpstream();

    const response = await request(own('/responsible-persons'));

    expect(response.status).toBe(403);
    expect(callsTo('/rest/v1/client_responsible_persons')).toEqual([]);
  });
});

describe("the participant's token", () => {
  it.each([
    own('/training-records'),
    own('/data'),
    own('/sheets'),
    own('/sheets/ssm'),
    administered('/employees'),
    administered('/responsible-persons'),
    administered(`/employees/${colleagueId}/training-records`),
    administered(`/employees/${colleagueId}/sheets`),
  ])('reads no table for %s, which the database would refuse it', async (path) => {
    mockUpstream();

    await request(path);

    const tableReads = fetchMock.mock.calls
      .map(([input, init]) => ({
        url: new URL(String(input)),
        headers: new Headers(init?.headers),
      }))
      .filter(
        ({ url }) =>
          url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/rest/v1/rpc/')
      );
    expect(tableReads.length).toBeGreaterThan(0);
    for (const { headers } of tableReads) {
      expect(headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
    }
  });
});
