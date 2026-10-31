import {
  apiErrorResponseSchema,
  employeeListResponseSchema,
  employeeResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import { openApiConfig } from '../../lib/openapi';

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
const activeClient = { id: clientId, archived_at: null };
const positionId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const workplaceId = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';

const employeeRow = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  client_id: clientId,
  last_name: 'Popescu',
  first_name: 'Ion',
  cnp: '1900101400127',
  employee_number: 'A-17',
  email: 'ion.popescu@example.com',
  phone: '+40721000000',
  job_title: 'Sudor',
  contract_number: null,
  job_positions: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor autorizat' },
  hired_at: '2020-03-01',
  status: 'active',
  terminated_at: null,
  birth_date: '1990-01-01',
  birth_place: 'Cluj-Napoca',
  home_address: 'Str. Lungă 5, Cluj-Napoca',
  blood_group: 'A(II)',
  rh_factor: '+',
  notes: null,
  created_at: '2026-09-17T10:00:00+00:00',
  updated_at: '2026-09-17T10:00:00+00:00',
  archived_at: null,
  workplace_id: null,
  client_workplaces: null,
  qualification: null,
  education: null,
  authorizations: null,
  commute_route: null,
  commute_minutes: null,
  training_status: {
    ssm_state: 'due',
    ssm_due_on: '2026-11-01',
    ssm_last_periodic_on: '2026-08-01',
    ssm_interval_months: 3,
    ssm_interval_source: 'position',
    psi_state: 'untrained',
    psi_due_on: null,
    psi_last_periodic_on: null,
    psi_interval_months: 6,
    psi_interval_source: 'client',
  },
  test_status: {
    ssm_state: 'pending',
    ssm_awaiting_test: 'hiring',
    ssm_last_passed_on: null,
    psi_state: 'passed',
    psi_awaiting_test: null,
    psi_last_passed_on: '2026-03-02',
    psi_due_on: '2027-03-02',
  },
};

const tests = {
  ssm: { state: 'pending', awaitingTest: 'hiring', lastPassedOn: null, dueOn: null },
  psi: { state: 'passed', awaitingTest: null, lastPassedOn: '2026-03-02', dueOn: '2027-03-02' },
};

const training = {
  ssm: {
    state: 'due',
    dueOn: '2026-11-01',
    lastPeriodicOn: '2026-08-01',
    intervalMonths: 3,
    intervalSource: 'position',
  },
  psi: {
    state: 'untrained',
    dueOn: null,
    lastPeriodicOn: null,
    intervalMonths: 6,
    intervalSource: 'client',
  },
};

const employeeListRow = Object.fromEntries(
  Object.entries(employeeRow).filter(
    ([key]) =>
      ![
        'cnp',
        'birth_date',
        'birth_place',
        'home_address',
        'blood_group',
        'rh_factor',
        'notes',
        'archived_at',
        'qualification',
        'education',
        'authorizations',
        'commute_route',
        'commute_minutes',
        'contract_number',
      ].includes(key)
  )
);

type Handler = (init?: RequestInit, url?: URL) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(
  handlers: Partial<
    Record<'auth' | 'membership' | 'clients' | 'employees' | 'positions' | 'workplaces', Handler>
  >
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return handlers.auth?.(init, url) ?? Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return handlers.membership?.(init, url) ?? Response.json([membership]);
    }
    if (url.pathname === '/rest/v1/clients') {
      return handlers.clients?.(init, url) ?? Response.json([activeClient]);
    }
    if (url.pathname === '/rest/v1/job_positions') {
      return handlers.positions?.(init, url) ?? Response.json({ id: positionId });
    }
    if (url.pathname === '/rest/v1/client_workplaces') {
      return handlers.workplaces?.(init, url) ?? Response.json([]);
    }
    if (url.pathname === '/rest/v1/employees') {
      return (
        handlers.employees?.(init, url) ??
        Response.json([employeeListRow], { headers: { 'Content-Range': '0-0/1' } })
      );
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  });
}

const calls = (pathname: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);

const request = (path: string, init: RequestInit = {}, token = 'Bearer test-access-token') =>
  createApp().request(
    path,
    { ...init, headers: { Authorization: token, ...(init.headers ?? {}) } },
    env
  );

const employeesPath = `/clients/${clientId}/employees`;

