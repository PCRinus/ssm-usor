import { readFileSync } from 'node:fs';

import {
  portalEmployeeDataSchema,
  portalMeSchema,
  portalTrainingRecordsResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const pdfBytes = new TextEncoder().encode('%PDF-1.7 sheet');
const convertDocx = vi.fn<(docx: ArrayBuffer) => Promise<ArrayBuffer>>(
  async () => pdfBytes.slice().buffer
);

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
  PDF_CONVERSION: 'service',
  PDF: { convertDocx, convertDocuments: (files: ArrayBuffer[]) => convertDocx(files[0]!) },
} as ApiEnv['Bindings'];

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ion@example.ro' };
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
};

const trainingStatus = {
  ssm_state: 'current',
  ssm_due_on: '2027-01-06',
  ssm_last_periodic_on: '2026-04-03',
  ssm_interval_months: 6,
  ssm_interval_source: 'client',
  psi_state: 'untrained',
  psi_due_on: null,
  psi_last_periodic_on: null,
  psi_interval_months: null,
  psi_interval_source: null,
};

const employeeRow = {
  id: employeeId,
  last_name: 'Popescu',
  first_name: 'Ion',
  employee_number: '0042',
  job_title: 'Sudor',
  hired_at: '2020-03-01',
  home_address: 'Str. Lungă 12, Timișoara',
  birth_date: '1988-03-14',
  birth_place: 'Lugoj',
  blood_group: 'A(II)',
  rh_factor: '+',
  qualification: null,
  education: null,
  authorizations: null,
  commute_route: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
  commute_minutes: 25,
  job_positions: { name: 'Sudor', work_zone: 'Atelier' },
  client_workplaces: { id: 'b1b1b1b1-0000-4000-8000-000000000001', name: 'Atelier' },
  training_status: trainingStatus,
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
    created_at: '2026-01-06T10:00:00+00:00',
  },
};

const templatesUrl = new URL('../../../../../packages/document-engine/templates/', import.meta.url);

const upstreamDefaults = {
  participations: () => Response.json([employeeParticipation, administratorParticipation]),
  notice: () => Response.json(true),
  employees: () => Response.json([employeeRow]),
  records: () => Response.json([recordRow]),
};

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(overrides: Partial<typeof upstreamDefaults> = {}) {
  const upstream = { ...upstreamDefaults, ...overrides };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname.startsWith('/storage/v1/object/sign/document-templates/')) {
      if (method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      return new Response(readFileSync(new URL('fisa_instruire_ssm.docx', templatesUrl)));
    }
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json({ ...user, is_anonymous: false });
      case '/rest/v1/rpc/accept_participant_invitations':
        return Response.json(0);
      case '/rest/v1/rpc/current_participations':
        return upstream.participations();
      case '/rest/v1/rpc/record_participant_notice':
        return upstream.notice();
      case '/rest/v1/employees':
        return upstream.employees();
      case '/rest/v1/training_records':
        return upstream.records();
      case '/rest/v1/organizations':
        return Response.json({ name: 'Protect SSM', phone: '+40256000000' });
      case '/rest/v1/clients':
        return Response.json([{ legal_name: 'S.C. CLIENT DEMO S.R.L.' }]);
      case '/rest/v1/client_workplaces':
        return Response.json([{ id: 'b1b1b1b1-0000-4000-8000-000000000001', name: 'Atelier' }]);
      case '/rest/v1/document_templates':
        return Response.json([
          {
            type_key: 'training_sheet_ssm',
            title: 'Fișa',
            document_template_versions: [
              { id: 'v1', version: 1, storage_path: 'built-in/training_sheet_ssm/new.docx' },
            ],
          },
        ]);
    }
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const calls = (pathname: string) =>
  fetchMock.mock.calls
    .filter(([input]) => new URL(String(input)).pathname === pathname)
    .map(([input, init]) => ({
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    }));

const request = (path: string, body?: unknown) =>
  createApp().request(
    path,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-token' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env
  );

