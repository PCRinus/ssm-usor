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

type Upstream =
  'clients' | 'employees' | 'employee_training_status' | 'employee_test_status' | 'inState';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    if (url.pathname === '/rest/v1/rpc/organization_employees_in_state') {
      return (
        handlers.inState?.(url) ??
        Response.json([organizationRow], { headers: { 'Content-Range': '0-0/1' } })
      );
    }
    if (url.pathname === '/rest/v1/clients') {
      return handlers.clients?.(url) ?? Response.json([{ id: clientId, archived_at: null }]);
    }
    if (url.pathname === '/rest/v1/employees') {
      return (
        handlers.employees?.(url) ??
        Response.json([organizationRow], { headers: { 'Content-Range': '0-0/1' } })
      );
    }
    if (url.pathname === '/rest/v1/employee_training_status') {
      return handlers.employee_training_status?.(url) ?? Response.json([]);
    }
    if (url.pathname === '/rest/v1/employee_test_status') {
      return handlers.employee_test_status?.(url) ?? Response.json([]);
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  });
}

const upstreamCalls = (table: Upstream) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === `/rest/v1/${table}`)
    .map((url) => url.searchParams);

const employeesQuery = (index = 0) => upstreamCalls('employees')[index]!;

const inStateCalls = () =>
  fetchMock.mock.calls
    .filter(
      ([input]) =>
        new URL(String(input)).pathname === '/rest/v1/rpc/organization_employees_in_state'
    )
    .map(([input, init]) => ({
      query: new URL(String(input)).searchParams,
      args: JSON.parse(String(init?.body)) as Record<string, string>,
    }));

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
            ssm: {
              state: null,
              dueOn: null,
              lastPeriodicOn: null,
              intervalMonths: null,
              intervalSource: null,
            },
            psi: {
              state: null,
              dueOn: null,
              lastPeriodicOn: null,
              intervalMonths: null,
              intervalSource: null,
            },
          },
          tests: {
            ssm: { state: null, awaitingTest: null, lastPassedOn: null, dueOn: null },
            psi: { state: null, awaitingTest: null, lastPassedOn: null, dueOn: null },
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

  it('pages the employees in a training state through the organization-wide states, then reads their statuses', async () => {
    mockUpstream();
    const response = await request('/employees?trainingState=due');
    expect(response.status).toBe(200);
    const listed = organizationEmployeeListResponseSchema.parse(await response.json());
    expect(listed.total).toBe(1);
    expect(listed.items.map((item) => item.client.name)).toEqual(['Șantierul Naval SA']);
    const [call] = inStateCalls();
    expect(call!.args).toEqual({
      p_organization_id: membership.organization_id,
      p_training_state: 'due',
    });
    expect(call!.query.get('select')).toBe(
      '*,job_positions(id,name),client_workplaces!employees_workplace_in_client(id,name),client:clients!employees_client_id_fkey(id,legal_name)'
    );
    expect(call!.query.get('status')).toBe('neq.terminated');
    expect(call!.query.get('order')).toBe('last_name.asc,first_name.asc,id.asc');
    expect(call!.query.get('offset')).toBe('0');
    expect(call!.query.get('limit')).toBe('25');
    expect(upstreamCalls('employees')).toHaveLength(0);
    expect(upstreamCalls('employee_training_status')[0]!.get('employee_id')).toBe(
      `in.(${employeeListRow.id})`
    );
    expect(upstreamCalls('employee_test_status')[0]!.get('employee_id')).toBe(
      `in.(${employeeListRow.id})`
    );
  });

  it.each([
    ['testState=pending', { p_test_state: 'pending' }],
    ['trainingState=overdue&domain=ssm', { p_training_state: 'overdue', p_domain: 'ssm' }],
    [
      'trainingState=current&testState=passed&domain=psi',
      { p_training_state: 'current', p_test_state: 'passed', p_domain: 'psi' },
    ],
  ])('passes %s to the organization-wide states', async (search, args) => {
    mockUpstream();
    const response = await request(`/employees?${search}`);
    expect(response.status).toBe(200);
    expect(inStateCalls()[0]!.args).toEqual({
      p_organization_id: membership.organization_id,
      ...args,
    });
  });

  it('keeps the client, status and search filters on the employees in a state', async () => {
    mockUpstream();
    await request(
      `/employees?trainingState=overdue&clientId=${clientId}&status=active&q=${encodeURIComponent('Ștefan pop')}`
    );
    const { query } = inStateCalls()[0]!;
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('status')).toBe('eq.active');
    expect(query.get('select')).toContain(
      'client_name_match_0:clients!employees_client_id_fkey(),client_name_match_1:clients!employees_client_id_fkey()'
    );
    expect(query.get('client_name_match_0.client_search_name')).toBe('ilike.*stefan*');
    expect(query.get('client_name_match_1.client_search_name')).toBe('ilike.*pop*');
    expect(query.getAll('or')).toEqual([
      '(employee_search_name.ilike.*stefan*,employee_number.ilike.*stefan*,client_name_match_0.not.is.null)',
      '(employee_search_name.ilike.*pop*,employee_number.ilike.*pop*,client_name_match_1.not.is.null)',
    ]);
  });

  it('sorts the employees in a state as the list', async () => {
    mockUpstream();
    await request('/employees?trainingState=overdue&sort=client&order=desc&page=2');
    const { query } = inStateCalls()[0]!;
    expect(query.get('order')).toBe(
      'client(legal_name).desc,last_name.desc,first_name.desc,id.asc'
    );
    expect(query.get('offset')).toBe('25');
  });

  it('reads no statuses when no one is in the state', async () => {
    mockUpstream({
      inState: () => Response.json([], { headers: { 'Content-Range': '*/0' } }),
    });
    const response = await request('/employees?testState=annual_due');
    expect(await response.json()).toEqual({ items: [], page: 1, pageSize: 25, total: 0 });
    expect(upstreamCalls('employee_training_status')).toHaveLength(0);
    expect(upstreamCalls('employee_test_status')).toHaveLength(0);
  });

  it('answers a page past the end of the employees in a state with the real total', async () => {
    let call = 0;
    mockUpstream({
      inState: () => {
        call += 1;
        return call === 1
          ? Response.json(
              { code: 'PGRST103', message: 'Requested range not satisfiable', details: null },
              { status: 416 }
            )
          : Response.json([], { headers: { 'Content-Range': '*/3' } });
      },
    });
    const response = await request('/employees?trainingState=due&page=9&q=naval');
    expect(await response.json()).toEqual({ items: [], page: 9, pageSize: 25, total: 3 });
    const recount = inStateCalls()[1]!.query;
    expect(recount.get('client_name_match_0.client_search_name')).toBe('ilike.*naval*');
  });

  it('ignores a domain when no state is asked for', async () => {
    mockUpstream();
    await request('/employees?domain=ssm');
    const query = employeesQuery();
    expect(query.get('select')).not.toContain('training_status!inner');
    expect(query.get('training_status.or')).toBeNull();
    expect(query.get('test_status.or')).toBeNull();
  });

  it('reads the statuses of the page alone when no state is asked for', async () => {
    const other = {
      ...organizationRow,
      id: '9b2f4c1e-3d5a-4e6f-8a7b-0c1d2e3f4a5b',
      last_name: 'Popa',
    };
    mockUpstream({
      employees: () =>
        Response.json([organizationRow, other], { headers: { 'Content-Range': '0-1/2' } }),
      employee_training_status: () =>
        Response.json([
          {
            employee_id: organizationRow.id,
            ssm_state: 'due',
            ssm_due_on: '2026-11-01',
            ssm_last_periodic_on: '2026-05-01',
            ssm_interval_months: 6,
            ssm_interval_source: 'position',
            psi_state: 'current',
            psi_due_on: '2027-05-01',
            psi_last_periodic_on: '2026-05-01',
            psi_interval_months: 12,
            psi_interval_source: 'client',
          },
        ]),
      employee_test_status: () =>
        Response.json([
          {
            employee_id: other.id,
            ssm_state: 'pending',
            ssm_awaiting_test: 'hiring',
            ssm_last_passed_on: null,
            psi_state: 'passed',
            psi_awaiting_test: null,
            psi_last_passed_on: '2026-04-01',
            psi_due_on: '2027-04-01',
          },
        ]),
    });
    const response = await request('/employees');
    expect(response.status).toBe(200);
    const { items } = organizationEmployeeListResponseSchema.parse(await response.json());
    expect(items.map(({ id, training, tests }) => ({ id, training, tests }))).toEqual([
      {
        id: organizationRow.id,
        training: {
          ssm: {
            state: 'due',
            dueOn: '2026-11-01',
            lastPeriodicOn: '2026-05-01',
            intervalMonths: 6,
            intervalSource: 'position',
          },
          psi: {
            state: 'current',
            dueOn: '2027-05-01',
            lastPeriodicOn: '2026-05-01',
            intervalMonths: 12,
            intervalSource: 'client',
          },
        },
        tests: {
          ssm: { state: null, awaitingTest: null, lastPassedOn: null, dueOn: null },
          psi: { state: null, awaitingTest: null, lastPassedOn: null, dueOn: null },
        },
      },
      {
        id: other.id,
        training: {
          ssm: {
            state: null,
            dueOn: null,
            lastPeriodicOn: null,
            intervalMonths: null,
            intervalSource: null,
          },
          psi: {
            state: null,
            dueOn: null,
            lastPeriodicOn: null,
            intervalMonths: null,
            intervalSource: null,
          },
        },
        tests: {
          ssm: { state: 'pending', awaitingTest: 'hiring', lastPassedOn: null, dueOn: null },
          psi: {
            state: 'passed',
            awaitingTest: null,
            lastPassedOn: '2026-04-01',
            dueOn: '2027-04-01',
          },
        },
      },
    ]);
    const select = employeesQuery().get('select');
    expect(select).not.toContain('training_status');
    expect(select).not.toContain('test_status');
    const [training] = upstreamCalls('employee_training_status');
    expect(training!.get('employee_id')).toBe(`in.(${organizationRow.id},${other.id})`);
    expect(training!.get('select')).toBe(
      'employee_id,ssm_state,ssm_due_on,ssm_last_periodic_on,ssm_interval_months,ssm_interval_source,psi_state,psi_due_on,psi_last_periodic_on,psi_interval_months,psi_interval_source'
    );
    const [tests] = upstreamCalls('employee_test_status');
    expect(tests!.get('employee_id')).toBe(`in.(${organizationRow.id},${other.id})`);
    expect(tests!.get('select')).toBe(
      'employee_id,ssm_state,ssm_awaiting_test,ssm_last_passed_on,psi_state,psi_awaiting_test,psi_last_passed_on,psi_due_on'
    );
  });

  it('reads no statuses for an empty page', async () => {
    mockUpstream({
      employees: () => Response.json([], { headers: { 'Content-Range': '*/0' } }),
    });
    const response = await request('/employees?q=nimeni');
    expect(await response.json()).toEqual({ items: [], page: 1, pageSize: 25, total: 0 });
    expect(upstreamCalls('employee_training_status')).toHaveLength(0);
    expect(upstreamCalls('employee_test_status')).toHaveLength(0);
  });

  it('asks every word for the name, the employee number or the client name', async () => {
    mockUpstream();
    await request(`/employees?q=${encodeURIComponent('Ștefan șantier')}`);
    const query = employeesQuery();
    expect(query.getAll('or')).toEqual([
      '(employee_search_name.ilike.*stefan*,employee_number.ilike.*stefan*,client_name_match_0.not.is.null)',
      '(employee_search_name.ilike.*santier*,employee_number.ilike.*santier*,client_name_match_1.not.is.null)',
    ]);
    expect(query.get('client_name_match_0.client_search_name')).toBe('ilike.*stefan*');
    expect(query.get('client_name_match_1.client_search_name')).toBe('ilike.*santier*');
    expect(query.get('select')).toContain(
      'client_name_match_0:clients!employees_client_id_fkey(),client_name_match_1:clients!employees_client_id_fkey()'
    );
  });

  it('embeds no client name match without a search', async () => {
    mockUpstream();
    await request('/employees?q=%20');
    expect(employeesQuery().get('select')).not.toContain('client_name_match');
  });

  it('matches the client name in the recount of a page past the end', async () => {
    let call = 0;
    mockUpstream({
      employees: () => {
        call += 1;
        return call === 1
          ? Response.json(
              { code: 'PGRST103', message: 'Requested range not satisfiable', details: null },
              { status: 416 }
            )
          : Response.json([], { headers: { 'Content-Range': '*/0' } });
      },
    });
    await request('/employees?page=9&q=naval');
    const recount = employeesQuery(1);
    expect(recount.get('select')).toContain(
      'client_name_match_0:clients!employees_client_id_fkey()'
    );
    expect(recount.get('client_name_match_0.client_search_name')).toBe('ilike.*naval*');
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

  it.each([
    'sort=cnp',
    'clientId=not-a-uuid',
    'status=suspended',
    'trainingState=expired',
    'testState=failed',
    'domain=su',
  ])('rejects %s', async (search) => {
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
    expect(upstreamCalls('employee_training_status')).toHaveLength(0);
  });
});