const postEmployee = (body: unknown, path = employeesPath, token?: string) =>
  request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    token
  );

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /clients/{clientId}/employees', () => {
  it('lists employees of the client without the CNP', async () => {
    mockUpstream({});
    const response = await request(employeesPath);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(employeeListResponseSchema.parse(body)).toEqual({
      page: 1,
      pageSize: 25,
      total: 1,
      items: [
        {
          id: employeeRow.id,
          clientId,
          lastName: 'Popescu',
          firstName: 'Ion',
          employeeNumber: 'A-17',
          email: 'ion.popescu@example.com',
          phone: '+40721000000',
          jobTitle: 'Sudor',
          jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor autorizat' },
          hiredAt: '2020-03-01',
          status: 'active',
          terminatedAt: null,
          workplace: null,
          createdAt: employeeRow.created_at,
          updatedAt: employeeRow.updated_at,
          training,
          tests,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('cnp');
    const [clientUrl] = calls('/rest/v1/clients')[0]!;
    expect(new URL(String(clientUrl)).searchParams.get('id')).toBe(`eq.${clientId}`);
    const [listUrl, listInit] = calls('/rest/v1/employees')[0]!;
    const query = new URL(String(listUrl)).searchParams;
    expect(query.get('select')).not.toContain('cnp');
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('status')).toBe('neq.terminated');
    expect(query.get('order')).toBe('last_name.asc,first_name.asc,id.asc');
    expect(query.get('offset')).toBe('0');
    expect(query.get('limit')).toBe('25');
    const headers = new Headers(listInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-access-token');
    expect(headers.get('Prefer')).toContain('count=exact');
  });

  it('pages and sorts by one whitelisted key with a stable tiebreaker', async () => {
    mockUpstream({
      employees: () =>
        Response.json([employeeListRow], { headers: { 'Content-Range': '25-25/26' } }),
    });
    const response = await request(`${employeesPath}?page=2&pageSize=25&sort=hiredAt&order=desc`);
    expect(response.status).toBe(200);
    expect(employeeListResponseSchema.parse(await response.json())).toMatchObject({
      page: 2,
      pageSize: 25,
      total: 26,
    });
    const [listUrl] = calls('/rest/v1/employees')[0]!;
    const query = new URL(String(listUrl)).searchParams;
    expect(query.get('order')).toBe('hired_at.desc,last_name.desc,first_name.desc,id.asc');
    expect(query.get('offset')).toBe('25');
    expect(query.get('limit')).toBe('25');
  });

  it('answers an empty page with the real total when the page lies past the end', async () => {
    mockUpstream({
      employees: (_, url) =>
        url?.searchParams.get('limit') === '1'
          ? Response.json([employeeListRow], { headers: { 'Content-Range': '0-0/3' } })
          : Response.json(
              { code: 'PGRST103', message: 'Requested range not satisfiable' },
              {
                status: 416,
              }
            ),
    });
    const response = await request(`${employeesPath}?page=9`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], page: 9, pageSize: 25, total: 3 });
  });

  it.each(['page=0', 'pageSize=101', 'sort=cnp', 'order=sideways'])(
    'rejects an invalid list parameter: %s',
    async (search) => {
      mockUpstream({});
      const response = await request(`${employeesPath}?${search}`);
      expect(response.status).toBe(400);
      expect(calls('/rest/v1/employees')).toHaveLength(0);
    }
  );

  it('filters by status when asked', async () => {
    mockUpstream({});
    const response = await request(`${employeesPath}?status=terminated`);
    expect(response.status).toBe(200);
    const [listUrl] = calls('/rest/v1/employees')[0]!;
    expect(new URL(String(listUrl)).searchParams.get('status')).toBe('eq.terminated');
  });

  it('filters by a training state in either domain, leaving out the employees it does not match', async () => {
    mockUpstream({});
    const response = await request(`${employeesPath}?trainingState=overdue`);
    expect(response.status).toBe(200);
    const [listUrl] = calls('/rest/v1/employees')[0]!;
    const query = new URL(String(listUrl)).searchParams;
    expect(query.get('select')).toContain('training_status!inner(');
    expect(query.get('training_status.or')).toBe('(ssm_state.eq.overdue,psi_state.eq.overdue)');
  });

  it('reads the training status without filtering when no state is asked for', async () => {
    mockUpstream({});
    await request(employeesPath);
    const [listUrl] = calls('/rest/v1/employees')[0]!;
    const query = new URL(String(listUrl)).searchParams;
    expect(query.get('select')).toContain('training_status(');
    expect(query.get('select')).not.toContain('!inner');
    expect(query.get('training_status.or')).toBeNull();
  });

  it('filters the employees up to date in either domain', async () => {
    mockUpstream({});
    const response = await request(`${employeesPath}?trainingState=current`);
    expect(response.status).toBe(200);
    const [listUrl] = calls('/rest/v1/employees')[0]!;
    const query = new URL(String(listUrl)).searchParams;
    expect(query.get('select')).toContain('training_status!inner(');
    expect(query.get('training_status.or')).toBe(
      '(and(ssm_state.eq.current,psi_state.eq.current))'
    );
  });

  it('filters by a test state in either domain, as the training state', async () => {
    mockUpstream({});
    const response = await request(`${employeesPath}?testState=annual_due&trainingState=due`);
    expect(response.status).toBe(200);
    const [listUrl] = calls('/rest/v1/employees')[0]!;
    const query = new URL(String(listUrl)).searchParams;
    expect(query.get('select')).toContain('test_status!inner(');
    expect(query.get('select')).toContain('training_status!inner(');
    expect(query.get('test_status.or')).toBe('(ssm_state.eq.annual_due,psi_state.eq.annual_due)');
    expect(query.get('training_status.or')).toBe('(ssm_state.eq.due,psi_state.eq.due)');
  });

  it('filters the employees who passed in both domains', async () => {
    mockUpstream({});
    await request(`${employeesPath}?testState=passed`);
    const query = new URL(String(calls('/rest/v1/employees')[0]![0])).searchParams;
    expect(query.get('select')).not.toContain('training_status!inner(');
    expect(query.get('test_status.or')).toBe('(and(ssm_state.eq.passed,psi_state.eq.passed))');
  });

  it('rejects an unknown training state', async () => {
    mockUpstream({});
    const response = await request(`${employeesPath}?trainingState=expired`);
    expect(response.status).toBe(400);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });

  it('rejects an unknown status', async () => {
    mockUpstream({});
    const response = await request(`${employeesPath}?status=fired`);
    expect(response.status).toBe(400);
    expect(calls('/rest/v1/clients')).toHaveLength(0);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });

  it('rejects a malformed client id before touching the database', async () => {
    mockUpstream({});
    const response = await request('/clients/not-a-uuid/employees');
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
    expect(calls('/rest/v1/clients')).toHaveLength(0);
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await request(employeesPath);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });

  it('still lists employees of an archived client', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...activeClient, archived_at: '2026-01-01T00:00:00+00:00' }]),
    });
    expect((await request(employeesPath)).status).toBe(200);
  });

  it('requires a bearer token', async () => {
    mockUpstream({});
    const response = await request(employeesPath, {}, '');
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects verified users without an organization membership', async () => {
    mockUpstream({ membership: () => Response.json([]) });
    const response = await request(employeesPath);
    expect(response.status).toBe(403);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });
});