const own = (path: string) => `/portal/participants/${employeeParticipantId}${path}`;
const administered = (path: string) => `/portal/participants/${administratorParticipantId}${path}`;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  convertDocx.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(calls('/rest/v1/rpc/current_participations')[0]?.headers.get('Authorization')).toBe(
      'Bearer user-token'
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
    expect(calls('/rest/v1/training_records')).toEqual([]);
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
    expect(calls('/rest/v1/rpc/record_participant_notice')[0]?.body).toEqual({
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
    expect(calls('/rest/v1/rpc/record_participant_notice')).toEqual([]);
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
        occupation: 'Sudor',
        admission: { admittedOn: '2026-01-06', name: 'Ion POP', jobTitle: 'Șef atelier' },
      },
    ]);
    expect(body.training.ssm).toMatchObject({ state: 'current', dueOn: '2027-01-06' });
    expect(body.training.psi.state).toBe('untrained');

    const query = calls('/rest/v1/training_records')[0]!.url.searchParams;
    expect(query.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('select')).not.toContain('notes');
    expect(query.get('order')).toContain('trainings(held_on).desc');
  });

  it('answers 404 for a client administrator who is not an employee', async () => {
    mockUpstream();

    const response = await request(administered('/training-records'));

    expect(response.status).toBe(404);
    expect(calls('/rest/v1/training_records')).toEqual([]);
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
        birthDate: '1988-03-14',
        birthPlace: 'Lugoj',
        bloodGroup: 'A(II)',
        rhFactor: '+',
        qualification: null,
        education: null,
        authorizations: null,
        commuteRoute: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
        commuteMinutes: 25,
      },
      training: expect.objectContaining({ ssm: expect.objectContaining({ state: 'current' }) }),
      client: { name: 'S.C. CLIENT DEMO S.R.L.' },
      provider: { name: 'Protect SSM', phone: '+40256000000' },
    });

    const employeeSelect = calls('/rest/v1/employees')[0]!.url.searchParams.get('select')!;
    expect(employeeSelect).not.toMatch(/\bcnp\b|\bnotes\b|\*/);
    const organizationSelect = calls('/rest/v1/organizations')[0]!.url.searchParams.get('select');
    expect(organizationSelect).toBe('name,phone');
  });
});

describe('the sheets', () => {
  it('answers the readiness of their own sheets', async () => {
    mockUpstream();

    const response = await request(own('/sheets'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ssm: { ready: true, missing: [] },
      psi: { ready: true, missing: [] },
    });
  });

  it('draws their sheet, reading the template with the secret key', async () => {
    mockUpstream();

    const response = await request(own('/sheets/ssm'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdfBytes);
    const [signed] = calls(
      '/storage/v1/object/sign/document-templates/built-in/training_sheet_ssm/new.docx'
    );
    expect(signed?.headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
    expect(calls('/rest/v1/document_templates')[0]?.headers.get('Authorization')).toBe(
      'Bearer user-token'
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
            psi: expect.objectContaining({ state: 'untrained' }),
          }),
        },
      ],
    });
    const query = calls('/rest/v1/employees')[0]!.url.searchParams;
    expect(query.get('client_id')).toBe(`eq.${otherClientId}`);
    expect(query.get('status')).toBe('neq.terminated');
    expect(query.get('archived_at')).toBe('is.null');
  });

  it.each([
    '/employees',
    `/employees/${colleagueId}/training-records`,
    `/employees/${colleagueId}/sheets`,
    `/employees/${colleagueId}/sheets/psi`,
  ])('answers 403 to an employee for %s', async (path) => {
    mockUpstream();

    const response = await request(own(path));

    expect(response.status).toBe(403);
    expect(calls('/rest/v1/employees')).toEqual([]);
  });

  it("reads an employee's records only under the administered client", async () => {
    mockUpstream();

    const response = await request(administered(`/employees/${colleagueId}/training-records`));

    expect(response.status).toBe(200);
    const employee = calls('/rest/v1/employees')[0]!.url.searchParams;
    expect(employee.get('id')).toBe(`eq.${colleagueId}`);
    expect(employee.get('client_id')).toBe(`eq.${otherClientId}`);
    const records = calls('/rest/v1/training_records')[0]!.url.searchParams;
    expect(records.get('client_id')).toBe(`eq.${otherClientId}`);
  });

  it('answers 404 for an employee who is not of the administered client', async () => {
    mockUpstream({ employees: () => Response.json([]) });

    const response = await request(administered(`/employees/${colleagueId}/sheets`));

    expect(response.status).toBe(404);
  });
});
