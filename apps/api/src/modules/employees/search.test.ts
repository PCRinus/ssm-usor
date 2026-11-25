import {
  apiErrorResponseSchema,
  employeeListResponseSchema,
  organizationEmployeeListResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../../test/request';
import {
  callsTo,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
  testEnv,
} from '../../test/upstream';

const env = testEnv({ CORS_ORIGINS: 'http://localhost:5173, https://app.ssmusor.ro' });

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const otherClientId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

const viewRow = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  client_id: clientId,
  client_name: 'Șantierul Naval SA',
  last_name: 'Țăranu',
  first_name: 'Ștefan',
  employee_number: 'A-17',
  email: null,
  phone: null,
  job_title: 'Sudor',
  job_position_id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
  job_position_name: 'Sudor autorizat',
  workplace_id: null,
  workplace_name: null,
  hired_at: '2020-03-01',
  status: 'active',
  terminated_at: null,
  created_at: '2026-09-17T10:00:00+00:00',
  updated_at: '2026-09-17T10:00:00+00:00',
  signatures_pending_count: 0,
  duties_acknowledgement_state: 'signed',
};

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;

type Upstream = 'clients' | 'list' | 'employee_training_status' | 'employee_test_status';

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  mockSignedInUpstream({
    '/rest/v1/clients': ({ url, init }) =>
      handlers.clients?.(url, init) ?? Response.json([{ id: clientId, archived_at: null }]),
    '/rest/v1/employee_list': ({ url, init }) =>
      handlers.list?.(url, init) ??
      Response.json([viewRow], { headers: { 'Content-Range': '0-0/1' } }),
    '/rest/v1/employee_training_status': ({ url, init }) =>
      handlers.employee_training_status?.(url, init) ?? Response.json([]),
    '/rest/v1/employee_test_status': ({ url, init }) =>
      handlers.employee_test_status?.(url, init) ?? Response.json([]),
  });
}

const queriesTo = (table: string, method = 'GET') =>
  callsTo(`/rest/v1/${table}`, method).map((call) => call.url.searchParams);

const listQuery = () => queriesTo('employee_list')[0]!;

const request = (path: string) => apiRequest(path, {}, env);

