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

const employeeRow = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  client_id: clientId,
  last_name: 'Popescu',
  first_name: 'Ion',
  cnp: '1900101400127',
  employee_number: 'A-17',
  email: 'ion.popescu@example.com',
  phone: '+40 721 000 000',
  job_title: 'Sudor',
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
};

// What the list query selects: everything but the CNP and the training-sheet details.
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
      ].includes(key)
  )
);

type Handler = (init?: RequestInit, url?: URL) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(
  handlers: Partial<Record<'auth' | 'membership' | 'clients' | 'employees', Handler>>
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
          phone: '+40 721 000 000',
          jobTitle: 'Sudor',
          hiredAt: '2020-03-01',
          status: 'active',
          terminatedAt: null,
          createdAt: employeeRow.created_at,
          updatedAt: employeeRow.updated_at,
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
    phone: '+40 721 000 000',
    jobTitle: 'Sudor',
    hiredAt: '2020-03-01',
    birthDate: '1990-01-01',
    birthPlace: 'Cluj-Napoca',
    homeAddress: 'Str. Lungă 5, Cluj-Napoca',
    bloodGroup: 'A(II)',
    rhFactor: '+',
  };

  it('stores the digits-only CNP, lowercases the email, and scopes to the membership', async () => {
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
      phone: '+40 721 000 000',
      job_title: 'Sudor',
      hired_at: '2020-03-01',
      birth_date: '1990-01-01',
      birth_place: 'Cluj-Napoca',
      home_address: 'Str. Lungă 5, Cluj-Napoca',
      blood_group: 'A(II)',
      rh_factor: '+',
      notes: null,
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
