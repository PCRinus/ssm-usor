import {
  apiErrorResponseSchema,
  employeeTrainingRecordListResponseSchema,
  trainingListResponseSchema,
  trainingProposalSchema,
  trainingResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import { buildDocumentContext } from '../documents/context';
import { facts } from '../documents/context.fixture';
import { hiringPlans } from './proposal';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CORS_ORIGINS: 'http://localhost:5173, https://app.ssmusor.ro',
};

const user = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'owner@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email' },
  user_metadata: {},
};

const membership = {
  user_id: user.id,
  organization_id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10',
  role: 'owner',
};

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const trainingId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const otherEmployeeId = '1d2e3f4a-5b6c-4d7e-8f90-a1b2c3d4e5f6';
const positionId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const revisionId = 'd1d1d1d1-0000-4000-8000-000000000001';

const client = {
  id: clientId,
  legal_representative_name: 'Maria IONESCU',
  legal_representative_role: 'Administrator',
  periodic_training_minutes: 90,
};

const trainingRow = {
  id: trainingId,
  client_id: clientId,
  domain: 'ssm',
  phase: 'workplace',
  held_on: '2026-10-01',
  duration_minutes: 240,
  material: 'I.P.S.S.M. Art. 1 – 290',
  trainer_name: 'Ion POP',
  trainer_job_title: 'Șef atelier',
  verifier_name: 'Dan MARIN',
  verifier_job_title: 'Inspector SSM',
  supplementary_reason: null,
  source: 'app',
  themes_revision_id: null,
  notes: null,
  created_at: '2026-10-01T10:00:00+00:00',
  updated_at: '2026-10-01T10:00:00+00:00',
};

const training = {
  id: trainingId,
  clientId,
  domain: 'ssm',
  phase: 'workplace',
  heldOn: '2026-10-01',
  durationMinutes: 240,
  material: 'I.P.S.S.M. Art. 1 – 290',
  trainer: { name: 'Ion POP', jobTitle: 'Șef atelier' },
  verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
  supplementaryReason: null,
  source: 'app',
  themesRevisionId: null,
  notes: null,
  createdAt: trainingRow.created_at,
  updatedAt: trainingRow.updated_at,
};

const recordRows = [
  {
    id: 'f1f1f1f1-0000-4000-8000-000000000002',
    occupation: 'Sudor',
    admitted_on: '2026-10-01',
    admitted_by_name: 'Ion POP',
    admitted_by_job_title: 'Șef atelier',
    employees: { id: otherEmployeeId, last_name: 'Ștefan', first_name: 'Ana' },
  },
  {
    id: 'f1f1f1f1-0000-4000-8000-000000000001',
    occupation: 'Sudor autorizat',
    admitted_on: '2026-10-01',
    admitted_by_name: 'Ion POP',
    admitted_by_job_title: 'Șef atelier',
    employees: { id: employeeId, last_name: 'Popescu', first_name: 'Ion' },
  },
];

type Handler = (init?: RequestInit, url?: URL) => Response | Promise<Response>;
type Upstream =
  | 'auth'
  | 'membership'
  | 'clients'
  | 'trainings'
  | 'records'
  | 'employees'
  | 'revisions'
  | 'save'
  | 'positions'
  | 'profiles'
  | 'organizations'
  | 'persons'
  | 'fireSafety'
  | 'requests';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>>) {
  const defaults: Record<Upstream, Handler> = {
    auth: () => Response.json(user),
    membership: () => Response.json([membership]),
    clients: () => Response.json([client]),
    trainings: () => Response.json([{ ...trainingRow, training_records: recordRows }]),
    records: () => Response.json([]),
    employees: () =>
      Response.json([
        { id: employeeId, job_positions: { name: 'Sudor autorizat ' } },
        { id: otherEmployeeId, job_positions: { name: 'Sudor' } },
      ]),
    revisions: () => Response.json([]),
    save: () => Response.json(trainingId),
    positions: () => Response.json([{ name: 'Sudor', staff_category: 'execution' }]),
    profiles: () =>
      Response.json([{ full_name: 'Dan MARIN', professional_title: 'Inspector SSM' }]),
    organizations: () => Response.json([{ fire_safety_technician_name: 'Radu STAN' }]),
    persons: () => Response.json([{ full_name: 'Ion POP', job_title: 'Șef atelier' }]),
    fireSafety: () => Response.json([{ periodic_training_hours: 2 }]),
    requests: () => Response.json([]),
  };
  const paths: Record<string, Upstream> = {
    '/auth/v1/user': 'auth',
    '/rest/v1/rpc/current_membership': 'membership',
    '/rest/v1/clients': 'clients',
    '/rest/v1/trainings': 'trainings',
    '/rest/v1/training_records': 'records',
    '/rest/v1/employees': 'employees',
    '/rest/v1/document_revisions': 'revisions',
    '/rest/v1/rpc/save_training': 'save',
    '/rest/v1/job_positions': 'positions',
    '/rest/v1/profiles': 'profiles',
    '/rest/v1/organizations': 'organizations',
    '/rest/v1/client_responsible_persons': 'persons',
    '/rest/v1/client_fire_safety': 'fireSafety',
    '/rest/v1/signature_requests': 'requests',
  };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const upstream = paths[url.pathname];
    if (!upstream) throw new Error(`Unexpected upstream request: ${url}`);
    return (handlers[upstream] ?? defaults[upstream])(init, url);
  });
}

