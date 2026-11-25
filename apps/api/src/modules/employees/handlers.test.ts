import {
  apiErrorResponseSchema,
  employeeInviteesResponseSchema,
  employeeListResponseSchema,
  employeeResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../../test/request';
import {
  callsTo,
  fetchMock,
  membershipRow,
  routeUpstream,
  stubFetch,
  testEnv,
  testOrganizationId,
  testUser as user,
} from '../../test/upstream';

const env = testEnv({ CORS_ORIGINS: 'http://localhost:5173, https://app.ssmusor.ro' });

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const activeClient = { id: clientId, archived_at: null, stage: 'client' };
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
  job_positions: {
    id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
    name: 'Sudor autorizat',
    archived_at: null,
  },
  hired_at: '2020-03-01',
  status: 'active',
  terminated_at: null,
  birth_date: '1990-01-01',
  birth_place: 'Cluj-Napoca',
  home_address: 'Str. Lungă 5, Cluj-Napoca',
  residence_address: 'Str. Florilor 9, Florești',
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
  commute_means: [],
  commute_means_other: null,
  commute_minutes: null,
  training_status: {
    ssm_state: 'due',
    ssm_due_on: '2026-11-01',
    ssm_last_periodic_on: '2026-08-01',
    ssm_interval_months: 3,
    ssm_interval_source: 'position',
    su_state: 'untrained',
    su_due_on: null,
    su_last_periodic_on: null,
    su_interval_months: 6,
    su_interval_source: 'client',
  },
  test_status: {
    ssm_state: 'pending',
    ssm_awaiting_test: 'hiring',
    ssm_last_passed_on: null,
    su_state: 'passed',
    su_awaiting_test: null,
    su_last_passed_on: '2026-03-02',
    su_due_on: '2027-03-02',
  },
};

const noAccess = {
  state: 'none',
  since: null,
  expiresAt: null,
  revokedAt: null,
  resendableAt: null,
  channel: null,
  address: null,
  language: null,
  participantId: null,
  invitationId: null,
  administrator: false,
};

const tests = {
  ssm: { state: 'pending', awaitingTest: 'hiring', lastPassedOn: null, dueOn: null },
  su: { state: 'passed', awaitingTest: null, lastPassedOn: '2026-03-02', dueOn: '2027-03-02' },
};

const training = {
  ssm: {
    state: 'due',
    dueOn: '2026-11-01',
    lastPeriodicOn: '2026-08-01',
    intervalMonths: 3,
    intervalSource: 'position',
  },
  su: {
    state: 'untrained',
    dueOn: null,
    lastPeriodicOn: null,
    intervalMonths: 6,
    intervalSource: 'client',
  },
};

const employeeViewRow = {
  id: employeeRow.id,
  client_id: clientId,
  client_name: 'Șantierul Naval SA',
  last_name: 'Popescu',
  first_name: 'Ion',
  employee_number: 'A-17',
  email: 'ion.popescu@example.com',
  phone: '+40721000000',
  job_title: 'Sudor',
  job_position_id: positionId,
  job_position_name: 'Sudor autorizat',
  workplace_id: workplaceId,
  workplace_name: 'Atelier',
  hired_at: '2020-03-01',
  status: 'active',
  terminated_at: null,
  created_at: employeeRow.created_at,
  updated_at: employeeRow.updated_at,
  signatures_pending_count: 2,
  duties_acknowledgement_state: 'sign_again',
};

type Handler = (init?: RequestInit, url?: URL) => Response | Promise<Response>;

function mockUpstream(
  handlers: Partial<
    Record<
      'auth' | 'membership' | 'clients' | 'employees' | 'positions' | 'workplaces' | 'list',
      Handler
    >
  >
) {
  routeUpstream({
    '/auth/v1/user': ({ init, url }) => handlers.auth?.(init, url) ?? Response.json(user),
    '/rest/v1/rpc/current_membership': ({ init, url }) =>
      handlers.membership?.(init, url) ?? Response.json([membershipRow({ role: 'owner' })]),
    '/rest/v1/clients': ({ init, url }) =>
      handlers.clients?.(init, url) ?? Response.json([activeClient]),
    '/rest/v1/job_positions': ({ init, url }) =>
      handlers.positions?.(init, url) ?? Response.json({ id: positionId }),
    '/rest/v1/client_workplaces': ({ init, url }) =>
      handlers.workplaces?.(init, url) ?? Response.json([]),
    '/rest/v1/employee_list': ({ init, url }) =>
      handlers.list?.(init, url) ??
      Response.json([employeeViewRow], { headers: { 'Content-Range': '0-0/1' } }),
    '/rest/v1/employee_training_status': () =>
      Response.json([{ employee_id: employeeRow.id, ...employeeRow.training_status }]),
    '/rest/v1/employee_test_status': () =>
      Response.json([{ employee_id: employeeRow.id, ...employeeRow.test_status }]),
    '/rest/v1/employees': ({ init, url }) =>
      handlers.employees?.(init, url) ??
      Response.json([employeeRow], { headers: { 'Content-Range': '0-0/1' } }),
  });
}

