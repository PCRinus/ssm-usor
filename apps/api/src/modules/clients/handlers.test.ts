import {
  apiErrorResponseSchema,
  clientListResponseSchema,
  clientOwnerNotesResponseSchema,
  clientResponseSchema,
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
  stage: 'client',
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  promoted_at: null,
  created_at: '2026-09-17T10:00:00+00:00',
  updated_at: '2026-09-17T10:00:00+00:00',
  archived_at: null,
};

type Handler = (init?: RequestInit) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(
  handlers: Partial<Record<'auth' | 'membership' | 'clients' | 'notes', Handler>>
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return handlers.auth?.(init) ?? Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return handlers.membership?.(init) ?? Response.json([membership]);
    }
    if (url.pathname === '/rest/v1/clients') {
      return (
        handlers.clients?.(init) ??
        Response.json([clientRow], { headers: { 'Content-Range': '0-0/1' } })
      );
    }
    if (url.pathname === '/rest/v1/client_owner_notes') {
      return handlers.notes?.(init) ?? Response.json([]);
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

const postClient = (body: unknown, token?: string) =>
  request(
    '/clients',
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

describe('GET /clients', () => {
  it('lists active clients of the effective organization as the verified user', async () => {
    mockUpstream({});
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
          stage: 'client',
          contactName: null,
          contactEmail: null,
          contactPhone: null,
          promotedAt: null,
          createdAt: clientRow.created_at,
          updatedAt: clientRow.updated_at,
          archivedAt: null,
        },
      ],
    });
    const [rpcUrl, rpcInit] = calls('/rest/v1/rpc/current_membership')[0]!;
    expect(new URL(String(rpcUrl)).origin).toBe('https://example.supabase.co');
    expect(new Headers(rpcInit?.headers).get('Authorization')).toBe('Bearer test-access-token');
    expect(new Headers(rpcInit?.headers).get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY);
    const [listUrl, listInit] = calls('/rest/v1/clients')[0]!;
    const query = new URL(String(listUrl)).searchParams;
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('stage')).toBe('eq.client');
    expect(query.get('order')).toBe('legal_name.asc,id.asc');
    expect(query.get('offset')).toBe('0');
    expect(query.get('limit')).toBe('25');
    const headers = new Headers(listInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-access-token');
    expect(headers.get('Prefer')).toContain('count=exact');
    expect(listInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('pages and sorts by one whitelisted key with a stable tiebreaker', async () => {
    mockUpstream({
      clients: () => Response.json([clientRow], { headers: { 'Content-Range': '25-25/26' } }),
    });
    const response = await request('/clients?page=2&sort=declaredEmployeeCount&order=desc');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ page: 2, pageSize: 25, total: 26 });
    const [listUrl] = calls('/rest/v1/clients')[0]!;
    const query = new URL(String(listUrl)).searchParams;
    expect(query.get('order')).toBe('declared_employee_count.desc,legal_name.desc,id.asc');
    expect(query.get('offset')).toBe('25');
  });

  it.each(['page=0', 'pageSize=101', 'sort=cnp', 'order=up'])(
    'rejects an invalid list parameter: %s',
    async (search) => {
      mockUpstream({});
      expect((await request(`/clients?${search}`)).status).toBe(400);
      expect(calls('/rest/v1/clients')).toHaveLength(0);
    }
  );

  it('lists the archived clients instead when asked', async () => {
    mockUpstream({});
    expect((await request('/clients?status=archived')).status).toBe(200);
    const [url] = calls('/rest/v1/clients')[0]!;
    expect(new URL(String(url)).searchParams.get('archived_at')).toBe('not.is.null');
    expect((await request('/clients?status=all')).status).toBe(400);
  });

  it('lists the leads instead for an owner, and tells anyone else why not', async () => {
    mockUpstream({});
    expect((await request('/clients?stage=lead')).status).toBe(200);
    expect(new URL(String(calls('/rest/v1/clients')[0]![0])).searchParams.get('stage')).toBe(
      'eq.lead'
    );

    fetchMock.mockClear();
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    const refused = await request('/clients?stage=lead');
    expect(refused.status).toBe(403);
    expect(calls('/rest/v1/clients')).toHaveLength(0);
  });

  it('requires a bearer token', async () => {
    mockUpstream({});
    const response = await request('/clients', {}, '');
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects verified users without an organization membership', async () => {
    mockUpstream({ membership: () => Response.json([]) });
    const response = await request('/clients');
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('forbidden');
    expect(calls('/rest/v1/clients')).toHaveLength(0);
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
    const [url] = calls('/rest/v1/clients')[0]!;
    expect(new URL(String(url)).searchParams.get('id')).toBe(`eq.${clientRow.id}`);
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await request(`/clients/${clientRow.id}`);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });

  it('rejects a malformed id', async () => {
    mockUpstream({});
    expect((await request('/clients/nope')).status).toBe(400);
    expect(calls('/rest/v1/clients')).toHaveLength(0);
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
    const [, init] = calls('/rest/v1/clients')[0]!;
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
    expect(JSON.parse(String(calls('/rest/v1/clients')[0]![1]?.body))).toMatchObject({
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
    expect(calls('/rest/v1/clients')).toHaveLength(0);
  });

  it('keeps an explicit VAT flag when the CUI has no prefix', async () => {
    mockUpstream({ clients: () => Response.json(clientRow, { status: 201 }) });
    await postClient({ legalName: 'Firma', cui: '1590082', vatPayer: true });
    expect(JSON.parse(String(calls('/rest/v1/clients')[0]![1]?.body))).toMatchObject({
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
    expect(calls('/rest/v1/clients')).toHaveLength(0);
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
      clients: (init) =>
        init?.method === 'POST'
          ? Response.json({ code: '23505', message: 'duplicate key' }, { status: 409 })
          : Response.json(holder),
    });
    const response = await postClient(validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(reason);
    expect(new URL(String(calls('/rest/v1/clients')[1]![0])).searchParams.get('cui')).toBe(
      'eq.1590082'
    );
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
    const response = await postClient({ legalName: 'A' }, '');
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
    const [input, init] = calls('/rest/v1/clients')[0]!;
    expect(init?.method).toBe('PATCH');
    const query = new URL(String(input)).searchParams;
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

  it('writes the contact fields that were sent, a cleared one included, and no others', async () => {
    mockUpstream({ clients: () => Response.json([clientRow]) });
    await putClient({ ...validBody, contactName: 'Andrei Pop', contactPhone: null, stage: 'lead' });
    const sent = JSON.parse(String(calls('/rest/v1/clients')[0]![1]?.body));
    expect(sent).toMatchObject({ contact_name: 'Andrei Pop', contact_phone: null });
    expect(sent).not.toHaveProperty('contact_email');
    expect(sent).not.toHaveProperty('stage');
  });

  it('rejects an invalid body before touching the database', async () => {
    mockUpstream({});
    const response = await putClient({ ...validBody, cui: '1590083' });
    expect(response.status).toBe(400);
    expect(calls('/rest/v1/clients')).toHaveLength(0);
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
      clients: (init) => Response.json(init?.method === 'PATCH' ? [] : [{ id: clientRow.id }]),
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
    const [input, init] = calls('/rest/v1/clients')[0]!;
    expect(init?.method).toBe('PATCH');
    expect(new URL(String(input)).searchParams.get('archived_at')).toBe('is.null');
    expect(JSON.parse(String(init?.body)).archived_at).toEqual(expect.any(String));
  });

  it('keeps the first date when the client is archived already', async () => {
    mockUpstream({
      clients: (init) => Response.json(init?.method === 'PATCH' ? [] : [archivedRow]),
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
    const [input, init] = calls('/rest/v1/clients')[0]!;
    expect(new URL(String(input)).searchParams.get('archived_at')).toBe('not.is.null');
    expect(JSON.parse(String(init?.body))).toEqual({ archived_at: null });
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await post('archive')).status).toBe(404);
  });

  it.each(['archive', 'restore'] as const)('leaves %s to owners', async (action) => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await post(action)).status).toBe(403);
    expect(calls('/rest/v1/clients')).toHaveLength(0);
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
    const [input, init] = calls('/rest/v1/clients')[0]!;
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toEqual({ stage: 'client' });
    const query = new URL(String(input)).searchParams;
    expect(query.get('stage')).toBe('eq.lead');
    expect(query.get('archived_at')).toBe('is.null');
  });

  it.each([
    [[clientRow], 200],
    [[{ ...leadRow, archived_at: '2026-09-21T08:00:00+00:00' }], 409],
    [[], 404],
  ])('changes nothing for a client, an archived lead, or no one: %#', async (current, status) => {
    mockUpstream({
      clients: (init) => (init?.method === 'PATCH' ? Response.json([]) : Response.json(current)),
    });
    expect((await promote()).status).toBe(status);
  });

  it("is an owner's", async () => {
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await promote()).status).toBe(403);
    expect(calls('/rest/v1/clients')).toHaveLength(0);
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
    const [input, init] = calls('/rest/v1/client_owner_notes')[0]!;
    expect(new URL(String(input)).searchParams.get('on_conflict')).toBe('client_id');
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
    expect(calls('/rest/v1/client_owner_notes')).toHaveLength(0);
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