const calls = (pathname: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);

const searchOf = (pathname: string, index = 0) =>
  new URL(String(calls(pathname)[index]![0])).searchParams;

const request = (path: string, init: RequestInit = {}) =>
  createApp().request(
    path,
    {
      ...init,
      headers: { Authorization: 'Bearer test-access-token', ...(init.headers ?? {}) },
    },
    env
  );

const send = (method: string, path: string, body: unknown) =>
  request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const trainingsPath = `/clients/${clientId}/trainings`;
const trainingPath = `${trainingsPath}/${trainingId}`;

const validBody = {
  domain: 'ssm',
  phase: 'workplace',
  heldOn: '2026-10-01',
  durationMinutes: 240,
  material: '  I.P.S.S.M. Art. 1 – 290 ',
  trainer: { name: 'Ion POP', jobTitle: 'Șef atelier' },
  verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
  employeeIds: [employeeId, otherEmployeeId],
  admission: { admittedOn: '2026-10-01', name: 'Ion POP', jobTitle: 'Șef atelier' },
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T09:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /clients/{clientId}/trainings', () => {
  it('lists the trainings held, newest first, with their attendees by name', async () => {
    mockUpstream({
      trainings: () =>
        Response.json([
          {
            ...trainingRow,
            training_records: recordRows.map(({ employees }, index) => ({
              employees,
              training_signatures:
                index === 0 ? [{ method: 'electronic', voided_at: '2026-10-18T09:00:00Z' }] : [],
              signed_sheet_rows: [],
            })),
          },
        ]),
    });
    const response = await request(trainingsPath);
    expect(response.status).toBe(200);
    expect(trainingListResponseSchema.parse(await response.json())).toEqual({
      items: [
        {
          ...training,
          signed: false,
          hasSignatures: true,
          attendeeCount: 2,
          attendees: [
            { employeeId, lastName: 'Popescu', firstName: 'Ion' },
            { employeeId: otherEmployeeId, lastName: 'Ștefan', firstName: 'Ana' },
          ],
        },
      ],
    });
    const query = searchOf('/rest/v1/trainings');
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('select')).toContain(
      'training_records(employees(id,last_name,first_name),training_signatures(method,voided_at),signed_sheet_rows!signed_sheet_rows_record_of_client(id))'
    );
    expect(query.get('order')).toBe('held_on.desc,created_at.desc,id.asc');
    expect(query.get('domain')).toBeNull();
  });

  it('filters by domain and phase', async () => {
    mockUpstream({ trainings: () => Response.json([]) });
    const response = await request(`${trainingsPath}?domain=psi&phase=periodic`);
    expect(response.status).toBe(200);
    const query = searchOf('/rest/v1/trainings');
    expect(query.get('domain')).toBe('eq.psi');
    expect(query.get('phase')).toBe('eq.periodic');
  });

  it('rejects an unknown phase', async () => {
    mockUpstream({});
    expect((await request(`${trainingsPath}?phase=annual`)).status).toBe(400);
    expect(calls('/rest/v1/trainings')).toHaveLength(0);
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await request(trainingsPath);
    expect(response.status).toBe(404);
    expect(calls('/rest/v1/trainings')).toHaveLength(0);
  });

  it('rejects verified users without an organization membership', async () => {
    mockUpstream({ membership: () => Response.json([]) });
    expect((await request(trainingsPath)).status).toBe(403);
  });
});

