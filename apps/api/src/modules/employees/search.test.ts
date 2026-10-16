import {
  apiErrorResponseSchema,
  employeeListResponseSchema,
  organizationEmployeeListResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

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
  role: 'specialist',
};

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const employeeListRow = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  client_id: clientId,
  last_name: 'Țăranu',
  first_name: 'Ștefan',
  employee_number: 'A-17',
  email: null,
  phone: null,
  job_title: 'Sudor',
  job_positions: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor autorizat' },
  workplace_id: null,
  client_workplaces: null,
  training_status: null,
  hired_at: '2020-03-01',
  status: 'active',
  terminated_at: null,
  created_at: '2026-09-17T10:00:00+00:00',
  updated_at: '2026-09-17T10:00:00+00:00',
};

const organizationRow = {
  ...employeeListRow,
  client: { id: clientId, legal_name: 'Șantierul Naval SA' },
};

type Handler = (url: URL) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<'clients' | 'employees', Handler>> = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    if (url.pathname === '/rest/v1/clients') {
      return handlers.clients?.(url) ?? Response.json([{ id: clientId, archived_at: null }]);
    }
    if (url.pathname === '/rest/v1/employees') {
      return (
        handlers.employees?.(url) ??
        Response.json([organizationRow], { headers: { 'Content-Range': '0-0/1' } })
      );
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  });
}

const employeesQuery = (index = 0) => {
  const call = fetchMock.mock.calls.filter(
    ([input]) => new URL(String(input)).pathname === '/rest/v1/employees'
  )[index];
  return new URL(String(call![0])).searchParams;
};

const request = (path: string) =>
  createApp().request(path, { headers: { Authorization: 'Bearer test-access-token' } }, env);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("searching a client's employees", () => {
  it('asks every word for the name or the employee number, without diacritics', async () => {
    mockUpstream({
      employees: () => Response.json([employeeListRow], { headers: { 'Content-Range': '0-0/1' } }),
    });
    const response = await request(
      `/clients/${clientId}/employees?q=${encodeURIComponent('  ȘTEFAN  țăr ')}`
    );
    expect(response.status).toBe(200);
    expect(employeeListResponseSchema.parse(await response.json()).total).toBe(1);
    const query = employeesQuery();
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.getAll('or')).toEqual([
      '(employee_search_name.ilike.*stefan*,employee_number.ilike.*stefan*)',
      '(employee_search_name.ilike.*tar*,employee_number.ilike.*tar*)',
    ]);
  });

  it('splits on punctuation, so nothing typed can break the filter', async () => {
    mockUpstream();
    await request(`/clients/${clientId}/employees?q=${encodeURIComponent('A-17,(x)')}`);
    expect(employeesQuery().getAll('or')).toEqual([
      '(employee_search_name.ilike.*a*,employee_number.ilike.*a*)',
      '(employee_search_name.ilike.*17*,employee_number.ilike.*17*)',
      '(employee_search_name.ilike.*x*,employee_number.ilike.*x*)',
    ]);
  });

  it('does not filter for a blank query', async () => {
    mockUpstream();
    await request(`/clients/${clientId}/employees?q=%20%20`);
    expect(employeesQuery().has('or')).toBe(false);
  });

  it('refuses a query over 100 characters', async () => {
    mockUpstream();
    const response = await request(`/clients/${clientId}/employees?q=${'a'.repeat(101)}`);
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
  });
});