describe('POST /clients/{clientId}/employees', () => {
  const validBody = {
    lastName: 'Popescu',
    firstName: 'Ion',
    cnp: '1900101 400127',
    employeeNumber: 'A-17',
    email: 'Ion.Popescu@Example.com',
    phone: '0721 000 000',
    jobTitle: 'Sudor',
    hiredAt: '2020-03-01',
    birthDate: '1990-01-01',
    birthPlace: 'Cluj-Napoca',
    homeAddress: 'Str. Lungă 5, Cluj-Napoca',
    bloodGroup: 'A(II)',
    rhFactor: '+',
  };

  it('passes on the refusal of the database for a company that is still a lead', async () => {
    mockUpstream({
      employees: () =>
        Response.json({ code: 'CLL01', message: 'A lead has no safety records.' }, { status: 400 }),
    });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_is_lead');
  });

  it('stores the digits-only CNP, lowercases the email, writes the phone in E.164, and scopes to the membership', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow, { status: 201 }) });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(201);
    const { employee } = employeeResponseSchema.parse(await response.json());
    expect(employee.cnp).toBe('1900101400127');
    expect(employee.bloodGroup).toBe('A(II)');
    const [, init] = calls('/rest/v1/employees')[0]!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      organization_id: membership.organization_id,
      client_id: clientId,
      last_name: 'Popescu',
      first_name: 'Ion',
      cnp: '1900101400127',
      employee_number: 'A-17',
      email: 'ion.popescu@example.com',
      phone: '+40721000000',
      job_title: 'Sudor',
      contract_number: null,
      hired_at: '2020-03-01',
      birth_date: '1990-01-01',
      birth_place: 'Cluj-Napoca',
      home_address: 'Str. Lungă 5, Cluj-Napoca',
      blood_group: 'A(II)',
      rh_factor: '+',
      notes: null,
      workplace_id: null,
      qualification: null,
      education: null,
      authorizations: null,
      commute_route: null,
      commute_minutes: null,
      created_by: user.id,
    });
    expect(new Headers(init?.headers).get('Prefer')).toContain('return=representation');
  });

  it('accepts the minimal body', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow, { status: 201 }) });
    const response = await postEmployee({
      lastName: 'Popescu',
      firstName: 'Ion',
      jobTitle: 'Sudor',
      hiredAt: '2020-03-01',
    });
    expect(response.status).toBe(201);
    expect(JSON.parse(String(calls('/rest/v1/employees')[0]![1]?.body))).toMatchObject({
      cnp: null,
      email: null,
      birth_date: null,
    });
  });

  it.each([
    [{ ...validBody, cnp: '1900101400128' }, 'cnp'],
    [{ ...validBody, lastName: '' }, 'lastName'],
    [{ ...validBody, jobTitle: 'X' }, 'jobTitle'],
    [{ ...validBody, hiredAt: '01/03/2020' }, 'hiredAt'],
    [{ ...validBody, email: 'not-an-email' }, 'email'],
    [{ ...validBody, phone: 'call me' }, 'phone'],
    [{ ...validBody, bloodGroup: 'C' }, 'bloodGroup'],
    [{ ...validBody, birthDate: '1990-01-02' }, 'birthDate'],
    [{ ...validBody, birthDate: '2021-01-01', cnp: null }, 'birthDate'],
  ])('rejects an invalid body before touching the database: %j', async (body, path) => {
    mockUpstream({});
    const response = await postEmployee(body);
    expect(response.status).toBe(400);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.error).toBe('validation_error');
    expect(error.issues?.map((issue) => issue.path)).toContain(path);
    expect(calls('/rest/v1/clients')).toHaveLength(0);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(404);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });

  it('refuses to add employees to an archived client', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...activeClient, archived_at: '2026-01-01T00:00:00+00:00' }]),
    });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).message).toContain('archived');
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });

  it('names the duplicated identifier on a conflict', async () => {
    mockUpstream({
      employees: () =>
        Response.json(
          {
            code: '23505',
            message: 'duplicate key value violates unique constraint "employees_client_cnp_key"',
          },
          { status: 409 }
        ),
    });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(409);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.error).toBe('conflict');
    expect(error.message).toContain('CNP');
  });

  it('maps a row-level security rejection to forbidden', async () => {
    mockUpstream({
      employees: () =>
        Response.json(
          { code: '42501', message: 'new row violates row-level security' },
          { status: 403 }
        ),
    });
    expect((await postEmployee(validBody)).status).toBe(403);
  });

  it('requires authentication before validation', async () => {
    mockUpstream({});
    const response = await postEmployee({ lastName: 'A' }, employeesPath, '');
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /clients/{clientId}/employees/{employeeId}', () => {
  const employeePath = `${employeesPath}/${employeeRow.id}`;

  it('returns the full record including the CNP', async () => {
    mockUpstream({ employees: () => Response.json([employeeRow]) });
    const response = await request(employeePath);
    expect(response.status).toBe(200);
    const { employee } = employeeResponseSchema.parse(await response.json());
    expect(employee).toMatchObject({
      id: employeeRow.id,
      cnp: '1900101400127',
      birthDate: '1990-01-01',
      homeAddress: 'Str. Lungă 5, Cluj-Napoca',
      rhFactor: '+',
      archivedAt: null,
    });
    const [url] = calls('/rest/v1/employees')[0]!;
    const query = new URL(String(url)).searchParams;
    expect(query.get('id')).toBe(`eq.${employeeRow.id}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('select')).toContain('cnp');
  });

  it('answers 404 when the employee is not under this client', async () => {
    mockUpstream({ employees: () => Response.json([]) });
    const response = await request(employeePath);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });

  it('rejects a malformed employee id', async () => {
    mockUpstream({});
    expect((await request(`${employeesPath}/nope`)).status).toBe(400);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });
});

describe('PATCH /clients/{clientId}/employees/{employeeId}/status', () => {
  const statusPath = `${employeesPath}/${employeeRow.id}/status`;
  const patchStatus = (body: unknown) =>
    request(statusPath, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const terminatedRow = { ...employeeRow, status: 'terminated', terminated_at: '2026-09-10' };

  it('passes on the refusal of the database for an archived client', async () => {
    mockUpstream({
      employees: (init) =>
        init?.method === 'PATCH'
          ? Response.json(
              { code: 'CLA01', message: 'An archived client is not changed.' },
              { status: 400 }
            )
          : Response.json([{ id: employeeRow.id, hired_at: employeeRow.hired_at }]),
    });
    const response = await patchStatus({ status: 'terminated', terminatedAt: '2026-09-10' });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });

  it('marks a leaver with the date and returns the employee', async () => {
    mockUpstream({
      employees: (init) =>
        init?.method === 'PATCH'
          ? Response.json([terminatedRow])
          : Response.json([{ id: employeeRow.id, hired_at: employeeRow.hired_at }]),
    });
    const response = await patchStatus({ status: 'terminated', terminatedAt: '2026-09-10' });
    expect(response.status).toBe(200);
    const { employee } = employeeResponseSchema.parse(await response.json());
    expect(employee.status).toBe('terminated');
    expect(employee.terminatedAt).toBe('2026-09-10');
    const patch = calls('/rest/v1/employees').find(([, init]) => init?.method === 'PATCH')!;
    expect(JSON.parse(String(patch[1]?.body))).toEqual({
      status: 'terminated',
      terminated_at: '2026-09-10',
    });
    const query = new URL(String(patch[0])).searchParams;
    expect(query.get('id')).toBe(`eq.${employeeRow.id}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('reactivates by clearing the leave date', async () => {
    mockUpstream({
      employees: (init) =>
        init?.method === 'PATCH'
          ? Response.json([employeeRow])
          : Response.json([{ id: employeeRow.id, hired_at: employeeRow.hired_at }]),
    });
    const response = await patchStatus({ status: 'active' });
    expect(response.status).toBe(200);
    const patch = calls('/rest/v1/employees').find(([, init]) => init?.method === 'PATCH')!;
    expect(JSON.parse(String(patch[1]?.body))).toEqual({ status: 'active', terminated_at: null });
  });

  it('refuses to reactivate while a current employee holds the CNP', async () => {
    mockUpstream({
      employees: (init) =>
        init?.method === 'PATCH'
          ? Response.json(
              {
                code: '23505',
                message:
                  'duplicate key value violates unique constraint "employees_client_cnp_key"',
              },
              { status: 409 }
            )
          : Response.json([{ id: employeeRow.id, hired_at: employeeRow.hired_at }]),
    });
    const response = await patchStatus({ status: 'active' });
    expect(response.status).toBe(409);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.error).toBe('conflict');
    expect(error.message).toContain('CNP');
  });

  it('rejects a leave date before the hire date with a field issue', async () => {
    mockUpstream({
      employees: () => Response.json([{ id: employeeRow.id, hired_at: employeeRow.hired_at }]),
    });
    const response = await patchStatus({ status: 'terminated', terminatedAt: '2019-12-31' });
    expect(response.status).toBe(400);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.issues?.map((issue) => issue.path)).toEqual(['terminatedAt']);
    expect(calls('/rest/v1/employees').some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it.each([
    [{ status: 'terminated' }, 'terminatedAt'],
    [{ status: 'terminated', terminatedAt: '10.09.2026' }, 'terminatedAt'],
    [{ status: 'suspended' }, 'status'],
  ])('rejects an invalid body: %j', async (body, path) => {
    mockUpstream({});
    const response = await patchStatus(body);
    expect(response.status).toBe(400);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.issues?.map((issue) => issue.path)).toContain(path);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });

  it('answers 404 when the employee is not under this client', async () => {
    mockUpstream({ employees: () => Response.json([]) });
    const response = await patchStatus({ status: 'active' });
    expect(response.status).toBe(404);
  });
});

describe('PUT /clients/{clientId}/employees/{employeeId}', () => {
  const employeePath = `${employeesPath}/${employeeRow.id}`;
  const body = {
    lastName: ' Popescu ',
    firstName: 'Ioan',
    cnp: '1900101 400127',
    email: 'Ioan.Popescu@Example.com',
    jobTitle: 'Sudor',
    hiredAt: '2020-03-01',
  };
  const put = (payload: unknown) =>
    request(employeePath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  const patched = () =>
    JSON.parse(
      String(calls('/rest/v1/employees').find(([, init]) => init?.method === 'PATCH')![1]?.body)
    ) as Record<string, unknown>;

  it('replaces the fields with the same rules as adding, and leaves the position alone', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow) });
    const response = await put(body);
    expect(response.status).toBe(200);
    expect(employeeResponseSchema.parse(await response.json()).employee.id).toBe(employeeRow.id);
    expect(patched()).toEqual({
      last_name: 'Popescu',
      first_name: 'Ioan',
      cnp: '1900101400127',
      employee_number: null,
      email: 'ioan.popescu@example.com',
      phone: null,
      job_title: 'Sudor',
      contract_number: null,
      hired_at: '2020-03-01',
      birth_date: null,
      birth_place: null,
      home_address: null,
      blood_group: null,
      rh_factor: null,
      notes: null,
      qualification: null,
      education: null,
      authorizations: null,
      commute_route: null,
      commute_minutes: null,
    });
    // Status, leave date and archive are not this route's to touch.
    expect(Object.keys(patched())).not.toContain('status');
  });

  it('moves the person when a position of this client is named', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await put({ ...body, jobPositionId: positionId })).status).toBe(200);
    expect(patched().job_position_id).toBe(positionId);
    mockUpstream({
      employees: () => Response.json(employeeRow),
      positions: () => Response.json(null),
    });
    expect((await put({ ...body, jobPositionId: positionId })).status).toBe(400);
  });

  it('names the field for a bad CNP, a hire date after the leave date, and a taken CNP', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow) });
    const badCnp = await put({ ...body, cnp: '1900101400128' });
    expect(badCnp.status).toBe(400);

    mockUpstream({
      employees: () => Response.json({ ...employeeRow, terminated_at: '2019-12-31' }),
    });
    const late = await put(body);
    expect(late.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await late.json()).issues?.[0]?.path).toBe('hiredAt');

    mockUpstream({
      employees: (init) =>
        init?.method === 'PATCH'
          ? Response.json(
              { code: '23505', message: 'duplicate key "employees_client_cnp_key"', details: null },
              { status: 409 }
            )
          : Response.json(employeeRow),
    });
    const taken = await put(body);
    expect(taken.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await taken.json()).message).toContain('CNP');
  });

  it('answers 404 for an employee of another client', async () => {
    mockUpstream({ employees: () => Response.json(null) });
    expect((await put(body)).status).toBe(404);
  });
});