describe('POST /clients/{clientId}/trainings', () => {
  it('records the training with every attendee and their position as the occupation', async () => {
    mockUpstream({});
    const response = await send('POST', trainingsPath, validBody);
    expect(response.status).toBe(201);
    const { training: saved } = trainingResponseSchema.parse(await response.json());
    expect(saved.records.map((record) => record.employee.lastName)).toEqual(['Popescu', 'Ștefan']);
    expect(saved.records[0]).toEqual({
      id: 'f1f1f1f1-0000-4000-8000-000000000001',
      employee: { id: employeeId, lastName: 'Popescu', firstName: 'Ion' },
      occupation: 'Sudor autorizat',
      admission: { admittedOn: '2026-10-01', name: 'Ion POP', jobTitle: 'Șef atelier' },
    });
    const employees = searchOf('/rest/v1/employees');
    expect(employees.get('client_id')).toBe(`eq.${clientId}`);
    expect(employees.get('archived_at')).toBe('is.null');
    expect(employees.get('id')).toBe(`in.(${employeeId},${otherEmployeeId})`);
    const [, init] = calls('/rest/v1/rpc/save_training')[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      p_client_id: clientId,
      p_domain: 'ssm',
      p_phase: 'workplace',
      p_held_on: '2026-10-01',
      p_duration_minutes: 240,
      p_material: 'I.P.S.S.M. Art. 1 – 290',
      p_trainer_name: 'Ion POP',
      p_trainer_job_title: 'Șef atelier',
      p_source: 'app',
      p_attendees: [
        { employee_id: employeeId, occupation: 'Sudor autorizat' },
        { employee_id: otherEmployeeId, occupation: 'Sudor' },
      ],
      p_verifier_name: 'Dan MARIN',
      p_verifier_job_title: 'Inspector SSM',
      p_admitted_on: '2026-10-01',
      p_admitted_by_name: 'Ion POP',
      p_admitted_by_job_title: 'Șef atelier',
    });
    expect(searchOf('/rest/v1/trainings').get('id')).toBe(`eq.${trainingId}`);
  });

  it('records a paper training from a revision of the client themes', async () => {
    mockUpstream({ revisions: () => Response.json([{ id: revisionId }]) });
    const response = await send('POST', trainingsPath, {
      ...validBody,
      phase: 'periodic',
      admission: null,
      source: 'paper',
      themesRevisionId: revisionId,
      notes: 'Copiată de pe fișa de hârtie.',
    });
    expect(response.status).toBe(201);
    const revisions = searchOf('/rest/v1/document_revisions');
    expect(revisions.get('id')).toBe(`eq.${revisionId}`);
    expect(revisions.get('client_documents.client_id')).toBe(`eq.${clientId}`);
    expect(revisions.get('client_documents.type_key')).toBe('eq.training_themes');
    const [, init] = calls('/rest/v1/rpc/save_training')[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      p_phase: 'periodic',
      p_source: 'paper',
      p_themes_revision_id: revisionId,
      p_notes: 'Copiată de pe fișa de hârtie.',
    });
  });

  it('refuses a themes revision that is not one of the client themes of the domain', async () => {
    mockUpstream({ revisions: () => Response.json([]) });
    const response = await send('POST', trainingsPath, {
      ...validBody,
      themesRevisionId: revisionId,
    });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues).toEqual([
      { path: 'themesRevisionId', message: expect.any(String) },
    ]);
    expect(calls('/rest/v1/rpc/save_training')).toHaveLength(0);
  });

  it('refuses an attendee who is not an employee of the client', async () => {
    mockUpstream({
      employees: () => Response.json([{ id: employeeId, job_positions: { name: 'Sudor' } }]),
    });
    const response = await send('POST', trainingsPath, validBody);
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues).toEqual([
      { path: 'employeeIds', message: expect.any(String) },
    ]);
    expect(calls('/rest/v1/rpc/save_training')).toHaveLength(0);
  });

  it('refuses a training held after today in Romania', async () => {
    mockUpstream({});
    const response = await send('POST', trainingsPath, { ...validBody, heldOn: '2026-10-17' });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues).toEqual([
      { path: 'heldOn', message: expect.any(String) },
    ]);
  });

  it.each([
    ['a supplementary training without its reason', { phase: 'supplementary', admission: null }],
    ['a reason on another phase', { phase: 'workplace', supplementaryReason: 'after_accident' }],
    ['an admission on a periodic training', { phase: 'periodic' }],
    ['the same attendee twice', { employeeIds: [employeeId, employeeId] }],
    ['no attendee', { employeeIds: [] }],
    ['a duration over ten hours', { durationMinutes: 601 }],
    ['a blank material', { material: '   ' }],
    ['a trainer without a function', { trainer: { name: 'Ion POP', jobTitle: '' } }],
  ])('rejects %s', async (_, change) => {
    mockUpstream({});
    const response = await send('POST', trainingsPath, { ...validBody, ...change });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
    expect(calls('/rest/v1/rpc/save_training')).toHaveLength(0);
  });

  it('passes on the refusal of the database for an archived client', async () => {
    mockUpstream({
      save: () =>
        Response.json(
          { code: 'CLA01', message: 'An archived client is not changed.' },
          {
            status: 400,
          }
        ),
    });
    const response = await send('POST', trainingsPath, validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await send('POST', trainingsPath, validBody)).status).toBe(404);
    expect(calls('/rest/v1/rpc/save_training')).toHaveLength(0);
  });
});