const request = (path: string, init: RequestInit = {}, token?: string | null) =>
  apiRequest(path, { ...init, token }, env);

const employeesPath = `/clients/${clientId}/employees`;

const postEmployee = (body: unknown, path = employeesPath, token?: string | null) =>
  apiRequest(path, { method: 'POST', body, token }, env);

stubFetch();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /clients/{clientId}/employees', () => {
  const listCalls = () =>
    callsTo('/rest/v1/employee_list').map(({ url, method, headers }) => ({
      query: url.searchParams,
      method,
      headers,
    }));
  const listQuery = (index = 0) =>
    listCalls().filter((call) => call.method === 'GET')[index]!.query;
  const countQueries = () =>
    listCalls()
      .filter((call) => call.method === 'HEAD')
      .map((call) => call.query);

  it('lists employees of the client without the CNP, each with its statuses and pending signatures', async () => {
    mockUpstream({});
    const response = await request(employeesPath);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(employeeListResponseSchema.parse(body)).toEqual({
      page: 1,
      pageSize: 25,
      total: 1,
      unfilteredTotal: 1,
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
          jobPosition: { id: positionId, name: 'Sudor autorizat' },
          hiredAt: '2020-03-01',
          status: 'active',
          terminatedAt: null,
          workplace: { id: workplaceId, name: 'Atelier' },
          createdAt: employeeRow.created_at,
          updatedAt: employeeRow.updated_at,
          training,
          tests,
          signaturesPending: 2,
          dutiesAcknowledgement: 'sign_again',
          portal: noAccess,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('cnp');
    const { url: clientUrl } = callsTo('/rest/v1/clients')[0]!;
    expect(clientUrl.searchParams.get('id')).toBe(`eq.${clientId}`);
    const [list] = listCalls();
    expect(list!.query.get('select')).not.toContain('cnp');
    expect(list!.query.get('select')).toContain('portal_state');
    expect(list!.query.get('client_id')).toBe(`eq.${clientId}`);
    expect(list!.query.get('archived_at')).toBe('is.null');
    expect(list!.query.get('status')).toBe('neq.terminated');
    expect(list!.query.get('order')).toBe('last_name.asc,first_name.asc,id.asc');
    expect(list!.query.get('offset')).toBe('0');
    expect(list!.query.get('limit')).toBe('25');
    expect(list!.headers.get('Authorization')).toBe('Bearer test-access-token');
    expect(list!.headers.get('Prefer')).toContain('count=exact');
    expect(countQueries()).toHaveLength(0);
    const { url: trainingUrl } = callsTo('/rest/v1/employee_training_status')[0]!;
    expect(trainingUrl.searchParams.get('employee_id')).toBe(`in.(${employeeRow.id})`);
  });

  it('reads no statuses for an empty page', async () => {
    mockUpstream({
      list: () => Response.json([], { headers: { 'Content-Range': '*/0' } }),
    });
    const response = await request(employeesPath);
    expect(await response.json()).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      unfilteredTotal: 0,
    });
    expect(callsTo('/rest/v1/employee_training_status')).toHaveLength(0);
  });

  it('pages by offset and limit', async () => {
    mockUpstream({
      list: () => Response.json([employeeViewRow], { headers: { 'Content-Range': '25-25/26' } }),
    });
    const response = await request(`${employeesPath}?page=2&pageSize=25`);
    expect(response.status).toBe(200);
    expect(employeeListResponseSchema.parse(await response.json())).toMatchObject({
      page: 2,
      pageSize: 25,
      total: 26,
    });
    const query = listQuery();
    expect(query.get('offset')).toBe('25');
    expect(query.get('limit')).toBe('25');
  });

  it.each([
    ['sort=hiredAt&order=desc', 'hired_at.desc,last_name.desc,first_name.desc,id.asc'],
    [
      'sort=ssmTraining',
      'ssm_training_rank.asc.nullslast,ssm_training_due_on.asc.nullslast,last_name.asc,first_name.asc,id.asc',
    ],
    [
      'sort=ssmTraining&order=desc',
      'ssm_training_rank.desc.nullslast,ssm_training_due_on.desc.nullslast,last_name.desc,first_name.desc,id.asc',
    ],
    [
      'sort=suTraining',
      'su_training_rank.asc.nullslast,su_training_due_on.asc.nullslast,last_name.asc,first_name.asc,id.asc',
    ],
    ['sort=terminatedAt', 'terminated_at.asc.nullslast,last_name.asc,first_name.asc,id.asc'],
    ['sort=jobPosition', 'job_position_name.asc,last_name.asc,first_name.asc,id.asc'],
    ['sort=jobPosition&order=desc', 'job_position_name.desc,last_name.desc,first_name.desc,id.asc'],
    ['sort=portal', 'portal_rank.asc,last_name.asc,first_name.asc,id.asc'],
    ['sort=portal&order=desc', 'portal_rank.desc,last_name.desc,first_name.desc,id.asc'],
  ])(
    'orders the list for %s, those without a value last, by name and then id',
    async (search, order) => {
      mockUpstream({});
      expect((await request(`${employeesPath}?${search}`)).status).toBe(200);
      expect(listQuery().get('order')).toBe(order);
    }
  );

  it.each([
    'page=0',
    'pageSize=101',
    'sort=cnp',
    'order=sideways',
    'ssmTraining=expired',
    'test=failed',
    'attention=noCnp',
    'jobPosition=not-a-uuid',
    'status=fired',
  ])('rejects an invalid list parameter: %s', async (search) => {
    mockUpstream({});
    const response = await request(`${employeesPath}?${search}`);
    expect(response.status).toBe(400);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
    expect(callsTo('/rest/v1/employee_list')).toHaveLength(0);
  });

  it('filters by status when asked, and counts the tab alone', async () => {
    mockUpstream({});
    const response = await request(`${employeesPath}?status=terminated`);
    expect(response.status).toBe(200);
    expect(listQuery().get('status')).toBe('eq.terminated');
    expect(countQueries()).toHaveLength(0);
  });

  it('filters each domain by its own training states, "attention" being untrained or overdue', async () => {
    mockUpstream({});
    await request(`${employeesPath}?ssmTraining=attention&ssmTraining=due&suTraining=current`);
    const query = listQuery();
    expect(query.get('ssm_training_state')).toBe('in.(untrained,overdue,due)');
    expect(query.get('su_training_state')).toBe('in.(current)');
  });

  it('filters by test states in either domain, "passed" meaning both', async () => {
    mockUpstream({});
    await request(`${employeesPath}?test=passed&test=annual_due`);
    expect(listQuery().getAll('or')).toEqual([
      '(and(ssm_test_state.eq.passed,su_test_state.eq.passed),ssm_test_state.eq.annual_due,su_test_state.eq.annual_due)',
    ]);
  });

  it('keeps the employees with any of the needs asked for', async () => {
    mockUpstream({});
    await request(
      `${employeesPath}?attention=signaturesPending&attention=noPhone&attention=noEmail&attention=toTrain&attention=trainingDue`
    );
    expect(listQuery().getAll('or')).toEqual([
      '(signatures_pending_count.gt.0,phone.is.null,email.is.null,ssm_training_state.in.(untrained,overdue),su_training_state.in.(untrained,overdue),ssm_training_state.eq.due,su_training_state.eq.due)',
    ]);
  });

  it('filters by job positions and workplaces of the client', async () => {
    mockUpstream({});
    const otherPosition = '6e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b';
    await request(
      `${employeesPath}?jobPosition=${positionId}&jobPosition=${otherPosition}&workplace=${workplaceId}`
    );
    const query = listQuery();
    expect(query.get('job_position_id')).toBe(`in.(${positionId},${otherPosition})`);
    expect(query.getAll('or')).toEqual([`(workplace_id.in.(${workplaceId}))`]);
  });

  it('filters the employees without a workplace, alone or beside workplaces', async () => {
    mockUpstream({});
    await request(`${employeesPath}?workplace=none`);
    expect(listQuery().getAll('or')).toEqual(['(workplace_id.is.null)']);
    await request(`${employeesPath}?workplace=none&workplace=${workplaceId}`);
    expect(listQuery(1).getAll('or')).toEqual([
      `(workplace_id.is.null,workplace_id.in.(${workplaceId}))`,
    ]);
  });

  it('counts the tab without the search and the filters once either narrows the list', async () => {
    mockUpstream({
      list: (init) =>
        init?.method === 'HEAD'
          ? new Response(null, { headers: { 'Content-Range': '*/40' } })
          : Response.json([employeeViewRow], { headers: { 'Content-Range': '0-0/1' } }),
    });
    const response = await request(`${employeesPath}?q=pop&ssmTraining=overdue`);
    expect(employeeListResponseSchema.parse(await response.json())).toMatchObject({
      total: 1,
      unfilteredTotal: 40,
    });
    const [count] = countQueries();
    expect(count!.get('client_id')).toBe(`eq.${clientId}`);
    expect(count!.get('status')).toBe('neq.terminated');
    expect(count!.has('or')).toBe(false);
    expect(count!.has('ssm_training_state')).toBe(false);
  });

  it('rejects a malformed client id before touching the database', async () => {
    mockUpstream({});
    const response = await request('/clients/not-a-uuid/employees');
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await request(employeesPath);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
    expect(callsTo('/rest/v1/employee_list')).toHaveLength(0);
  });

  it('still lists employees of an archived client', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...activeClient, archived_at: '2026-01-01T00:00:00+00:00' }]),
    });
    expect((await request(employeesPath)).status).toBe(200);
  });

  it.each([
    ['an archived client', { ...activeClient, archived_at: '2026-01-01T00:00:00+00:00' }],
    ['a lead', { ...activeClient, stage: 'lead' }],
  ])(
    'refuses to filter or sort the employees of %s by a state they do not have',
    async (_, client) => {
      for (const search of [
        'ssmTraining=overdue',
        'suTraining=current',
        'test=pending',
        'attention=toTrain',
        'attention=trainingDue',
        'sort=ssmTraining',
        'sort=suTraining',
      ]) {
        mockUpstream({ clients: () => Response.json([client]) });
        const response = await request(`${employeesPath}?${search}`);
        expect(response.status).toBe(400);
        expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
      }
      expect(callsTo('/rest/v1/employee_list')).toHaveLength(0);
      mockUpstream({ clients: () => Response.json([client]) });
      const allowed = await request(
        `${employeesPath}?status=terminated&attention=noPhone&attention=signaturesPending&sort=hiredAt`
      );
      expect(allowed.status).toBe(200);
    }
  );

  describe('the standing on the portal', () => {
    const participantId = '88888888-0000-4000-8000-000000000001';
    const invitationId = '99999999-0000-4000-8000-000000000001';
    const standing = {
      portal_state: 'none',
      portal_since: null,
      portal_expires_at: null,
      portal_revoked_at: null,
      portal_channel: null,
      portal_address: null,
      portal_language: null,
      portal_participant_id: null,
      portal_invitation_id: null,
      portal_administrator: false,
    };
    const rowWith = (id: string, portal: Record<string, string | boolean | null>) => ({
      ...employeeViewRow,
      id,
      ...standing,
      ...portal,
    });

    it('carries each standing with the dates it shows and the ids its actions need', async () => {
      const ids = [
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000004',
      ];
      mockUpstream({
        list: () =>
          Response.json(
            [
              rowWith(ids[0]!, {
                portal_state: 'active',
                portal_since: '2026-10-10T09:00:00+00:00',
                portal_channel: 'email',
                portal_address: 'calin@example.ro',
                portal_language: 'en',
                portal_participant_id: participantId,
                portal_administrator: true,
              }),
              rowWith(ids[1]!, {
                portal_state: 'invited',
                portal_since: '2026-11-12T08:00:00+00:00',
                portal_expires_at: '2026-12-12T08:00:00+00:00',
                portal_channel: 'sms',
                portal_address: '+40752330417',
                portal_invitation_id: invitationId,
              }),
              rowWith(ids[2]!, {
                portal_state: 'expired',
                portal_since: '2026-10-02T08:00:00+00:00',
                portal_expires_at: '2026-11-01T08:00:00+00:00',
                portal_channel: 'email',
                portal_address: 'florin@example.ro',
                portal_invitation_id: invitationId,
              }),
              rowWith(ids[3]!, {
                portal_state: 'revoked',
                portal_since: '2026-10-01T08:00:00+00:00',
                portal_revoked_at: '2026-11-05T08:00:00+00:00',
                portal_channel: 'email',
                portal_address: 'gabriel@example.ro',
                portal_language: 'ro',
                portal_participant_id: participantId,
              }),
            ],
            { headers: { 'Content-Range': '0-3/4' } }
          ),
      });
      const response = await request(employeesPath);
      expect(response.status).toBe(200);
      const { items } = employeeListResponseSchema.parse(await response.json());
      expect(items.map((item) => item.portal)).toEqual([
        {
          ...noAccess,
          state: 'active',
          since: '2026-10-10T09:00:00.000Z',
          channel: 'email',
          address: 'calin@example.ro',
          language: 'en',
          participantId,
          administrator: true,
        },
        {
          ...noAccess,
          state: 'invited',
          since: '2026-11-12T08:00:00.000Z',
          expiresAt: '2026-12-12T08:00:00.000Z',
          resendableAt: '2026-11-12T08:10:00.000Z',
          channel: 'sms',
          address: '+40752330417',
          invitationId,
        },
        {
          ...noAccess,
          state: 'expired',
          since: '2026-10-02T08:00:00.000Z',
          expiresAt: '2026-11-01T08:00:00.000Z',
          resendableAt: '2026-10-02T08:10:00.000Z',
          channel: 'email',
          address: 'florin@example.ro',
          invitationId,
        },
        {
          ...noAccess,
          state: 'revoked',
          revokedAt: '2026-11-05T08:00:00.000Z',
          channel: 'email',
          address: 'gabriel@example.ro',
        },
      ]);
    });

    it('filters by the standing, and counts the tab without it', async () => {
      mockUpstream({
        list: (init) =>
          init?.method === 'HEAD'
            ? new Response(null, { headers: { 'Content-Range': '*/14' } })
            : Response.json([employeeViewRow], { headers: { 'Content-Range': '0-0/1' } }),
      });
      const response = await request(`${employeesPath}?portal=none&portal=revoked`);
      expect(employeeListResponseSchema.parse(await response.json())).toMatchObject({
        total: 1,
        unfilteredTotal: 14,
      });
      expect(listQuery().get('portal_state')).toBe('in.(none,revoked)');
      const [count] = countQueries();
      expect(count!.get('client_id')).toBe(`eq.${clientId}`);
      expect(count!.has('portal_state')).toBe(false);
    });

    it("filters and sorts an archived client's employees by it, whose access can still be revoked", async () => {
      mockUpstream({
        clients: () =>
          Response.json([{ ...activeClient, archived_at: '2026-01-01T00:00:00+00:00' }]),
      });
      const response = await request(`${employeesPath}?portal=active&sort=portal`);
      expect(response.status).toBe(200);
      expect(listQuery().get('portal_state')).toBe('in.(active)');
    });

    it('rejects a standing it does not know', async () => {
      mockUpstream({});
      const response = await request(`${employeesPath}?portal=pending`);
      expect(response.status).toBe(400);
      expect(callsTo('/rest/v1/employee_list')).toHaveLength(0);
    });
  });

  it('filters by the acknowledgement of SSM duties, which no state of a document matches', async () => {
    mockUpstream({
      list: (init) =>
        init?.method === 'HEAD'
          ? new Response(null, { headers: { 'Content-Range': '*/14' } })
          : Response.json([employeeViewRow], { headers: { 'Content-Range': '0-0/1' } }),
    });
    const response = await request(
      `${employeesPath}?dutiesAcknowledgement=sign_again&dutiesAcknowledgement=to_sign`
    );
    expect(response.status).toBe(200);
    expect(listQuery().get('duties_acknowledgement_state')).toBe('in.(sign_again,to_sign)');
    expect(countQueries()[0]!.has('duties_acknowledgement_state')).toBe(false);
    const rejected = await request(`${employeesPath}?dutiesAcknowledgement=not_issued`);
    expect(rejected.status).toBe(400);
  });

  it('requires a bearer token', async () => {
    mockUpstream({});
    const response = await request(employeesPath, {}, null);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects verified users without an organization membership', async () => {
    mockUpstream({ membership: () => Response.json([]) });
    const response = await request(employeesPath);
    expect(response.status).toBe(403);
    expect(callsTo('/rest/v1/employee_list')).toHaveLength(0);
  });
});

