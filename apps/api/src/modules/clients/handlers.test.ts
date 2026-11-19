import {
  apiErrorResponseSchema,
  clientListResponseSchema,
  clientOwnerNotesResponseSchema,
  clientResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import { accessTokenAt } from '../../lib/access-token.fixture';
import type { ApiEnv } from '../../lib/env';
import { openApiConfig } from '../../lib/openapi';
import { apiRequest, testAccessToken } from '../../test/request';
import {
  callsTo,
  fetchMock,
  membershipRow,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
  testEnv,
  testSecretKey,
  testUser as user,
  type UpstreamCall,
  upstreamCalls,
} from '../../test/upstream';

const env = testEnv({
  SUPABASE_SECRET_KEY: testSecretKey,
  CORS_ORIGINS: 'http://localhost:5173, https://app.ssmusor.ro',
});

const membership = membershipRow({ role: 'owner' });

const clientRow = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  legal_name: 'OMV PETROM SA',
  cui: '1590082',
  vat_payer: true,
  caen_code: '0610',
  trade_register_number: 'J1997008302407',
  county_code: 'B',
  locality: 'Sector 1 Mun. București',
  address_line: 'Str. Coralilor, nr. 22',
  legal_representative_name: null,
  declared_employee_count: 120,
  current_employee_count: 8,
  stage: 'client',
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  promoted_at: null,
  created_at: '2026-09-17T10:00:00+00:00',
  updated_at: '2026-09-17T10:00:00+00:00',
  archived_at: null,
};

const leadRow = {
  ...clientRow,
  stage: 'lead',
  current_employee_count: 0,
  service_contract_state: 'none',
  service_contract_state_at: null,
  service_contract_return_expires_at: null,
};

const workRow = {
  client_since: '2026-09-17T10:00:00+00:00',
  documentation_issued_count: 18,
  documentation_total_count: 22,
  documentation_state: 'in_progress',
  documentation_last_generated_at: '2026-09-20T10:00:00+00:00',
  fire_safety_issued_count: 0,
  fire_safety_total_count: 22,
  fire_safety_state: 'none',
  fire_safety_last_generated_at: null,
  training_employee_count: 8,
  training_untrained_count: 2,
  training_overdue_count: 1,
  training_due_count: 3,
  training_attention_count: 3,
  next_training_due_on: '2026-11-20',
};

type Handler = (call: UpstreamCall) => Response | Promise<Response>;

function mockUpstream(
  handlers: Partial<
    Record<
      | 'auth'
      | 'membership'
      | 'clients'
      | 'notes'
      | 'participants'
      | 'invitations'
      | 'deleteClient'
      | 'storage',
      Handler
    >
  >
) {
  const clients = (call: UpstreamCall) =>
    handlers.clients?.(call) ??
    Response.json([clientRow], { headers: { 'Content-Range': '0-0/1' } });
  const storage = (call: UpstreamCall) => handlers.storage?.(call) ?? [];
  mockSignedInUpstream({
    '/auth/v1/user': (call) => handlers.auth?.(call) ?? user,
    '/rest/v1/rpc/current_membership': (call) => handlers.membership?.(call) ?? [membership],
    '/rest/v1/clients': clients,
    '/rest/v1/client_list': clients,
    '/rest/v1/lead_list': clients,
    '/rest/v1/client_owner_notes': (call) => handlers.notes?.(call) ?? [],
    '/rest/v1/client_participants': (call) => handlers.participants?.(call) ?? [],
    '/rest/v1/participant_invitations': (call) => handlers.invitations?.(call) ?? [],
    '/rest/v1/rpc/delete_archived_client': (call) => handlers.deleteClient?.(call) ?? [],
    '/storage/v1/object/documents': storage,
    '/storage/v1/object/client-files': storage,
  });
}

const request = (
  path: string,
  init: RequestInit = {},
  token: string | null = testAccessToken,
  bindings: ApiEnv['Bindings'] = env
) => apiRequest(path, { ...init, token }, bindings);

const postClient = (body: unknown, token?: string | null) =>
  request(
    '/clients',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    token
  );