describe('GET /clients/{clientId}/trainings/{trainingId}', () => {
  it('reads the training with its records by the attendee name', async () => {
    mockUpstream({});
    const response = await request(trainingPath);
    expect(response.status).toBe(200);
    const body = trainingResponseSchema.parse(await response.json());
    expect(body.training).toMatchObject(training);
    expect(body.training.records.map((record) => record.employee.id)).toEqual([
      employeeId,
      otherEmployeeId,
    ]);
    const query = searchOf('/rest/v1/trainings');
    expect(query.get('id')).toBe(`eq.${trainingId}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(body.training.signers).toEqual({ trainer: null, verifier: null, admitter: null });
  });

  it("gives each slot's signer from the live requests, the first issued", async () => {
    const trainerAccount = 'a0000000-0000-4000-8000-000000000003';
    const managerAccount = 'a0000000-0000-4000-8000-000000000004';
    mockUpstream({
      requests: () =>
        Response.json([
          { slot: 'trainer', signer_account_id: trainerAccount },
          { slot: 'admitter', signer_account_id: managerAccount },
          { slot: 'trainer', signer_account_id: managerAccount },
        ]),
    });

    const body = trainingResponseSchema.parse(await (await request(trainingPath)).json());

    expect(body.training.signers).toEqual({
      trainer: trainerAccount,
      verifier: null,
      admitter: managerAccount,
    });
    const query = searchOf('/rest/v1/signature_requests');
    expect(query.get('state')).toBe('neq.void');
    expect(query.get('slot')).toBe('in.(trainer,verifier,admitter)');
    expect(query.get('signer_account_id')).toBe('not.is.null');
  });

  it('answers 404 for a training of another client', async () => {
    mockUpstream({ trainings: () => Response.json([]) });
    const response = await request(trainingPath);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });

  it('is not taken for the proposal', async () => {
    mockUpstream({});
    const response = await request(
      `${trainingsPath}/proposal?domain=ssm&phase=supplementary&heldOn=2026-10-01`
    );
    expect(response.status).toBe(200);
    expect(calls('/rest/v1/trainings')).toHaveLength(0);
  });
});

describe('PUT /clients/{clientId}/trainings/{trainingId}', () => {
  it("replaces the training's facts and attendees", async () => {
    mockUpstream({});
    const response = await send('PUT', trainingPath, validBody);
    expect(response.status).toBe(200);
    trainingResponseSchema.parse(await response.json());
    const [, init] = calls('/rest/v1/rpc/save_training')[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      p_client_id: clientId,
      p_training_id: trainingId,
    });
  });

  it('answers 404 when the training is not under the client', async () => {
    mockUpstream({ save: () => Response.json(null) });
    const response = await send('PUT', trainingPath, validBody);
    expect(response.status).toBe(404);
    expect(calls('/rest/v1/trainings')).toHaveLength(0);
  });
});

describe('DELETE /clients/{clientId}/trainings/{trainingId}', () => {
  it('deletes the training', async () => {
    mockUpstream({ trainings: () => Response.json([{ id: trainingId }]) });
    const response = await request(trainingPath, { method: 'DELETE' });
    expect(response.status).toBe(204);
    const [url, init] = calls('/rest/v1/trainings')[0]!;
    expect(init?.method).toBe('DELETE');
    expect(new URL(String(url)).searchParams.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('answers 404 when nothing was deleted', async () => {
    mockUpstream({ trainings: () => Response.json([]) });
    expect((await request(trainingPath, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('GET /clients/{clientId}/employees/{employeeId}/training-records', () => {
  const recordsPath = `/clients/${clientId}/employees/${employeeId}/training-records`;

  it("lists the employee's records with their trainings, newest first", async () => {
    mockUpstream({
      employees: () => Response.json([{ id: employeeId }]),
      records: () =>
        Response.json([
          {
            id: 'f1f1f1f1-0000-4000-8000-000000000001',
            occupation: 'Sudor',
            admitted_on: null,
            admitted_by_name: null,
            admitted_by_job_title: null,
            trainings: {
              ...trainingRow,
              phase: 'periodic',
              training_records: [
                { training_signatures: [], signed_sheet_rows: [] },
                { training_signatures: [], signed_sheet_rows: [] },
              ],
            },
          },
        ]),
    });
    const response = await request(`${recordsPath}?domain=ssm`);
    expect(response.status).toBe(200);
    expect(employeeTrainingRecordListResponseSchema.parse(await response.json())).toEqual({
      items: [
        {
          id: 'f1f1f1f1-0000-4000-8000-000000000001',
          occupation: 'Sudor',
          admission: null,
          training: { ...training, phase: 'periodic' },
          signed: false,
          hasSignatures: false,
        },
      ],
    });
    const query = searchOf('/rest/v1/training_records');
    expect(query.get('select')).toContain(
      'trainings!inner(id,client_id,domain,phase,held_on,duration_minutes,material,trainer_name,trainer_job_title,verifier_name,verifier_job_title,supplementary_reason,source,themes_revision_id,notes,created_at,updated_at,training_records(training_signatures(method,voided_at),signed_sheet_rows!signed_sheet_rows_record_of_client(id)))'
    );
    expect(query.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(query.get('trainings.domain')).toBe('eq.ssm');
    expect(query.get('order')).toBe('trainings(held_on).desc,trainings(created_at).desc,id.asc');
    expect(searchOf('/rest/v1/employees').get('client_id')).toBe(`eq.${clientId}`);
  });

  it.each([
    [
      "a live electronic signature on another attendee's record",
      [
        { training_signatures: [], signed_sheet_rows: [] },
        {
          training_signatures: [{ method: 'electronic', voided_at: null }],
          signed_sheet_rows: [],
        },
      ],
      { signed: true, hasSignatures: true },
    ],
    [
      'only voided and paper signatures',
      [
        {
          training_signatures: [
            { method: 'electronic', voided_at: '2026-10-18T09:00:00Z' },
            { method: 'paper', voided_at: null },
          ],
          signed_sheet_rows: [],
        },
      ],
      { signed: false, hasSignatures: true },
    ],
    [
      'a row on a stored sheet',
      [
        {
          training_signatures: [],
          signed_sheet_rows: [{ id: 'f2f2f2f2-0000-4000-8000-000000000002' }],
        },
      ],
      { signed: false, hasSignatures: true },
    ],
  ])("gives each record its training's signing state, with %s", async (_, records, signing) => {
    mockUpstream({
      employees: () => Response.json([{ id: employeeId }]),
      records: () =>
        Response.json([
          {
            id: 'f1f1f1f1-0000-4000-8000-000000000001',
            occupation: 'Sudor',
            admitted_on: null,
            admitted_by_name: null,
            admitted_by_job_title: null,
            trainings: { ...trainingRow, training_records: records },
          },
        ]),
    });
    const response = await request(recordsPath);
    expect(response.status).toBe(200);
    const [item] = employeeTrainingRecordListResponseSchema.parse(await response.json()).items;
    expect(item).toMatchObject(signing);
  });

  it('answers 404 for an employee of another client', async () => {
    mockUpstream({ employees: () => Response.json([]) });
    expect((await request(recordsPath)).status).toBe(404);
    expect(calls('/rest/v1/training_records')).toHaveLength(0);
  });
});

describe('GET /clients/{clientId}/trainings/proposal', () => {
  const proposalPath = `${trainingsPath}/proposal`;

  it("proposes the session of the month from the newest themes revision's snapshot", async () => {
    mockUpstream({
      revisions: () =>
        Response.json([{ id: revisionId, data_snapshot: buildDocumentContext(facts) }]),
    });
    const response = await request(
      `${proposalPath}?domain=ssm&phase=periodic&heldOn=2026-04-14&jobPositionId=${positionId}`
    );
    expect(response.status).toBe(200);
    expect(trainingProposalSchema.parse(await response.json())).toEqual({
      durationMinutes: 120,
      material:
        'I.P.S.S.M. Art. 45 – 95; I.P.S.S.M. Activități de birou, Art. 1 – 12; I.P.S.S.M. Sudură oxiacetilenică, Art. 1 – 31',
      trainer: { name: 'Ion POP', jobTitle: 'Șef atelier' },
      verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
      admittedBy: null,
      themesRevisionId: revisionId,
    });
    const revisions = searchOf('/rest/v1/document_revisions');
    expect(revisions.get('client_documents.type_key')).toBe('eq.training_themes');
    expect(revisions.get('order')).toBe('revision.desc');
    expect(searchOf('/rest/v1/profiles').get('user_id')).toBe(`eq.${user.id}`);
    const persons = searchOf('/rest/v1/client_responsible_persons');
    expect(persons.get('roles')).toBe('cs.{workplace_manager}');
    expect(persons.get('order')).toBe('created_at.asc,id.asc');
    expect(searchOf('/rest/v1/job_positions').get('client_id')).toBe(`eq.${clientId}`);
  });

  it('proposes the fire-safety hiring plan with the technician, without reading themes', async () => {
    mockUpstream({});
    const response = await request(
      `${proposalPath}?domain=psi&phase=introductory_general&heldOn=2026-10-01`
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      durationMinutes: 480,
      material: hiringPlans.psi.introductoryGeneral,
      trainer: { name: 'Radu STAN', jobTitle: 'Cadru tehnic PSI' },
      verifier: null,
      admittedBy: null,
      themesRevisionId: null,
    });
    expect(calls('/rest/v1/document_revisions')).toHaveLength(0);
    expect(calls('/rest/v1/job_positions')).toHaveLength(0);
  });

  it("falls back to the fire-safety schedule's duration without generated themes", async () => {
    mockUpstream({});
    const response = await request(
      `${proposalPath}?domain=psi&phase=periodic&heldOn=2026-10-01&jobPositionId=${positionId}`
    );
    expect(await response.json()).toMatchObject({
      durationMinutes: 120,
      material: null,
      themesRevisionId: null,
    });
    expect(searchOf('/rest/v1/document_revisions').get('client_documents.type_key')).toBe(
      'eq.fire_training_themes'
    );
  });

  it('reads the attendees named, and has the specialist train the owner of a one-person firm', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...client, legal_representative_employee_id: employeeId }]),
      persons: () =>
        Response.json([
          { full_name: 'Maria IONESCU', job_title: 'Administrator', employee_id: employeeId },
        ]),
      employees: () =>
        Response.json([{ id: employeeId, last_name: 'Ionescu', first_name: 'Maria' }]),
    });
    const response = await request(
      `${proposalPath}?domain=ssm&phase=periodic&heldOn=2026-10-01&jobPositionId=${positionId}&employeeIds=${employeeId}`
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      trainer: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
      verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
    });
    const employees = searchOf('/rest/v1/employees');
    expect(employees.get('client_id')).toBe(`eq.${clientId}`);
    expect(employees.get('id')).toBe(`in.(${employeeId})`);
    expect(
      (
        await request(
          `${proposalPath}?domain=ssm&phase=periodic&heldOn=2026-10-01&employeeIds=not-an-id`
        )
      ).status
    ).toBe(400);
  });

  it('proposes no specialist when the profile names nobody', async () => {
    mockUpstream({ profiles: () => Response.json([]), persons: () => Response.json([]) });
    const response = await request(`${proposalPath}?domain=ssm&phase=workplace&heldOn=2026-10-01`);
    expect(await response.json()).toMatchObject({
      trainer: { name: 'Maria IONESCU', jobTitle: 'Administrator' },
      verifier: null,
      admittedBy: { name: 'Maria IONESCU', jobTitle: 'Administrator' },
    });
  });

  it('refuses a job position of another client', async () => {
    mockUpstream({ positions: () => Response.json([]) });
    const response = await request(
      `${proposalPath}?domain=ssm&phase=periodic&heldOn=2026-10-01&jobPositionId=${positionId}`
    );
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues).toEqual([
      { path: 'jobPositionId', message: expect.any(String) },
    ]);
  });

  it('requires the domain, the phase and the day', async () => {
    mockUpstream({});
    expect((await request(`${proposalPath}?domain=ssm&phase=periodic`)).status).toBe(400);
  });
});