describe('job positions on employees (ADR 006)', () => {
  const employeePath = `${employeesPath}/${employeeRow.id}`;
  const sentToEmployees = (index = 0) =>
    JSON.parse(
      String(
        calls('/rest/v1/employees').filter(([, init]) => (init?.method ?? 'GET') !== 'GET')[
          index
        ]![1]?.body
      )
    ) as Record<string, unknown>;
  const body = { lastName: 'Popescu', firstName: 'Ion', jobTitle: 'Sudor', hiredAt: '2020-03-01' };

  it('sorts the list by the name of the position', async () => {
    mockUpstream({});
    expect((await request(`${employeesPath}?sort=jobPosition&order=desc`)).status).toBe(200);
    const order = new URL(String(calls('/rest/v1/employees')[0]![0])).searchParams.get('order');
    expect(order).toBe('job_positions(name).desc,last_name.desc,first_name.desc,id.asc');
  });

  it('leaves the position to the database when the form names none', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow) });
    const response = await postEmployee(body);
    expect(response.status).toBe(201);
    expect(employeeResponseSchema.parse(await response.json()).employee.jobPosition.name).toBe(
      'Sudor autorizat'
    );
    expect(sentToEmployees()).not.toHaveProperty('job_position_id');
    expect(calls('/rest/v1/job_positions')).toHaveLength(0);
  });

  it('puts the employee in the chosen position, once it is one of this client', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await postEmployee({ ...body, jobPositionId: positionId })).status).toBe(201);
    expect(sentToEmployees().job_position_id).toBe(positionId);
    const lookup = new URL(String(calls('/rest/v1/job_positions')[0]![0])).searchParams;
    expect([lookup.get('client_id'), lookup.get('archived_at')]).toEqual([
      `eq.${clientId}`,
      'is.null',
    ]);

    mockUpstream({ positions: () => Response.json(null) });
    const refused = await postEmployee({ ...body, jobPositionId: positionId });
    expect(refused.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await refused.json()).issues?.[0]?.path).toBe(
      'jobPositionId'
    );
  });

  it('moves an employee to another position, and the contract title only when told', async () => {
    const move = (payload: unknown) =>
      request(`${employeePath}/job-position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await move({ jobPositionId: positionId })).status).toBe(200);
    expect(sentToEmployees()).toEqual({ job_position_id: positionId });
    expect((await move({ jobPositionId: positionId, jobTitle: ' Sudor-șef ' })).status).toBe(200);
    expect(sentToEmployees(1)).toEqual({ job_position_id: positionId, job_title: 'Sudor-șef' });

    mockUpstream({ employees: () => Response.json(null) });
    expect((await move({ jobPositionId: positionId })).status).toBe(404);
    mockUpstream({ positions: () => Response.json(null) });
    expect((await move({ jobPositionId: positionId })).status).toBe(400);
    expect((await move({})).status).toBe(400);
  });
});

describe('training sheet fields on employees (ADR 021)', () => {
  const employeePath = `${employeesPath}/${employeeRow.id}`;
  const body = { lastName: 'Popescu', firstName: 'Ion', jobTitle: 'Sudor', hiredAt: '2020-03-01' };
  const sheetBody = {
    ...body,
    workplaceId,
    qualification: ' Sudor autorizat ',
    education: 'Școala profesională',
    authorizations: 'ISCIR',
    commuteRoute: 'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24',
    commuteMinutes: 35,
  };
  const sent = (method: 'POST' | 'PATCH') =>
    JSON.parse(
      String(
        calls('/rest/v1/employees')
          .filter(([, init]) => init?.method === method)
          .at(-1)![1]?.body
      )
    ) as Record<string, unknown>;
  const put = (payload: unknown) =>
    request(employeePath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  it('stores the sheet fields and returns them with the workplace', async () => {
    const row = {
      ...employeeRow,
      workplace_id: workplaceId,
      client_workplaces: { id: workplaceId, name: 'Punct de lucru Str. Fabricii 3' },
      qualification: 'Sudor autorizat',
      education: 'Școala profesională',
      authorizations: 'ISCIR',
      commute_route: 'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24',
      commute_minutes: 35,
    };
    mockUpstream({
      employees: () => Response.json(row, { status: 201 }),
      workplaces: () => Response.json({ id: workplaceId }),
    });
    const response = await postEmployee(sheetBody);
    expect(response.status).toBe(201);
    expect(sent('POST')).toMatchObject({
      workplace_id: workplaceId,
      qualification: 'Sudor autorizat',
      education: 'Școala profesională',
      authorizations: 'ISCIR',
      commute_route: 'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24',
      commute_minutes: 35,
    });
    const lookup = new URL(String(calls('/rest/v1/client_workplaces')[0]![0])).searchParams;
    expect([lookup.get('id'), lookup.get('client_id'), lookup.get('archived_at')]).toEqual([
      `eq.${workplaceId}`,
      `eq.${clientId}`,
      'is.null',
    ]);
    expect(employeeResponseSchema.parse(await response.json()).employee).toMatchObject({
      workplace: { id: workplaceId, name: 'Punct de lucru Str. Fabricii 3' },
      qualification: 'Sudor autorizat',
      commuteRoute: 'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24',
      commuteMinutes: 35,
    });
  });

  it('refuses a workplace that is archived or of another client, as it refuses a position', async () => {
    mockUpstream({ workplaces: () => Response.json(null) });
    const created = await postEmployee(sheetBody);
    expect(created.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await created.json()).issues?.[0]?.path).toBe(
      'workplaceId'
    );
    expect(calls('/rest/v1/employees')).toHaveLength(0);

    mockUpstream({
      employees: () => Response.json(employeeRow),
      workplaces: () => Response.json(null),
    });
    const updated = await put(sheetBody);
    expect(updated.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await updated.json()).issues?.[0]?.path).toBe(
      'workplaceId'
    );
    expect(calls('/rest/v1/employees').some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });

  it('puts a new employee at the only active workplace of the client', async () => {
    mockUpstream({
      employees: () => Response.json(employeeRow, { status: 201 }),
      workplaces: () => Response.json([{ id: workplaceId }]),
    });
    expect((await postEmployee(body)).status).toBe(201);
    expect(sent('POST').workplace_id).toBe(workplaceId);
    const lookup = new URL(String(calls('/rest/v1/client_workplaces')[0]![0])).searchParams;
    expect([lookup.get('client_id'), lookup.get('archived_at'), lookup.get('limit')]).toEqual([
      `eq.${clientId}`,
      'is.null',
      '2',
    ]);
  });

  it('leaves a new employee without a workplace when the body clears it, even at a client with one', async () => {
    mockUpstream({
      employees: () => Response.json(employeeRow, { status: 201 }),
      workplaces: () => Response.json([{ id: workplaceId }]),
    });
    expect((await postEmployee({ ...body, workplaceId: null })).status).toBe(201);
    expect(sent('POST').workplace_id).toBeNull();
    expect(calls('/rest/v1/client_workplaces')).toHaveLength(0);
  });

  it('leaves the workplace empty when the client has several or none', async () => {
    mockUpstream({
      employees: () => Response.json(employeeRow, { status: 201 }),
      workplaces: () => Response.json([{ id: workplaceId }, { id: positionId }]),
    });
    expect((await postEmployee(body)).status).toBe(201);
    expect(sent('POST').workplace_id).toBeNull();

    mockUpstream({ employees: () => Response.json(employeeRow, { status: 201 }) });
    expect((await postEmployee(body)).status).toBe(201);
    expect(sent('POST').workplace_id).toBeNull();
  });

  it('keeps the stored workplace when an edit leaves it out, and clears it when told', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await put(body)).status).toBe(200);
    expect(sent('PATCH')).not.toHaveProperty('workplace_id');
    expect(calls('/rest/v1/client_workplaces')).toHaveLength(0);

    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await put({ ...body, workplaceId: null })).status).toBe(200);
    expect(sent('PATCH').workplace_id).toBeNull();

    mockUpstream({
      employees: () => Response.json(employeeRow),
      workplaces: () => Response.json({ id: workplaceId }),
    });
    expect((await put(sheetBody)).status).toBe(200);
    expect(sent('PATCH')).toMatchObject({ workplace_id: workplaceId, commute_minutes: 35 });
  });

  it.each([
    [{ ...body, workplaceId: 'nope' }, 'workplaceId'],
    [{ ...body, qualification: 'x'.repeat(161) }, 'qualification'],
    [{ ...body, education: 'x'.repeat(161) }, 'education'],
    [{ ...body, authorizations: 'x'.repeat(501) }, 'authorizations'],
    [{ ...body, commuteRoute: 'x'.repeat(1001) }, 'commuteRoute'],
    [{ ...body, commuteRoute: '   ' }, 'commuteRoute'],
    [{ ...body, commuteMinutes: 0 }, 'commuteMinutes'],
    [{ ...body, commuteMinutes: 601 }, 'commuteMinutes'],
    [{ ...body, commuteMinutes: 12.5 }, 'commuteMinutes'],
  ])('rejects an invalid sheet field before touching the database: %j', async (payload, path) => {
    mockUpstream({});
    const response = await postEmployee(payload);
    expect(response.status).toBe(400);
    expect(
      apiErrorResponseSchema.parse(await response.json()).issues?.map((i) => i.path)
    ).toContain(path);
    expect(calls('/rest/v1/employees')).toHaveLength(0);
  });
});

describe('the employment contract number', () => {
  const body = { lastName: 'Popescu', firstName: 'Ion', jobTitle: 'Sudor', hiredAt: '2020-03-01' };
  const sent = (method: 'POST' | 'PATCH') =>
    JSON.parse(
      String(
        calls('/rest/v1/employees')
          .filter(([, init]) => init?.method === method)
          .at(-1)![1]?.body
      )
    ) as Record<string, unknown>;

  it('is stored trimmed, read with the full record and returned', async () => {
    mockUpstream({
      employees: () =>
        Response.json({ ...employeeRow, contract_number: '118/2020' }, { status: 201 }),
    });
    const response = await postEmployee({ ...body, contractNumber: ' 118/2020 ' });
    expect(response.status).toBe(201);
    expect(sent('POST').contract_number).toBe('118/2020');
    const select = new URL(String(calls('/rest/v1/employees')[0]![0])).searchParams.get('select');
    expect(select).toContain('contract_number');
    expect(employeeResponseSchema.parse(await response.json()).employee.contractNumber).toBe(
      '118/2020'
    );
  });

  it('is replaced on an edit and cleared when left out', async () => {
    const put = (payload: unknown) =>
      request(`${employeesPath}/${employeeRow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await put({ ...body, contractNumber: '7' })).status).toBe(200);
    expect(sent('PATCH').contract_number).toBe('7');

    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await put(body)).status).toBe(200);
    expect(sent('PATCH').contract_number).toBeNull();
  });

  it.each([['x'.repeat(51)], ['   ']])(
    'rejects %j before touching the database',
    async (contractNumber) => {
      mockUpstream({});
      const response = await postEmployee({ ...body, contractNumber });
      expect(response.status).toBe(400);
      expect(
        apiErrorResponseSchema.parse(await response.json()).issues?.map((i) => i.path)
      ).toContain('contractNumber');
      expect(calls('/rest/v1/employees')).toHaveLength(0);
    }
  );
});