stubFetch();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /clients', () => {
  it('lists active clients of the effective organization as the verified user', async () => {
    mockUpstream({
      clients: () =>
        Response.json([{ ...clientRow, ...workRow }], { headers: { 'Content-Range': '0-0/1' } }),
    });
    const response = await request('/clients');
    expect(response.status).toBe(200);
    expect(clientListResponseSchema.parse(await response.json())).toEqual({
      page: 1,
      pageSize: 25,
      total: 1,
      items: [
        {
          id: clientRow.id,
          legalName: 'OMV PETROM SA',
          cui: '1590082',
          vatPayer: true,
          caenCode: '0610',
          tradeRegisterNumber: 'J1997008302407',
          countyCode: 'B',
          locality: 'Sector 1 Mun. București',
          addressLine: 'Str. Coralilor, nr. 22',
          legalRepresentativeName: null,
          declaredEmployeeCount: 120,
          currentEmployeeCount: 8,
          stage: 'client',
          contactName: null,
          contactEmail: null,
          contactPhone: null,
          promotedAt: null,
          serviceContractState: null,
          createdAt: clientRow.created_at,
          updatedAt: clientRow.updated_at,
          archivedAt: null,
          canDelete: false,
          serviceContractStateAt: null,
          serviceContractReturnExpiresAt: null,
          clientSince: '2026-09-17T10:00:00+00:00',
          documentation: {
            state: 'in_progress',
            issuedCount: 18,
            totalCount: 22,
            lastGeneratedAt: '2026-09-20T10:00:00+00:00',
          },
          fireSafetyDocumentation: {
            state: 'none',
            issuedCount: 0,
            totalCount: 22,
            lastGeneratedAt: null,
          },
          training: {
            employeeCount: 8,
            untrainedCount: 2,
            overdueCount: 1,
            dueCount: 3,
            attentionCount: 3,
            nextDueOn: '2026-11-20',
          },
        },
      ],
      unfilteredTotal: 1,
    });
    const { url: rpcUrl, init: rpcInit } = callsTo('/rest/v1/rpc/current_membership')[0]!;
    expect(rpcUrl.origin).toBe('https://example.supabase.co');
    expect(new Headers(rpcInit?.headers).get('Authorization')).toBe(`Bearer ${testAccessToken}`);
    expect(new Headers(rpcInit?.headers).get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY);
    const { url: listUrl, init: listInit } = callsTo('/rest/v1/client_list')[0]!;
    const query = listUrl.searchParams;
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('stage')).toBe('eq.client');
    expect(query.get('order')).toBe('legal_name.asc,id.asc');
    expect(query.get('offset')).toBe('0');
    expect(query.get('limit')).toBe('25');
    const headers = new Headers(listInit?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${testAccessToken}`);
    expect(headers.get('Prefer')).toContain('count=exact');
    expect(listInit?.signal).toBeInstanceOf(AbortSignal);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('pages and sorts by one whitelisted key with a stable tiebreaker', async () => {
    mockUpstream({
      clients: () => Response.json([clientRow], { headers: { 'Content-Range': '25-25/26' } }),
    });
    const response = await request('/clients?page=2&sort=currentEmployeeCount&order=desc');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ page: 2, pageSize: 25, total: 26 });
    const { url: listUrl } = callsTo('/rest/v1/client_list')[0]!;
    const query = listUrl.searchParams;
    expect(query.get('order')).toBe('current_employee_count.desc,legal_name.desc,id.asc');
    expect(query.get('offset')).toBe('25');
  });

  it.each([
    [
      'documentation',
      'asc',
      'documentation_state.asc,documentation_issued_count.asc,legal_name.asc,id.asc',
    ],
    [
      'fireSafetyDocumentation',
      'desc',
      'fire_safety_state.desc,fire_safety_issued_count.desc,legal_name.desc,id.asc',
    ],
    ['training', 'asc', 'training_rank.asc,training_flagged_count.desc,legal_name.asc,id.asc'],
    ['training', 'desc', 'training_rank.desc,training_flagged_count.asc,legal_name.desc,id.asc'],
    ['nextTrainingDueOn', 'asc', 'next_training_due_on.asc.nullslast,legal_name.asc,id.asc'],
    ['nextTrainingDueOn', 'desc', 'next_training_due_on.desc.nullslast,legal_name.desc,id.asc'],
    ['clientSince', 'desc', 'client_since.desc,id.asc'],
  ])('sorts by %s %s through the computed fields', async (sort, order, expected) => {
    mockUpstream({});
    expect((await request(`/clients?sort=${sort}&order=${order}`)).status).toBe(200);
    const { url: listUrl } = callsTo('/rest/v1/client_list')[0]!;
    expect(listUrl.searchParams.get('order')).toBe(expected);
  });

  const itemOf = async (row: Record<string, unknown>) => {
    mockUpstream({
      clients: () =>
        Response.json([{ ...clientRow, ...workRow, ...row }], {
          headers: { 'Content-Range': '0-0/1' },
        }),
    });
    const body = clientListResponseSchema.parse(await (await request('/clients')).json());
    return body.items[0]!;
  };

  it('keeps the two sets apart, as the list counts them', async () => {
    const item = await itemOf({
      documentation_state: 'none',
      documentation_issued_count: 0,
      documentation_total_count: 22,
      fire_safety_state: 'issued',
      fire_safety_issued_count: 28,
      fire_safety_total_count: 28,
    });
    expect(item.documentation).toMatchObject({ state: 'none', totalCount: 22 });
    expect(item.fireSafetyDocumentation).toMatchObject({ state: 'issued', totalCount: 28 });
  });

  it('reads no participants: the list counts the signing annex itself', async () => {
    await itemOf({});
    expect(callsTo('/rest/v1/client_participants')).toHaveLength(0);
    expect(callsTo('/rest/v1/participant_invitations')).toHaveLength(0);
  });

  it('matches every search term in the name, CUI and locality, without legal forms or RO', async () => {
    mockUpstream({});
    await request(`/clients?q=${encodeURIComponent('S.C. Alfa Bacău RO1590082 S.R.L.')}`);
    await request(`/clients?q=${encodeURIComponent('RO 15 900 82')}`);
    const [named, cui] = callsTo('/rest/v1/client_list').map(({ url }) => url.searchParams);
    expect(named!.getAll('search_text')).toEqual([
      'ilike.*alfa*',
      'ilike.*bacau*',
      'ilike.*1590082*',
    ]);
    expect(cui!.getAll('search_text')).toEqual(['ilike.*1590082*']);
  });

  it('searches the leads by the same text, and never by their contact', async () => {
    mockUpstream({});
    await request('/clients?stage=lead&q=alfa');
    const query = callsTo('/rest/v1/lead_list')[0]!.url.searchParams;
    expect(query.get('search_text')).toBe('ilike.*alfa*');
    expect([...query.keys()].some((key) => key.startsWith('contact_'))).toBe(false);
  });

  it('filters by any value of one filter and by every filter', async () => {
    mockUpstream({});
    const response = await request(
      '/clients?documentation=none&documentation=in_progress&fireSafetyDocumentation=issued&training=untrained&training=current&attention=documentsBehind&attention=missingBasicData&attention=signaturesPending&attention=testsPending&county=CJ&county=BH&contract=endingWithin60Days'
    );
    expect(response.status).toBe(200);
    const query = callsTo('/rest/v1/client_list')[0]!.url.searchParams;
    expect(query.get('documentation_state')).toBe('in.(none,in_progress)');
    expect(query.get('fire_safety_state')).toBe('in.(issued)');
    expect(query.getAll('or')).toEqual([
      '(training_untrained_count.gt.0,training_rank.eq.2)',
      '(documents_behind.is.true,missing_basic_data.is.true,signatures_pending_count.gt.0,tests_pending_count.gt.0)',
    ]);
    expect(query.get('county_code')).toBe('in.(CJ,BH)');
    expect(query.get('contract_ending_within_60_days')).toBe('eq.true');
    const select = query.get('select')!;
    expect(select).not.toContain('documents_behind');
    expect(select).not.toContain('contract_ending_within_60_days');
  });

  it('counts the whole list beside the filtered one', async () => {
    mockUpstream({
      clients: ({ method }) =>
        method === 'HEAD'
          ? new Response(null, { headers: { 'Content-Range': '*/80' } })
          : Response.json([{ ...clientRow, ...workRow }], {
              headers: { 'Content-Range': '0-0/1' },
            }),
    });
    const response = await request('/clients?county=CJ');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, unfilteredTotal: 80 });
    const { url: countUrl, init: countInit } = callsTo('/rest/v1/clients')[0]!;
    const count = countUrl.searchParams;
    expect(countInit?.method).toBe('HEAD');
    expect(count.get('stage')).toBe('eq.client');
    expect(count.get('archived_at')).toBe('is.null');
    expect(count.get('county_code')).toBeNull();
  });

  it('filters clients only, and by contract only for an owner', async () => {
    mockUpstream({});
    expect((await request('/clients?stage=lead&county=CJ')).status).toBe(400);
    expect((await request('/clients?stage=lead&contract=endingWithin60Days')).status).toBe(400);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
    expect(callsTo('/rest/v1/lead_list')).toHaveLength(0);

    fetchMock.mockClear();
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    const refused = await request('/clients?contract=endingWithin60Days');
    expect(refused.status).toBe(403);
    expect(callsTo('/rest/v1/client_list')).toHaveLength(0);
    expect((await request('/clients?county=CJ&training=due')).status).toBe(200);
  });

  it.each(['county=XX', 'training=late', 'documentation=done', 'attention=everything'])(
    'rejects an unknown filter value: %s',
    async (search) => {
      mockUpstream({});
      expect((await request(`/clients?${search}`)).status).toBe(400);
      expect(callsTo('/rest/v1/client_list')).toHaveLength(0);
    }
  );

  it('answers a page past the end with no rows and the real total', async () => {
    let call = 0;
    mockUpstream({
      clients: () =>
        call++ === 0
          ? Response.json(
              { code: 'PGRST103', message: 'Requested range not satisfiable' },
              { status: 416 }
            )
          : Response.json([clientRow], { headers: { 'Content-Range': '0-0/3' } }),
    });
    const response = await request('/clients?page=9');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      page: 9,
      pageSize: 25,
      total: 3,
      unfilteredTotal: 3,
    });
    expect(callsTo('/rest/v1/client_list')).toHaveLength(2);
    const { url: recountUrl, init: recountInit } = callsTo('/rest/v1/client_list')[1]!;
    expect(recountInit?.method).toBe('HEAD');
    expect(recountUrl.searchParams.get('select')).toBe('id');
  });

  it.each([
    'training',
    'nextTrainingDueOn',
    'documentation',
    'fireSafetyDocumentation',
    'clientSince',
    'currentEmployeeCount',
  ])('refuses to sort leads by %s, which only a client has', async (sort) => {
    mockUpstream({});
    expect((await request(`/clients?stage=lead&sort=${sort}`)).status).toBe(400);
    expect(callsTo('/rest/v1/lead_list')).toHaveLength(0);
  });

  it.each(['declaredEmployeeCount', 'serviceContractState', 'createdAt'])(
    'refuses to sort clients by %s, which only a lead has',
    async (sort) => {
      mockUpstream({});
      expect((await request(`/clients?sort=${sort}`)).status).toBe(400);
      expect(callsTo('/rest/v1/client_list')).toHaveLength(0);
    }
  );

  it.each([
    ['legalName', 'asc', 'legal_name.asc,id.asc'],
    ['cui', 'desc', 'cui.desc,id.asc'],
    [
      'declaredEmployeeCount',
      'desc',
      'declared_employee_count.desc.nullslast,legal_name.desc,id.asc',
    ],
    [
      'serviceContractState',
      'asc',
      'service_contract_state.asc,service_contract_state_at.asc,legal_name.asc,id.asc',
    ],
    [
      'serviceContractState',
      'desc',
      'service_contract_state.desc,service_contract_state_at.asc,legal_name.desc,id.asc',
    ],
    ['createdAt', 'desc', 'created_at.desc,id.asc'],
  ])('sorts leads by %s %s', async (sort, order, expected) => {
    mockUpstream({});
    expect((await request(`/clients?stage=lead&sort=${sort}&order=${order}`)).status).toBe(200);
    const { url: listUrl } = callsTo('/rest/v1/lead_list')[0]!;
    expect(listUrl.searchParams.get('order')).toBe(expected);
  });

  it('filters the leads by any of the contract states chosen, and only the leads', async () => {
    mockUpstream({
      clients: ({ method }) =>
        method === 'HEAD'
          ? new Response(null, { headers: { 'Content-Range': '*/18' } })
          : Response.json([{ ...leadRow, service_contract_state: 'sent' }], {
              headers: { 'Content-Range': '0-0/1' },
            }),
    });
    const response = await request(
      '/clients?stage=lead&contractState=sent&contractState=received&q=alfa'
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, unfilteredTotal: 18 });
    const query = callsTo('/rest/v1/lead_list')[0]!.url.searchParams;
    expect(query.get('service_contract_state')).toBe('in.(sent,received)');
    expect(query.get('search_text')).toBe('ilike.*alfa*');
    expect(query.get('archived_at')).toBe('is.null');
    const { url: countUrl } = callsTo('/rest/v1/clients')[0]!;
    const count = countUrl.searchParams;
    expect(count.get('stage')).toBe('eq.lead');
    expect(count.get('service_contract_state')).toBeNull();

    fetchMock.mockClear();
    mockUpstream({});
    expect((await request('/clients?contractState=sent')).status).toBe(400);
    expect((await request('/clients?stage=lead&contractState=refused')).status).toBe(400);
    expect(callsTo('/rest/v1/client_list')).toHaveLength(0);
    expect(callsTo('/rest/v1/lead_list')).toHaveLength(0);
  });

  it('counts the filtered leads again for a page past the end', async () => {
    mockUpstream({
      clients: ({ method, url }) =>
        method !== 'HEAD'
          ? Response.json(
              { code: 'PGRST103', message: 'Requested range not satisfiable' },
              { status: 416 }
            )
          : new Response(null, {
              headers: { 'Content-Range': url.pathname === '/rest/v1/clients' ? '*/18' : '*/4' },
            }),
    });
    const response = await request('/clients?stage=lead&page=3&contractState=signed');
    expect(await response.json()).toMatchObject({ items: [], total: 4, unfilteredTotal: 18 });
    const { url: recountUrl, init: recountInit } = callsTo('/rest/v1/lead_list')[1]!;
    const recount = recountUrl.searchParams;
    expect(recountInit?.method).toBe('HEAD');
    expect(recount.get('select')).toBe('id');
    expect(recount.get('service_contract_state')).toBe('in.(signed)');
  });

  it('reads no contract for a client', async () => {
    mockUpstream({});
    await request('/clients');
    const select = callsTo('/rest/v1/client_list')[0]!.url.searchParams.get('select');
    expect(select).toContain('fire_safety_issued_count');
    expect(select).toContain('training_attention_count');
    expect(select).not.toContain('client_documents');
  });

  it('leaves the work columns out of the leads', async () => {
    mockUpstream({
      clients: () => Response.json([leadRow], { headers: { 'Content-Range': '0-0/1' } }),
    });
    const body = clientListResponseSchema.parse(
      await (await request('/clients?stage=lead')).json()
    );
    expect(callsTo('/rest/v1/lead_list')[0]!.url.searchParams.get('select')).not.toContain(
      'documentation_issued_count'
    );
    expect(body.items[0]).toMatchObject({
      serviceContractState: 'none',
      serviceContractStateAt: null,
      serviceContractReturnExpiresAt: null,
      clientSince: null,
      documentation: null,
      fireSafetyDocumentation: null,
      training: null,
    });
  });

  it.each(['page=0', 'pageSize=101', 'sort=cnp', 'order=up'])(
    'rejects an invalid list parameter: %s',
    async (search) => {
      mockUpstream({});
      expect((await request(`/clients?${search}`)).status).toBe(400);
      expect(callsTo('/rest/v1/clients')).toHaveLength(0);
      expect(callsTo('/rest/v1/client_list')).toHaveLength(0);
    }
  );

  it('lists the archived clients instead when asked', async () => {
    mockUpstream({});
    expect((await request('/clients?status=archived')).status).toBe(200);
    const { url } = callsTo('/rest/v1/client_list')[0]!;
    expect(url.searchParams.get('archived_at')).toBe('not.is.null');
    expect((await request('/clients?status=all')).status).toBe(400);
  });

  it.each([
    ['outside production', undefined, true],
    ['in production', 'production', false],
  ])(
    'says on each archived row whether the caller may delete it %s',
    async (_, environment, canDelete) => {
      mockUpstream({
        clients: () =>
          Response.json([{ ...clientRow, ...workRow, archived_at: '2026-01-01T00:00:00+00:00' }], {
            headers: { 'Content-Range': '0-0/1' },
          }),
      });
      const response = await request('/clients?status=archived', {}, undefined, {
        ...env,
        ENVIRONMENT: environment,
      });
      const [row] = clientListResponseSchema.parse(await response.json()).items;
      expect(row?.canDelete).toBe(canDelete);
    }
  );

  it('lists the leads instead for an owner, and tells anyone else why not', async () => {
    mockUpstream({});
    expect((await request('/clients?stage=lead')).status).toBe(200);
    const query = callsTo('/rest/v1/lead_list')[0]!.url.searchParams;
    expect(query.get('stage')).toBeNull();
    expect(query.get('order')).toBe('legal_name.asc,id.asc');
    expect(query.get('select')).toContain(
      'service_contract_state,service_contract_state_at,service_contract_return_expires_at'
    );
    expect(callsTo('/rest/v1/client_list')).toHaveLength(0);

    fetchMock.mockClear();
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    for (const search of ['stage=lead', 'stage=lead&contractState=sent']) {
      expect((await request(`/clients?${search}`)).status).toBe(403);
    }
    expect(callsTo('/rest/v1/lead_list')).toHaveLength(0);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('says where the contract of a lead stands, since when, and until when its link works', async () => {
    mockUpstream({
      clients: () =>
        Response.json(
          [
            {
              ...leadRow,
              service_contract_state: 'sent',
              service_contract_state_at: '2026-09-12T10:00:00+00:00',
              service_contract_return_expires_at: '2026-11-11T10:00:00+00:00',
            },
          ],
          { headers: { 'Content-Range': '0-0/1' } }
        ),
    });
    const body = clientListResponseSchema.parse(
      await (await request('/clients?stage=lead')).json()
    );
    expect(body.items[0]).toMatchObject({
      stage: 'lead',
      declaredEmployeeCount: 120,
      serviceContractState: 'sent',
      serviceContractStateAt: '2026-09-12T10:00:00+00:00',
      serviceContractReturnExpiresAt: '2026-11-11T10:00:00+00:00',
    });
  });

  it('requires a bearer token', async () => {
    mockUpstream({});
    const response = await request('/clients', {}, null);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects verified users without an organization membership', async () => {
    mockUpstream({ membership: () => Response.json([]) });
    const response = await request('/clients');
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('forbidden');
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
    expect(callsTo('/rest/v1/client_list')).toHaveLength(0);
  });

  it('reports a database outage as unavailable without details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpstream({
      membership: () => {
        throw new TypeError('Sensitive connection details');
      },
    });
    const response = await request('/clients');
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('Sensitive');
  });

  it('does not treat a PostgREST failure as a client error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpstream({
      clients: () => Response.json({ code: 'XX000', message: 'internal' }, { status: 500 }),
    });
    const response = await request('/clients');
    expect(response.status).toBe(500);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('internal_error');
  });
});

describe('GET /clients/{clientId}', () => {
  it('returns the client by id, archived or not', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...clientRow, archived_at: '2026-01-01T00:00:00+00:00' }]),
    });
    const response = await request(`/clients/${clientRow.id}`);
    expect(response.status).toBe(200);
    const { client } = clientResponseSchema.parse(await response.json());
    expect(client.id).toBe(clientRow.id);
    expect(client.archivedAt).toBe('2026-01-01T00:00:00+00:00');
    const { url } = callsTo('/rest/v1/clients')[0]!;
    expect(url.searchParams.get('id')).toBe(`eq.${clientRow.id}`);
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await request(`/clients/${clientRow.id}`);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });

  it.each([
    ['an archived client outside production', '2026-01-01T00:00:00+00:00', undefined, true],
    ['an active client', null, undefined, false],
    ['an archived client in production', '2026-01-01T00:00:00+00:00', 'production', false],
  ])('says whether the caller may delete %s', async (_, archivedAt, environment, canDelete) => {
    mockUpstream({ clients: () => Response.json([{ ...clientRow, archived_at: archivedAt }]) });
    const response = await request(`/clients/${clientRow.id}`, {}, undefined, {
      ...env,
      ENVIRONMENT: environment,
    });
    expect(clientResponseSchema.parse(await response.json()).canDelete).toBe(canDelete);
  });

  it('rejects a malformed id', async () => {
    mockUpstream({});
    expect((await request('/clients/nope')).status).toBe(400);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });
});

describe('POST /clients', () => {
  const validBody = {
    legalName: 'OMV Petrom SA',
    cui: 'RO 1590082',
    caenCode: '0610',
    countyCode: 'B',
    locality: 'București',
    addressLine: 'Str. Coralilor, nr. 22',
    declaredEmployeeCount: 120,
  };

  it('stores digits-only CUI, derives VAT status, and scopes to the membership', async () => {
    mockUpstream({ clients: () => Response.json(clientRow, { status: 201 }) });
    const response = await postClient(validBody);
    expect(response.status).toBe(201);
    expect(clientResponseSchema.parse(await response.json()).client.cui).toBe('1590082');
    const { init } = callsTo('/rest/v1/clients')[0]!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      organization_id: membership.organization_id,
      legal_name: 'OMV Petrom SA',
      cui: '1590082',
      vat_payer: true,
      caen_code: '0610',
      trade_register_number: null,
      county_code: 'B',
      locality: 'București',
      address_line: 'Str. Coralilor, nr. 22',
      legal_representative_name: null,
      declared_employee_count: 120,
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      stage: 'client',
      created_by: user.id,
    });
    expect(new Headers(init?.headers).get('Prefer')).toContain('return=representation');
  });

  const lead = {
    ...validBody,
    stage: 'lead',
    contactName: 'Andrei Pop',
    contactEmail: 'andrei@velocita.example',
    contactPhone: '0720 533 637',
  };

  it('creates a lead with its contact for an owner', async () => {
    mockUpstream({
      clients: () => Response.json({ ...clientRow, stage: 'lead' }, { status: 201 }),
    });
    const response = await postClient(lead);
    expect(response.status).toBe(201);
    expect(clientResponseSchema.parse(await response.json()).client.stage).toBe('lead');
    expect(callsTo('/rest/v1/clients')[0]!.body).toMatchObject({
      stage: 'lead',
      contact_name: 'Andrei Pop',
      contact_email: 'andrei@velocita.example',
      contact_phone: '0720 533 637',
    });
  });

  it('creates no lead for a specialist, and rejects a contact email that is not one', async () => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await postClient(lead)).status).toBe(403);
    expect((await postClient({ ...validBody, contactEmail: 'andrei' })).status).toBe(400);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('keeps an explicit VAT flag when the CUI has no prefix', async () => {
    mockUpstream({ clients: () => Response.json(clientRow, { status: 201 }) });
    await postClient({ legalName: 'Firma', cui: '1590082', vatPayer: true });
    expect(callsTo('/rest/v1/clients')[0]!.body).toMatchObject({
      cui: '1590082',
      vat_payer: true,
    });
  });

  it.each([
    [{ ...validBody, cui: '1590083' }, 'cui'],
    [{ ...validBody, legalName: 'A' }, 'legalName'],
    [{ ...validBody, countyCode: 'XX' }, 'countyCode'],
    [{ ...validBody, caenCode: '61' }, 'caenCode'],
    [{ ...validBody, declaredEmployeeCount: -1 }, 'declaredEmployeeCount'],
  ])('rejects an invalid body before touching the database: %j', async (body, path) => {
    mockUpstream({});
    const response = await postClient(body);
    expect(response.status).toBe(400);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.error).toBe('validation_error');
    expect(error.issues?.map((issue) => issue.path)).toContain(path);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('rejects a duplicate CUI within the organization', async () => {
    mockUpstream({
      clients: () =>
        Response.json(
          { code: '23505', message: 'duplicate key value violates unique constraint' },
          { status: 409 }
        ),
    });
    const response = await postClient(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('conflict');
  });

  it.each([
    [[{ archived_at: null, stage: 'client' }], 'cui_taken'],
    [[{ archived_at: '2026-09-21T08:00:00+00:00', stage: 'client' }], 'cui_taken_by_archived'],
    [[{ archived_at: null, stage: 'lead' }], 'cui_taken_by_lead'],
    // A specialist cannot see the lead that holds the CUI.
    [[], 'cui_taken_by_lead'],
  ])('says who holds the CUI: %j', async (holder, reason) => {
    mockUpstream({
      clients: ({ method }) =>
        method === 'POST'
          ? Response.json({ code: '23505', message: 'duplicate key' }, { status: 409 })
          : Response.json(holder),
    });
    const response = await postClient(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(reason);
    expect(callsTo('/rest/v1/clients')[1]!.url.searchParams.get('cui')).toBe('eq.1590082');
  });

  it('maps a row-level security rejection to forbidden', async () => {
    mockUpstream({
      clients: () =>
        Response.json(
          { code: '42501', message: 'new row violates row-level security' },
          {
            status: 403,
          }
        ),
    });
    expect((await postClient(validBody)).status).toBe(403);
  });

  it('requires authentication before validation', async () => {
    mockUpstream({});
    const response = await postClient({ legalName: 'A' }, null);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PUT /clients/{clientId}', () => {
  const validBody = {
    legalName: 'OMV Petrom SA',
    cui: 'RO 1590082',
    caenCode: '0610',
    countyCode: 'B',
    locality: 'București',
    addressLine: 'Str. Coralilor, nr. 22',
    declaredEmployeeCount: 120,
  };

  const putClient = (body: unknown, id = clientRow.id) =>
    request(`/clients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('replaces the entered fields of an active client and leaves the representative alone', async () => {
    mockUpstream({ clients: () => Response.json([clientRow]) });
    const response = await putClient({ ...validBody, legalRepresentativeName: 'Ion Pop' });
    expect(response.status).toBe(200);
    expect(clientResponseSchema.parse(await response.json()).client.id).toBe(clientRow.id);
    const { url: input, init } = callsTo('/rest/v1/clients')[0]!;
    expect(init?.method).toBe('PATCH');
    const query = input.searchParams;
    expect(query.get('id')).toBe(`eq.${clientRow.id}`);
    expect(query.get('archived_at')).toBe('is.null');
    expect(JSON.parse(String(init?.body))).toEqual({
      legal_name: 'OMV Petrom SA',
      cui: '1590082',
      vat_payer: true,
      caen_code: '0610',
      trade_register_number: null,
      county_code: 'B',
      locality: 'București',
      address_line: 'Str. Coralilor, nr. 22',
      declared_employee_count: 120,
    });
  });

  it("keeps what a lead declared when a client's form leaves the count out", async () => {
    mockUpstream({ clients: () => Response.json([clientRow]) });
    await putClient({ ...validBody, declaredEmployeeCount: undefined });
    const sent = callsTo('/rest/v1/clients')[0]!.body as object;
    expect(sent).not.toHaveProperty('declared_employee_count');
  });

  it('writes the contact fields that were sent, a cleared one included, and no others', async () => {
    mockUpstream({ clients: () => Response.json([clientRow]) });
    await putClient({ ...validBody, contactName: 'Andrei Pop', contactPhone: null, stage: 'lead' });
    const sent = callsTo('/rest/v1/clients')[0]!.body;
    expect(sent).toMatchObject({ contact_name: 'Andrei Pop', contact_phone: null });
    expect(sent).not.toHaveProperty('contact_email');
    expect(sent).not.toHaveProperty('stage');
  });

  it('rejects an invalid body before touching the database', async () => {
    mockUpstream({});
    const response = await putClient({ ...validBody, cui: '1590083' });
    expect(response.status).toBe(400);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });

  it('rejects a CUI another client of the organization has', async () => {
    mockUpstream({
      clients: () =>
        Response.json(
          { code: '23505', message: 'duplicate key value violates unique constraint' },
          { status: 409 }
        ),
    });
    const response = await putClient(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('conflict');
  });

  it('refuses an archived client', async () => {
    mockUpstream({
      clients: ({ method }) => Response.json(method === 'PATCH' ? [] : [{ id: clientRow.id }]),
    });
    const response = await putClient(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('conflict');
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await putClient(validBody)).status).toBe(404);
  });
});

