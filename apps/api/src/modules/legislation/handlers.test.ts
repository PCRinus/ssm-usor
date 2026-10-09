import {
  apiErrorResponseSchema,
  latestLegalCheckRunResponseSchema,
  legalActListResponseSchema,
  legalChangeListResponseSchema,
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
  email: 'specialist@example.com',
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

const law = {
  id: 'lege-319-2006',
  name: 'Legea 319/2006',
  portal_id: 73772,
  portal_status: 'in_force',
  verified_consolidated_on: '2021-05-06',
  last_consolidated_on: '2021-07-25',
  last_amending_act: 'LEGE 208 21/07/2021',
  last_checked_at: '2026-10-07T04:00:00+00:00',
  checked_by_hand_on: null,
};
const order = {
  ...law,
  id: 'omai-163-2007',
  name: 'OMAI 163/2007',
  portal_id: null,
  portal_status: null,
  verified_consolidated_on: null,
  last_consolidated_on: null,
  last_amending_act: null,
  last_checked_at: null,
};
const norms = { ...law, id: 'hg-1425-2006', name: 'H.G. 1425/2006', portal_id: 76337 };

const change = {
  id: 'd1d1d1d1-0000-4000-8000-000000000001',
  seen_at: '2026-10-07T04:00:05+00:00',
  consolidated_on: '2021-07-25',
  amending_act: 'LEGE 208 21/07/2021',
  resolution: 'open',
  resolved_at: null,
  resolved_by_note: null,
  act: { id: 'lege-319-2006', name: 'Legea 319/2006', portal_id: 73772 },
};

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(tables: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    const table = tables[url.pathname.replace('/rest/v1/', '')];
    if (table && (init?.method ?? 'GET') === 'GET') return table();
    throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
  });
}

const searchParams = (table: string) =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === `/rest/v1/${table}`)
    .map((url) => url.searchParams);

const request = (path: string) =>
  createApp().request(path, { headers: { Authorization: 'Bearer test-access-token' } }, env);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('GET /legislation/acts', () => {
  it('lists the watched acts by name', async () => {
    mockUpstream({ legal_acts: () => Response.json([order, law, norms]) });
    const response = await request('/legislation/acts');
    expect(response.status).toBe(200);
    const body = legalActListResponseSchema.parse(await response.json());
    expect(body.items.map((item) => item.name)).toEqual([
      'H.G. 1425/2006',
      'Legea 319/2006',
      'OMAI 163/2007',
    ]);
    expect(body.items[1]).toEqual({
      id: 'lege-319-2006',
      name: 'Legea 319/2006',
      portalId: 73772,
      portalStatus: 'in_force',
      verifiedConsolidatedOn: '2021-05-06',
      lastConsolidatedOn: '2021-07-25',
      lastAmendingAct: 'LEGE 208 21/07/2021',
      lastCheckedAt: '2026-10-07T04:00:00+00:00',
      checkedByHandOn: null,
    });
    expect(body.items[2]).toMatchObject({ portalId: null, portalStatus: null });
  });

  it('answers 403 to an account without an organization', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/auth/v1/user') return Response.json(user);
      if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([]);
      throw new Error(`Unexpected upstream request: ${url}`);
    });
    const response = await request('/legislation/acts');
    expect(response.status).toBe(403);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('forbidden');
    expect(searchParams('legal_acts')).toHaveLength(0);
  });
});

describe('GET /legislation/changes', () => {
  it('lists the changes newest first, each with its act', async () => {
    mockUpstream({ legal_changes: () => Response.json([change]) });
    const response = await request('/legislation/changes');
    expect(response.status).toBe(200);
    expect(legalChangeListResponseSchema.parse(await response.json())).toEqual({
      items: [
        {
          id: 'd1d1d1d1-0000-4000-8000-000000000001',
          act: { id: 'lege-319-2006', name: 'Legea 319/2006', portalId: 73772 },
          seenAt: '2026-10-07T04:00:05+00:00',
          consolidatedOn: '2021-07-25',
          amendingAct: 'LEGE 208 21/07/2021',
          resolution: 'open',
          resolvedAt: null,
          resolvedByNote: null,
        },
      ],
    });
    const [list] = searchParams('legal_changes');
    expect(list!.get('order')).toBe('seen_at.desc,consolidated_on.desc,id.asc');
    expect(list!.get('select')).toContain('act:legal_acts(id,name,portal_id)');
  });

  it('answers 401 without a token', async () => {
    const response = await createApp().request('/legislation/changes', {}, env);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /legislation/runs/latest', () => {
  const failedRun = {
    id: 'e1e1e1e1-0000-4000-8000-000000000001',
    started_at: '2026-10-07T03:17:01+00:00',
    finished_at: '2026-10-07T03:21:40+00:00',
    status: 'failed',
    acts_checked: 49,
    changes_found: 0,
    acts_skipped: 0,
    errors: [
      {
        act: 'hg-1425-2006',
        kind: 'http_status',
        status: 503,
        message: 'https://legislatie.just.ro/Public/DetaliiDocument/76337 answered 503.',
      },
      { act: null, kind: 'other', message: 'Could not save the acts.' },
    ],
  };

  it('returns the run that started last', async () => {
    mockUpstream({ legal_check_runs: () => Response.json([failedRun]) });
    const response = await request('/legislation/runs/latest');
    expect(response.status).toBe(200);
    expect(latestLegalCheckRunResponseSchema.parse(await response.json())).toEqual({
      run: {
        id: 'e1e1e1e1-0000-4000-8000-000000000001',
        startedAt: '2026-10-07T03:17:01+00:00',
        finishedAt: '2026-10-07T03:21:40+00:00',
        status: 'failed',
        actsChecked: 49,
        changesFound: 0,
        actsSkipped: 0,
        errors: failedRun.errors,
      },
    });
    const [query] = searchParams('legal_check_runs');
    expect(query!.get('order')).toBe('started_at.desc,id.asc');
    expect(query!.get('limit')).toBe('1');
  });

  it('reads an error recorded without a kind as another failure', async () => {
    mockUpstream({
      legal_check_runs: () =>
        Response.json([
          { ...failedRun, errors: [{ act: 'hg-1425-2006', message: 'Page 76337 answered 503.' }] },
        ]),
    });
    const response = await request('/legislation/runs/latest');
    expect(response.status).toBe(200);
    expect(latestLegalCheckRunResponseSchema.parse(await response.json()).run!.errors).toEqual([
      { act: 'hg-1425-2006', kind: 'other', message: 'Page 76337 answered 503.' },
    ]);
  });

  it('returns null before the first run', async () => {
    mockUpstream({ legal_check_runs: () => Response.json([]) });
    const response = await request('/legislation/runs/latest');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ run: null });
  });
});