stubFetch();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searching a client's employees", () => {
  it('asks every word for the name or the employee number, without diacritics', async () => {
    mockUpstream();
    const response = await request(
      `/clients/${clientId}/employees?q=${encodeURIComponent('  ȘTEFAN  țăr ')}`
    );
    expect(response.status).toBe(200);
    expect(employeeListResponseSchema.parse(await response.json()).total).toBe(1);
    const query = listQuery();
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.getAll('or')).toEqual([
      '(search_name.ilike.*stefan*,employee_number.ilike.*stefan*)',
      '(search_name.ilike.*tar*,employee_number.ilike.*tar*)',
    ]);
  });

  it('splits on punctuation, so nothing typed can break the filter', async () => {
    mockUpstream();
    await request(`/clients/${clientId}/employees?q=${encodeURIComponent('A-17,(x)')}`);
    expect(listQuery().getAll('or')).toEqual([
      '(search_name.ilike.*a*,employee_number.ilike.*a*)',
      '(search_name.ilike.*17*,employee_number.ilike.*17*)',
      '(search_name.ilike.*x*,employee_number.ilike.*x*)',
    ]);
  });

  it('does not filter for a blank query, nor count the list twice', async () => {
    mockUpstream();
    await request(`/clients/${clientId}/employees?q=%20%20`);
    expect(listQuery().has('or')).toBe(false);
    expect(queriesTo('employee_list', 'HEAD')).toHaveLength(0);
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
      unfilteredTotal: 1,
      items: [
        {
          id: viewRow.id,
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
            su: {
              state: null,
              dueOn: null,
              lastPeriodicOn: null,
              intervalMonths: null,
              intervalSource: null,
            },
          },
          tests: {
            ssm: { state: null, awaitingTest: null, lastPassedOn: null, dueOn: null },
            su: { state: null, awaitingTest: null, lastPassedOn: null, dueOn: null },
          },
          createdAt: viewRow.created_at,
          updatedAt: viewRow.updated_at,
          signaturesPending: 0,
          dutiesAcknowledgement: 'signed',
          client: { id: clientId, name: 'Șantierul Naval SA' },
        },
      ],
    });
    const query = listQuery();
    expect(query.get('select')).not.toContain('cnp');
    // Unselected, the standing on the portal leaves the view's join out of the organization's list.
    expect(query.get('select')).not.toContain('portal_');
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('client_stage')).toBe('eq.client');
    expect(query.get('client_archived_at')).toBe('is.null');
    expect(query.get('status')).toBe('neq.terminated');
    expect(query.has('client_id')).toBe(false);
    expect(query.has('or')).toBe(false);
    expect(query.get('order')).toBe('last_name.asc,first_name.asc,id.asc');
    expect(query.get('offset')).toBe('0');
    expect(query.get('limit')).toBe('25');
    expect(queriesTo('clients')).toHaveLength(0);
  });

  it('matches the name and the employee number, never the client name', async () => {
    mockUpstream();
    await request('/employees?q=santierul');
    expect(listQuery().getAll('or')).toEqual([
      '(search_name.ilike.*santierul*,employee_number.ilike.*santierul*)',
    ]);
    expect(listQuery().get('select')).not.toContain('clients');
  });

  it('filters by clients and status, never listing archived clients', async () => {
    mockUpstream();
    await request(`/employees?client=${clientId}&client=${otherClientId}&status=terminated`);
    const query = listQuery();
    expect(query.get('client_id')).toBe(`in.(${clientId},${otherClientId})`);
    expect(query.get('status')).toBe('eq.terminated');
    expect(query.get('client_archived_at')).toBe('is.null');
  });

  it('filters by the training of each domain and the needs, and counts the tab without them', async () => {
    mockUpstream({
      list: (_, init) =>
        init?.method === 'HEAD'
          ? new Response(null, { headers: { 'Content-Range': '*/340' } })
          : Response.json([viewRow], { headers: { 'Content-Range': '0-0/1' } }),
    });
    const response = await request(
      '/employees?suTraining=overdue&attention=signaturesPending&test=pending'
    );
    expect(organizationEmployeeListResponseSchema.parse(await response.json())).toMatchObject({
      total: 1,
      unfilteredTotal: 340,
    });
    const query = listQuery();
    expect(query.get('su_training_state')).toBe('in.(overdue)');
    expect(query.getAll('or')).toEqual([
      '(ssm_test_state.eq.pending,su_test_state.eq.pending)',
      '(signatures_pending_count.gt.0)',
    ]);
    const [count] = queriesTo('employee_list', 'HEAD');
    expect(count!.get('client_stage')).toBe('eq.client');
    expect(count!.has('su_training_state')).toBe(false);
    expect(count!.has('or')).toBe(false);
  });

  it.each([
    ['client', 'client_name.asc,last_name.asc,first_name.asc,id.asc'],
    [
      'suTraining',
      'su_training_rank.asc.nullslast,su_training_due_on.asc.nullslast,last_name.asc,first_name.asc,id.asc',
    ],
  ])('sorts by %s', async (sort, order) => {
    mockUpstream();
    await request(`/employees?sort=${sort}`);
    expect(listQuery().get('order')).toBe(order);
  });

  it('reads the statuses of the page alone', async () => {
    mockUpstream({
      employee_training_status: () =>
        Response.json([
          {
            employee_id: viewRow.id,
            ssm_state: 'overdue',
            ssm_due_on: '2026-10-01',
            ssm_last_periodic_on: null,
            ssm_interval_months: 3,
            ssm_interval_source: 'client',
            su_state: 'current',
            su_due_on: '2027-04-01',
            su_last_periodic_on: '2026-10-01',
            su_interval_months: 6,
            su_interval_source: 'client',
          },
        ]),
    });
    const response = await request('/employees');
    const [item] = organizationEmployeeListResponseSchema.parse(await response.json()).items;
    expect(item!.training.ssm).toMatchObject({ state: 'overdue', dueOn: '2026-10-01' });
    const [training] = queriesTo('employee_training_status');
    expect(training!.get('employee_id')).toBe(`in.(${viewRow.id})`);
  });

  it('answers a page past the end with an empty page and the real total', async () => {
    mockUpstream({
      list: (_, init) =>
        init?.method === 'HEAD'
          ? new Response(null, { headers: { 'Content-Range': '*/30' } })
          : Response.json(
              { code: 'PGRST103', message: 'Requested range not satisfiable' },
              { status: 416 }
            ),
    });
    const response = await request('/employees?page=5&q=ion');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      page: 5,
      pageSize: 25,
      total: 30,
      unfilteredTotal: 30,
    });
    const recount = queriesTo('employee_list', 'HEAD').find((query) => query.has('or'));
    expect(recount!.getAll('or')).toEqual([
      '(search_name.ilike.*ion*,employee_number.ilike.*ion*)',
    ]);
    expect(queriesTo('employee_training_status')).toHaveLength(0);
  });
});