describe('archiving a client', () => {
  const post = (action: 'archive' | 'restore', id = clientRow.id) =>
    request(`/clients/${id}/${action}`, { method: 'POST' });
  const archivedRow = { ...clientRow, archived_at: '2026-09-21T08:00:00+00:00' };

  it('archives an active client once', async () => {
    mockUpstream({ clients: () => Response.json([archivedRow]) });
    const response = await post('archive');
    expect(response.status).toBe(200);
    expect(clientResponseSchema.parse(await response.json()).client.archivedAt).not.toBeNull();
    const { url: input, init } = callsTo('/rest/v1/clients')[0]!;
    expect(init?.method).toBe('PATCH');
    expect(input.searchParams.get('archived_at')).toBe('is.null');
    expect(JSON.parse(String(init?.body)).archived_at).toEqual(expect.any(String));
  });

  it('keeps the first date when the client is archived already', async () => {
    mockUpstream({
      clients: ({ method }) => Response.json(method === 'PATCH' ? [] : [archivedRow]),
    });
    const response = await post('archive');
    expect(response.status).toBe(200);
    expect(clientResponseSchema.parse(await response.json()).client.archivedAt).toBe(
      archivedRow.archived_at
    );
  });

  it('restores an archived client', async () => {
    mockUpstream({ clients: () => Response.json([clientRow]) });
    const response = await post('restore');
    expect(response.status).toBe(200);
    const { url: input, init } = callsTo('/rest/v1/clients')[0]!;
    expect(input.searchParams.get('archived_at')).toBe('not.is.null');
    expect(JSON.parse(String(init?.body))).toEqual({ archived_at: null });
  });

  it('passes on the refusal to restore a client with employees a month past the step', async () => {
    mockUpstream({
      clients: () =>
        Response.json(
          { code: 'STP01', message: 'Over the step of employees for a month.' },
          { status: 400 }
        ),
    });
    const response = await post('restore');
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('employees_over_step');
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await post('archive')).status).toBe(404);
  });

  it.each(['archive', 'restore'] as const)('leaves %s to owners', async (action) => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await post(action)).status).toBe(403);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });
});