describe('GET /clients/{clientId}/employee-invitees', () => {
  const inviteesPath = `/clients/${clientId}/employee-invitees`;
  const inviteeQuery = () => {
    const { url, headers } = callsTo('/rest/v1/employee_list')[0]!;
    return { query: url.searchParams, headers };
  };
  const inviteeRow = (id: string, last: string, portal_state: string) => ({
    id,
    last_name: last,
    first_name: 'Ion',
    job_position_name: 'Zidar',
    email: null,
    phone: '+40721000000',
    portal_state,
  });

  it('lists every current employee the search and filters match, as invitees, with the total past the limit', async () => {
    mockUpstream({
      list: () =>
        Response.json(
          [
            inviteeRow('20000000-0000-4000-8000-000000000001', 'Activ', 'active'),
            inviteeRow('20000000-0000-4000-8000-000000000002', 'Invitat', 'invited'),
            inviteeRow('20000000-0000-4000-8000-000000000003', 'Expirat', 'expired'),
            inviteeRow('20000000-0000-4000-8000-000000000004', 'Revocat', 'revoked'),
            inviteeRow('20000000-0000-4000-8000-000000000005', 'Neinvitat', 'none'),
          ],
          { headers: { 'Content-Range': '0-4/1200' } }
        ),
    });
    const response = await request(
      `${inviteesPath}?portal=none&portal=revoked&jobPosition=${positionId}&workplace=${workplaceId}&q=Pop`
    );
    expect(response.status).toBe(200);
    const body = employeeInviteesResponseSchema.parse(await response.json());
    expect(body.total).toBe(1200);
    expect(body.items.map((item) => [item.lastName, item.portal, item.current])).toEqual([
      ['Activ', 'participant', true],
      ['Invitat', 'invited', true],
      ['Expirat', null, true],
      ['Revocat', null, true],
      ['Neinvitat', null, true],
    ]);
    expect(body.items[0]).toEqual({
      employeeId: '20000000-0000-4000-8000-000000000001',
      lastName: 'Activ',
      firstName: 'Ion',
      position: 'Zidar',
      email: null,
      phone: '+40721000000',
      current: true,
      portal: 'participant',
    });
    const { query, headers } = inviteeQuery();
    expect(query.get('select')).not.toContain('cnp');
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('status')).toBe('eq.active');
    expect(query.get('portal_state')).toBe('in.(none,revoked)');
    expect(query.get('job_position_id')).toBe(`in.(${positionId})`);
    expect(query.getAll('or')).toEqual([
      `(workplace_id.in.(${workplaceId}))`,
      '(search_name.ilike.*pop*,employee_number.ilike.*pop*)',
    ]);
    expect(query.get('order')).toBe('last_name.asc,first_name.asc,id.asc');
    expect(query.get('limit')).toBe('1000');
    expect(query.has('offset')).toBe(false);
    expect(headers.get('Authorization')).toBe('Bearer test-access-token');
    expect(headers.get('Prefer')).toContain('count=exact');
  });

  it('answers 404 for a client the organization does not see, before reading its employees', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await request(inviteesPath);
    expect(response.status).toBe(404);
    expect(callsTo('/rest/v1/employee_list')).toHaveLength(0);
  });

  it.each(['portal=pending', 'jobPosition=not-a-uuid', 'workplace=1', 'workplace=nowhere'])(
    'rejects an invalid filter: %s',
    async (search) => {
      mockUpstream({});
      const response = await request(`${inviteesPath}?${search}`);
      expect(response.status).toBe(400);
      expect(callsTo('/rest/v1/employee_list')).toHaveLength(0);
    }
  );

  it('requires a member of an organization', async () => {
    mockUpstream({ membership: () => Response.json([]) });
    expect((await request(inviteesPath)).status).toBe(403);
    mockUpstream({});
    expect((await request(inviteesPath, {}, null)).status).toBe(401);
    expect(callsTo('/rest/v1/employee_list')).toHaveLength(0);
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
    residenceAddress: 'Str. Florilor 9, Florești',
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

  it('passes on the refusal of the database a month after the employees passed the step', async () => {
    mockUpstream({
      employees: () =>
        Response.json(
          { code: 'STP01', message: 'Over the step of employees for a month.' },
          { status: 400 }
        ),
    });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('employees_over_step');
  });

  it('answers the post with whether it is archived', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow, { status: 201 }) });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(201);
    const { employee } = employeeResponseSchema.parse(await response.json());
    expect(employee.jobPosition).toEqual({
      id: positionId,
      name: 'Sudor autorizat',
      archived: false,
    });
    expect(callsTo('/rest/v1/employees')).toHaveLength(1);
  });

  it('reads the employee again when the post the database created is missing from the insert', async () => {
    mockUpstream({
      employees: (init) =>
        init?.method === 'POST'
          ? Response.json({ ...employeeRow, job_positions: null }, { status: 201 })
          : Response.json(employeeRow),
    });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(201);
    const { employee } = employeeResponseSchema.parse(await response.json());
    expect(employee.jobPosition).toEqual({
      id: positionId,
      name: 'Sudor autorizat',
      archived: false,
    });
    const [, read] = callsTo('/rest/v1/employees');
    expect(read!.init?.method ?? 'GET').toBe('GET');
    expect(read!.url.searchParams.get('id')).toBe(`eq.${employeeRow.id}`);
    expect(read!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('stores the digits-only CNP, lowercases the email, writes the phone in E.164, and scopes to the membership', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow, { status: 201 }) });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(201);
    const { employee } = employeeResponseSchema.parse(await response.json());
    expect(employee.cnp).toBe('1900101400127');
    expect(employee.bloodGroup).toBe('A(II)');
    const { init } = callsTo('/rest/v1/employees')[0]!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      organization_id: testOrganizationId,
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
      residence_address: 'Str. Florilor 9, Florești',
      blood_group: 'A(II)',
      rh_factor: '+',
      notes: null,
      workplace_id: null,
      qualification: null,
      education: null,
      authorizations: null,
      commute_route: null,
      commute_means: [],
      commute_means_other: null,
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
    expect(callsTo('/rest/v1/employees')[0]!.body).toMatchObject({
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
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
    expect(callsTo('/rest/v1/employees')).toHaveLength(0);
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(404);
    expect(callsTo('/rest/v1/employees')).toHaveLength(0);
  });

  it('refuses to add employees to an archived client', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...activeClient, archived_at: '2026-01-01T00:00:00+00:00' }]),
    });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
    expect(callsTo('/rest/v1/employees')).toHaveLength(0);
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
    expect(error.reason).toBe('employee_cnp_taken');
  });

  it('gives a taken employee number its own reason', async () => {
    mockUpstream({
      employees: () =>
        Response.json(
          {
            code: '23505',
            message:
              'duplicate key value violates unique constraint "employees_client_employee_number_key"',
          },
          { status: 409 }
        ),
    });
    const response = await postEmployee(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'employee_number_taken'
    );
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
    const response = await postEmployee({ lastName: 'A' }, employeesPath, null);
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
      residenceAddress: 'Str. Florilor 9, Florești',
      rhFactor: '+',
      archivedAt: null,
      jobPosition: { id: positionId, name: 'Sudor autorizat', archived: false },
    });
    const { url } = callsTo('/rest/v1/employees')[0]!;
    const query = url.searchParams;
    expect(query.get('id')).toBe(`eq.${employeeRow.id}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
    expect(query.get('select')).toContain('cnp');
  });

  it('says when the post the person fills is archived', async () => {
    mockUpstream({
      employees: () =>
        Response.json([
          {
            ...employeeRow,
            job_positions: {
              ...employeeRow.job_positions,
              archived_at: '2026-11-01T10:00:00+00:00',
            },
          },
        ]),
    });

    const { employee } = employeeResponseSchema.parse(await (await request(employeePath)).json());

    expect(employee.jobPosition.archived).toBe(true);
    const select = callsTo('/rest/v1/employees')[0]!.url.searchParams.get('select');
    expect(select).toContain('job_positions(id,name,archived_at)');
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
    expect(callsTo('/rest/v1/employees')).toHaveLength(0);
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
    const patch = callsTo('/rest/v1/employees').find((call) => call.method === 'PATCH')!;
    expect(patch.body).toEqual({
      status: 'terminated',
      terminated_at: '2026-09-10',
    });
    const query = patch.url.searchParams;
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
    const patch = callsTo('/rest/v1/employees').find((call) => call.method === 'PATCH')!;
    expect(patch.body).toEqual({ status: 'active', terminated_at: null });
  });

  it('refuses to reactivate a month after the employees passed the step', async () => {
    mockUpstream({
      employees: (init) =>
        init?.method === 'PATCH'
          ? Response.json(
              { code: 'STP01', message: 'Over the step of employees for a month.' },
              { status: 400 }
            )
          : Response.json([{ id: employeeRow.id, hired_at: employeeRow.hired_at }]),
    });
    const response = await patchStatus({ status: 'active' });
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('employees_over_step');
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
    expect(error.reason).toBe('employee_cnp_taken');
  });

  it('rejects a leave date before the hire date with a field issue', async () => {
    mockUpstream({
      employees: () => Response.json([{ id: employeeRow.id, hired_at: employeeRow.hired_at }]),
    });
    const response = await patchStatus({ status: 'terminated', terminatedAt: '2019-12-31' });
    expect(response.status).toBe(400);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.issues?.map((issue) => issue.path)).toEqual(['terminatedAt']);
    expect(callsTo('/rest/v1/employees').some((call) => call.method === 'PATCH')).toBe(false);
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
    expect(callsTo('/rest/v1/employees')).toHaveLength(0);
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
    callsTo('/rest/v1/employees').find((call) => call.method === 'PATCH')!.body as Record<
      string,
      unknown
    >;

  it('passes on the refusal of the database for an archived client', async () => {
    mockUpstream({
      employees: (init) =>
        init?.method === 'PATCH'
          ? Response.json(
              { code: 'CLA01', message: 'An archived client is not changed.' },
              { status: 400 }
            )
          : Response.json(employeeRow),
    });
    const response = await put(body);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });

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
      residence_address: null,
      blood_group: null,
      rh_factor: null,
      notes: null,
      qualification: null,
      education: null,
      authorizations: null,
      commute_route: null,
      commute_means: [],
      commute_means_other: null,
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
    expect(apiErrorResponseSchema.parse(await taken.json())).toMatchObject({
      message: expect.stringContaining('CNP'),
      reason: 'employee_cnp_taken',
    });
  });

  it('answers 404 for an employee of another client', async () => {
    mockUpstream({ employees: () => Response.json(null) });
    expect((await put(body)).status).toBe(404);
  });
});

describe('job positions on employees (ADR 006)', () => {
  const employeePath = `${employeesPath}/${employeeRow.id}`;
  const sentToEmployees = (index = 0) =>
    callsTo('/rest/v1/employees').filter((call) => call.method !== 'GET')[index]!.body as Record<
      string,
      unknown
    >;
  const body = { lastName: 'Popescu', firstName: 'Ion', jobTitle: 'Sudor', hiredAt: '2020-03-01' };

  it('leaves the position to the database when the form names none', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow) });
    const response = await postEmployee(body);
    expect(response.status).toBe(201);
    expect(employeeResponseSchema.parse(await response.json()).employee.jobPosition.name).toBe(
      'Sudor autorizat'
    );
    expect(sentToEmployees()).not.toHaveProperty('job_position_id');
    expect(callsTo('/rest/v1/job_positions')).toHaveLength(0);
  });

  it('puts the employee in the chosen position, once it is one of this client', async () => {
    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await postEmployee({ ...body, jobPositionId: positionId })).status).toBe(201);
    expect(sentToEmployees().job_position_id).toBe(positionId);
    const lookup = callsTo('/rest/v1/job_positions')[0]!.url.searchParams;
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
    commuteMeans: ['public_transport', 'on_foot', 'public_transport'],
    commuteMeansOther: ' Trotineta firmei ',
    commuteMinutes: 35,
  };
  const sent = (method: 'POST' | 'PATCH') =>
    callsTo('/rest/v1/employees')
      .filter((call) => call.method === method)
      .at(-1)!.body as Record<string, unknown>;
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
      commute_means: ['on_foot', 'public_transport'],
      commute_means_other: 'Trotineta firmei',
      commute_minutes: 35,
    };
    mockUpstream({
      employees: () => Response.json(row, { status: 201 }),
      workplaces: () => Response.json({ id: workplaceId, office_has_activity: true }),
    });
    const response = await postEmployee(sheetBody);
    expect(response.status).toBe(201);
    expect(sent('POST')).toMatchObject({
      workplace_id: workplaceId,
      qualification: 'Sudor autorizat',
      education: 'Școala profesională',
      authorizations: 'ISCIR',
      commute_route: 'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24',
      commute_means: ['on_foot', 'public_transport'],
      commute_means_other: 'Trotineta firmei',
      commute_minutes: 35,
    });
    const lookup = callsTo('/rest/v1/client_workplaces')[0]!.url.searchParams;
    expect([lookup.get('id'), lookup.get('client_id'), lookup.get('archived_at')]).toEqual([
      `eq.${workplaceId}`,
      `eq.${clientId}`,
      'is.null',
    ]);
    expect(employeeResponseSchema.parse(await response.json()).employee).toMatchObject({
      workplace: { id: workplaceId, name: 'Punct de lucru Str. Fabricii 3' },
      qualification: 'Sudor autorizat',
      commuteRoute: 'Str. Lungă 5 – Str. Fabricii 3, cu autobuzul 24',
      commuteMeans: ['on_foot', 'public_transport'],
      commuteMeansOther: 'Trotineta firmei',
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
    expect(callsTo('/rest/v1/employees')).toHaveLength(0);

    mockUpstream({
      employees: () => Response.json(employeeRow),
      workplaces: () => Response.json(null),
    });
    const updated = await put(sheetBody);
    expect(updated.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await updated.json()).issues?.[0]?.path).toBe(
      'workplaceId'
    );
    expect(callsTo('/rest/v1/employees').some((call) => call.method === 'PATCH')).toBe(false);
  });

  it('puts a new employee at the only active workplace of the client', async () => {
    mockUpstream({
      employees: () => Response.json(employeeRow, { status: 201 }),
      workplaces: () => Response.json([{ id: workplaceId }]),
    });
    expect((await postEmployee(body)).status).toBe(201);
    expect(sent('POST').workplace_id).toBe(workplaceId);
    const lookup = callsTo('/rest/v1/client_workplaces')[0]!.url.searchParams;
    expect([
      lookup.get('client_id'),
      lookup.get('office_has_activity'),
      lookup.get('archived_at'),
      lookup.get('limit'),
    ]).toEqual([`eq.${clientId}`, 'eq.true', 'is.null', '2']);
  });

  it('refuses a registered office where no activity takes place (ADR 041)', async () => {
    mockUpstream({
      workplaces: () => Response.json({ id: workplaceId, office_has_activity: false }),
    });
    for (const response of [await postEmployee(sheetBody), await put(sheetBody)]) {
      expect(response.status).toBe(400);
      expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
        'workplaceId'
      );
    }
    expect(callsTo('/rest/v1/employees').some((call) => call.method !== 'GET')).toBe(false);
  });

  it('leaves a new employee without a workplace when the body clears it, even at a client with one', async () => {
    mockUpstream({
      employees: () => Response.json(employeeRow, { status: 201 }),
      workplaces: () => Response.json([{ id: workplaceId }]),
    });
    expect((await postEmployee({ ...body, workplaceId: null })).status).toBe(201);
    expect(sent('POST').workplace_id).toBeNull();
    expect(callsTo('/rest/v1/client_workplaces')).toHaveLength(0);
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
    expect(callsTo('/rest/v1/client_workplaces')).toHaveLength(0);

    mockUpstream({ employees: () => Response.json(employeeRow) });
    expect((await put({ ...body, workplaceId: null })).status).toBe(200);
    expect(sent('PATCH').workplace_id).toBeNull();

    mockUpstream({
      employees: () => Response.json(employeeRow),
      workplaces: () => Response.json({ id: workplaceId, office_has_activity: true }),
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
    expect(callsTo('/rest/v1/employees')).toHaveLength(0);
  });
});

describe('the employment contract number', () => {
  const body = { lastName: 'Popescu', firstName: 'Ion', jobTitle: 'Sudor', hiredAt: '2020-03-01' };
  const sent = (method: 'POST' | 'PATCH') =>
    callsTo('/rest/v1/employees')
      .filter((call) => call.method === method)
      .at(-1)!.body as Record<string, unknown>;

  it('is stored trimmed, read with the full record and returned', async () => {
    mockUpstream({
      employees: () =>
        Response.json({ ...employeeRow, contract_number: '118/2020' }, { status: 201 }),
    });
    const response = await postEmployee({ ...body, contractNumber: ' 118/2020 ' });
    expect(response.status).toBe(201);
    expect(sent('POST').contract_number).toBe('118/2020');
    const select = callsTo('/rest/v1/employees')[0]!.url.searchParams.get('select');
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
      expect(callsTo('/rest/v1/employees')).toHaveLength(0);
    }
  );
});