describe('GET /employees', () => {
  it("lists the organization's current employees of active clients, each with its client", async () => {
    mockUpstream();
    const response = await request('/employees');
    expect(response.status).toBe(200);
    expect(organizationEmployeeListResponseSchema.parse(await response.json())).toEqual({
      page: 1,
      pageSize: 25,
      total: 1,
      items: [
        {
          id: employeeListRow.id,
          clientId,
          lastName: 'Țăranu',
          firstName: 'Ștefan',
          employeeNumber: 'A-17',
          email: null,
          phone: null,
          jobTitle: 'Sudor',
          jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor autorizat' },
          hiredAt: '2020-03-01',
          status: 'active',
          terminatedAt: null,
          workplace: null,
          training: {
            ssm: { state: null, dueOn: null, lastPeriodicOn: null },
            psi: { state: null, dueOn: null, lastPeriodicOn: null },
          },
          createdAt: employeeListRow.created_at,
          updatedAt: employeeListRow.updated_at,
          client: { id: clientId, name: 'Șantierul Naval SA' },
        },
      ],
    });
    const query = employeesQuery();
    expect(query.get('select')).toContain('client:clients!employees_client_id_fkey!inner(');
    expect(query.get('select')).not.toContain('cnp');
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('client.stage')).toBe('eq.client');
    expect(query.get('client.archived_at')).toBe('is.null');
    expect(query.get('status')).toBe('neq.terminated');
    expect(query.has('client_id')).toBe(false);
    expect(query.has('or')).toBe(false);
    expect(query.get('order')).toBe('last_name.asc,first_name.asc,id.asc');
    expect(query.get('offset')).toBe('0');
    expect(query.get('limit')).toBe('25');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/rest/v1/clients'))).toBe(
      false
    );
  });

  it('filters by client and status, never listing archived clients', async () => {
    mockUpstream();
    await request(`/employees?clientId=${clientId}&status=terminated`);
    const query = employeesQuery();
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('status')).toBe('eq.terminated');
    expect(query.get('client.archived_at')).toBe('is.null');
    expect(query.get('client.stage')).toBe('eq.client');
  });

  it('searches the name, the employee number and the client name', async () => {
    mockUpstream();
    await request(`/employees?q=${encodeURIComponent('Ștefan șantier')}`);
    expect(employeesQuery().getAll('or')).toEqual([
      '(employee_search_name.ilike.*stefan*,employee_number.ilike.*stefan*,employee_client_search_name.ilike.*stefan*)',
      '(employee_search_name.ilike.*santier*,employee_number.ilike.*santier*,employee_client_search_name.ilike.*santier*)',
    ]);
  });

  it.each([
    ['client', 'asc', 'client(legal_name).asc,last_name.asc,first_name.asc,id.asc'],
    ['jobPosition', 'desc', 'job_positions(name).desc,last_name.desc,first_name.desc,id.asc'],
    ['hiredAt', 'asc', 'hired_at.asc,last_name.asc,first_name.asc,id.asc'],
    ['name', 'desc', 'last_name.desc,first_name.desc,id.asc'],
  ])('sorts by %s %s with a stable tiebreaker', async (sort, order, expected) => {
    mockUpstream({
      employees: () =>
        Response.json([organizationRow], { headers: { 'Content-Range': '25-25/26' } }),
    });
    const response = await request(`/employees?sort=${sort}&order=${order}&page=2`);
    expect(response.status).toBe(200);
    const query = employeesQuery();
    expect(query.get('order')).toBe(expected);
    expect(query.get('offset')).toBe('25');
  });

  it.each(['sort=cnp', 'clientId=not-a-uuid', 'status=suspended'])('rejects %s', async (search) => {
    mockUpstream();
    const response = await request(`/employees?${search}`);
    expect(response.status).toBe(400);
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/rest/v1/employees'))
    ).toBe(false);
  });

  it('answers a page past the end with an empty page and the real total', async () => {
    let call = 0;
    mockUpstream({
      employees: () => {
        call += 1;
        return call === 1
          ? Response.json(
              { code: 'PGRST103', message: 'Requested range not satisfiable', details: null },
              { status: 416 }
            )
          : Response.json([], { headers: { 'Content-Range': '*/3' } });
      },
    });
    const response = await request('/employees?page=9');
    expect(await response.json()).toEqual({ items: [], page: 9, pageSize: 25, total: 3 });
  });
});