describe('DELETE /clients/{clientId}', () => {
  const archived = { id: clientRow.id, archived_at: '2026-09-21T08:00:00+00:00' };
  const production = { ...env, ENVIRONMENT: 'production' };
  const objects = [
    { bucket: 'documents', path: `${membership.organization_id}/${clientRow.id}/d/1.docx` },
    { bucket: 'documents', path: `signed-sheets/${clientRow.id}/e/ssm-1/v1-a.pdf` },
    { bucket: 'client-files', path: `${membership.organization_id}/${clientRow.id}/f.pdf` },
  ];
  const remove = (bindings = env, token?: string) =>
    request(`/clients/${clientRow.id}`, { method: 'DELETE' }, token, bindings);
  const storageCalls = () =>
    upstreamCalls().filter(({ url }) => url.pathname.startsWith('/storage/v1/object/'));

  it('deletes an archived client with the secret key, then its objects bucket by bucket', async () => {
    mockUpstream({
      clients: () => Response.json([archived]),
      deleteClient: () => Response.json(objects),
    });
    const response = await remove();
    expect(response.status).toBe(204);
    const { init: rpcInit } = callsTo('/rest/v1/rpc/delete_archived_client')[0]!;
    expect(JSON.parse(String(rpcInit?.body))).toEqual({
      p_organization_id: membership.organization_id,
      p_client_id: clientRow.id,
    });
    expect(new Headers(rpcInit?.headers).get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
    const removed = storageCalls().map(({ url, body }) => [
      url.pathname,
      (body as { prefixes: string[] }).prefixes,
    ]);
    expect(removed).toEqual([
      ['/storage/v1/object/documents', [objects[0]!.path, objects[1]!.path]],
      ['/storage/v1/object/client-files', [objects[2]!.path]],
    ]);
  });

  it('is refused to a member in production', async () => {
    mockUpstream({ clients: () => Response.json([archived]) });
    const response = await remove(production);
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('forbidden');
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
    expect(callsTo('/rest/v1/rpc/delete_archived_client')).toHaveLength(0);
  });

  it('is open to a platform admin in production, past the second factor', async () => {
    mockUpstream({
      auth: () => Response.json({ ...user, app_metadata: { provider: 'email', role: 'admin' } }),
      clients: () => Response.json([archived]),
    });
    expect((await remove(production, accessTokenAt('aal1'))).status).toBe(403);
    expect(callsTo('/rest/v1/rpc/delete_archived_client')).toHaveLength(0);
    expect((await remove(production, accessTokenAt('aal2'))).status).toBe(204);
    expect(callsTo('/rest/v1/rpc/delete_archived_client')).toHaveLength(1);
  });

  it('refuses a client that is not archived, before and inside the database', async () => {
    mockUpstream({ clients: () => Response.json([{ ...archived, archived_at: null }]) });
    const active = await remove();
    expect(active.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await active.json()).reason).toBe('client_not_archived');
    expect(callsTo('/rest/v1/rpc/delete_archived_client')).toHaveLength(0);

    mockUpstream({
      clients: () => Response.json([archived]),
      deleteClient: () => Response.json({ code: 'CLA02', message: 'restored' }, { status: 400 }),
    });
    const restored = await remove();
    expect(restored.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await restored.json()).reason).toBe('client_not_archived');
  });

  it('answers 404 for a client the caller does not reach', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await remove()).status).toBe(404);
    expect(callsTo('/rest/v1/rpc/delete_archived_client')).toHaveLength(0);

    mockUpstream({
      clients: () => Response.json([archived]),
      deleteClient: () => Response.json({ code: 'P0002', message: 'gone' }, { status: 400 }),
    });
    expect((await remove()).status).toBe(404);
  });

  it('still answers 204 when the storage fails, and logs how many objects, never their names', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUpstream({
      clients: () => Response.json([archived]),
      deleteClient: () => Response.json(objects),
      storage: () => Response.json({ message: 'unavailable' }, { status: 500 }),
    });
    expect((await remove()).status).toBe(204);
    const lines = logged.mock.calls.map((call) => call.join(' '));
    expect(lines).toContain('Objects of a deleted client left in documents: 2');
    expect(lines).toContain('Objects of a deleted client left in client-files: 1');
    expect(lines.join('\n')).not.toContain(clientRow.id);
  });
});