describe('CORS', () => {
  it('allows PATCH preflight from the app origin', async () => {
    const response = await createApp().request(
      employeesPath,
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.ssmusor.ro',
          'Access-Control-Request-Method': 'PATCH',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      },
      env
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toMatch(/\bPATCH\b/);
  });
});

it('documents the employee routes with bearer security and schemas', () => {
  const document = createApp().getOpenAPIDocument(openApiConfig);
  const collection = document.paths?.['/clients/{clientId}/employees'];
  expect(collection?.get?.operationId).toBe('listEmployees');
  expect(collection?.post?.operationId).toBe('createEmployee');
  expect(collection?.post?.security).toEqual([{ bearerAuth: [] }]);
  expect(document.paths?.['/clients/{clientId}/employees/{employeeId}']?.get?.operationId).toBe(
    'getEmployee'
  );
  expect(
    document.paths?.['/clients/{clientId}/employees/{employeeId}/status']?.patch?.operationId
  ).toBe('updateEmployeeStatus');
  expect(document.components?.schemas?.CreateEmployeeRequest).toBeDefined();
  expect(document.components?.schemas?.UpdateEmployeeStatusRequest).toBeDefined();
  expect(document.components?.schemas?.EmployeeListResponse).toBeDefined();
  expect(document.components?.schemas?.EmployeeResponse).toBeDefined();
});