describe('POST /clients/{clientId}/promote', () => {
  const promote = () => request(`/clients/${clientRow.id}/promote`, { method: 'POST' });
  const leadRow = { ...clientRow, stage: 'lead' };

  it('turns an active lead into a client, and only that', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...clientRow, promoted_at: '2026-09-21T09:00:00+00:00' }]),
    });
    const response = await promote();
    expect(response.status).toBe(200);
    const { client } = clientResponseSchema.parse(await response.json());
    expect(client.stage).toBe('client');
    expect(client.promotedAt).toBe('2026-09-21T09:00:00+00:00');
    const { url: input, init } = callsTo('/rest/v1/clients')[0]!;
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ stage: 'client' });
    const query = input.searchParams;
    expect(query.get('stage')).toBe('eq.lead');
    expect(query.get('archived_at')).toBe('is.null');
  });

  it.each([
    [[clientRow], 200],
    [[{ ...leadRow, archived_at: '2026-09-21T08:00:00+00:00' }], 409],
    [[], 404],
  ])('changes nothing for a client, an archived lead, or no one: %#', async (current, status) => {
    mockUpstream({
      clients: ({ method }) => (method === 'PATCH' ? Response.json([]) : Response.json(current)),
    });
    expect((await promote()).status).toBe(status);
  });

  it("is an owner's", async () => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await promote()).status).toBe(403);
    expect(callsTo('/rest/v1/clients')).toHaveLength(0);
  });
});

describe("the owners' notes about a client", () => {
  const notesPath = `/clients/${clientRow.id}/owner-notes`;
  const putNotes = (body: unknown) =>
    request(notesPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const noteRow = { body: 'Sunat 12.09, revine.', updated_at: '2026-09-21T09:00:00+00:00' };

  it('reads an empty body where none were written, and what was written', async () => {
    mockUpstream({ clients: () => Response.json([{ id: clientRow.id }]) });
    const empty = await request(notesPath);
    expect(empty.status).toBe(200);
    expect(clientOwnerNotesResponseSchema.parse(await empty.json()).notes).toEqual({
      body: '',
      updatedAt: null,
    });

    mockUpstream({
      clients: () => Response.json([{ id: clientRow.id }]),
      notes: () => Response.json([noteRow]),
    });
    const written = clientOwnerNotesResponseSchema.parse(await (await request(notesPath)).json());
    expect(written.notes).toEqual({ body: noteRow.body, updatedAt: noteRow.updated_at });
  });

  it('answers 404 for a client that is not there', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await request(notesPath)).status).toBe(404);

    mockUpstream({
      notes: () => Response.json({ code: '23503', message: 'foreign key' }, { status: 409 }),
    });
    expect((await putNotes({ body: 'x' })).status).toBe(404);
  });

  it('writes one row per client, in the organization and the name of the caller', async () => {
    mockUpstream({ notes: () => Response.json(noteRow) });
    const response = await putNotes({ body: noteRow.body });
    expect(response.status).toBe(200);
    const { url: input, init } = callsTo('/rest/v1/client_owner_notes')[0]!;
    expect(input.searchParams.get('on_conflict')).toBe('client_id');
    expect(new Headers(init?.headers).get('Prefer')).toContain('resolution=merge-duplicates');
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: clientRow.id,
      organization_id: membership.organization_id,
      body: noteRow.body,
      updated_by: user.id,
    });
  });

  it('passes on the refusal for an archived client, and refuses what is too long', async () => {
    mockUpstream({
      notes: () => Response.json({ code: 'CLA01', message: 'archived' }, { status: 400 }),
    });
    const archived = await putNotes({ body: 'x' });
    expect(archived.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await archived.json()).reason).toBe('client_archived');
    expect((await putNotes({ body: 'x'.repeat(5001) })).status).toBe(400);
  });

  it('is not for specialists, to read or to write', async () => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await request(notesPath)).status).toBe(403);
    expect((await putNotes({ body: 'x' })).status).toBe(403);
    expect(callsTo('/rest/v1/client_owner_notes')).toHaveLength(0);
  });
});

describe('CORS', () => {
  it('allows POST preflight from the app origin', async () => {
    const response = await createApp().request(
      '/clients',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.ssmusor.ro',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      },
      env
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toMatch(/\bPOST\b/);
    expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'content-type'
    );
  });
});

it('documents the client routes with bearer security and request schemas', () => {
  const document = createApp().getOpenAPIDocument(openApiConfig);
  expect(document.paths?.['/clients']?.get?.operationId).toBe('listClients');
  expect(document.paths?.['/clients']?.post?.operationId).toBe('createClient');
  expect(document.paths?.['/clients/{clientId}']?.get?.operationId).toBe('getClient');
  expect(document.paths?.['/clients']?.post?.security).toEqual([{ bearerAuth: [] }]);
  expect(document.paths?.['/companies/lookup']?.get?.operationId).toBe('lookupCompany');
  expect(document.components?.schemas?.CreateClientRequest).toBeDefined();
  expect(document.components?.schemas?.ClientListResponse).toBeDefined();
  expect(document.components?.schemas?.CompanyLookupResponse).toBeDefined();
});

describe('a lead on a plan without offers', () => {
  const leadRow = { ...clientRow, stage: 'lead' };
  const refusal = () =>
    Response.json(
      { code: 'CLL03', message: 'Offers are part of the Profesional plan.' },
      { status: 400 }
    );
  const json = (method: string, body: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const leadBody = { legalName: 'OMV Petrom SA', cui: 'RO 1590082', stage: 'lead' };

  it.each([
    ['creating one', () => request('/clients', json('POST', leadBody))],
    [
      'editing one',
      () => request(`/clients/${clientRow.id}`, json('PUT', { ...leadBody, stage: undefined })),
    ],
    [
      'writing its notes',
      () => request(`/clients/${clientRow.id}/owner-notes`, json('PUT', { body: 'x' })),
    ],
  ])('passes on the refusal of %s', async (_name, send) => {
    mockUpstream({
      clients: ({ method }) => (method === 'GET' ? Response.json([leadRow]) : refusal()),
      notes: refusal,
    });
    const response = await send();
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('offers_not_in_plan');
  });

  it.each([
    ['promoted', 'promote'],
    ['archived', 'archive'],
    ['restored', 'restore'],
  ])('is still %s', async (_name, action) => {
    mockUpstream({ clients: () => Response.json([leadRow]) });
    expect((await request(`/clients/${clientRow.id}/${action}`, { method: 'POST' })).status).toBe(
      200
    );
  });
});
