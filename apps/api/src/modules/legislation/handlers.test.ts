import {
  apiErrorResponseSchema,
  latestLegalCheckRunResponseSchema,
  legalActListResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import { bundledActCitations } from './act-citations';

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

const newerChangeId = 'd1d1d1d1-0000-4000-8000-000000000002';
const olderChangeId = 'd1d1d1d1-0000-4000-8000-000000000001';

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
    mockUpstream({
      legal_acts: () => Response.json([order, law, norms]),
      legal_changes: () => Response.json([]),
    });
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
      subject: 'a securității și sănătății în muncă',
      domains: ['ssm'],
      citedIn: bundledActCitations().get('lege-319-2006')!.citedIn,
      openChange: null,
    });
    expect(body.items[2]).toMatchObject({ portalId: null, portalStatus: null });
  });

  it('gives each act the subject, domains and citations of the bundled citation index', async () => {
    mockUpstream({
      legal_acts: () => Response.json([order, law, norms]),
      legal_changes: () => Response.json([]),
    });
    const body = legalActListResponseSchema.parse(
      await (await request('/legislation/acts')).json()
    );
    for (const act of body.items) {
      const { subject, domains, citedIn } = bundledActCitations().get(act.id)!;
      expect(act).toMatchObject({ subject, domains, citedIn });
      expect(act.citedIn.documents).toBeGreaterThan(0);
    }
    expect(body.items.find((act) => act.id === 'omai-163-2007')!.domains).toEqual(['su']);
  });

  it('gives an act the templates no longer cite no subject and no citations', async () => {
    mockUpstream({
      legal_acts: () => Response.json([{ ...law, id: 'lege-1-2000', name: 'Legea 1/2000' }]),
      legal_changes: () => Response.json([]),
    });
    const body = legalActListResponseSchema.parse(
      await (await request('/legislation/acts')).json()
    );
    expect(body.items[0]).toMatchObject({
      subject: null,
      domains: [],
      citedIn: { documents: 0, quotes: 0 },
    });
  });

  it("names each act's newest open change, with its outcome", async () => {
    mockUpstream({
      legal_acts: () => Response.json([order, law, norms]),
      legal_changes: () =>
        Response.json([
          { id: newerChangeId, act_id: 'lege-319-2006', outcome: 'quote_differs' },
          { id: olderChangeId, act_id: 'lege-319-2006', outcome: null },
          { id: 'd1d1d1d1-0000-4000-8000-000000000003', act_id: 'hg-1425-2006', outcome: null },
        ]),
    });
    const body = legalActListResponseSchema.parse(
      await (await request('/legislation/acts')).json()
    );
    expect(body.items.map((act) => act.openChange)).toEqual([
      { id: 'd1d1d1d1-0000-4000-8000-000000000003', outcome: null },
      { id: newerChangeId, outcome: 'quote_differs' },
      null,
    ]);
    const [query] = searchParams('legal_changes');
    expect(query!.get('resolution')).toBe('eq.open');
    expect(query!.get('order')).toBe('consolidated_on.desc,seen_at.desc,id.asc');
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

  it('drops only a stored error it cannot read', async () => {
    mockUpstream({
      legal_check_runs: () =>
        Response.json([{ ...failedRun, errors: [{ act: 'hg-1425-2006' }, ...failedRun.errors] }]),
    });
    const response = await request('/legislation/runs/latest');
    expect(response.status).toBe(200);
    expect(latestLegalCheckRunResponseSchema.parse(await response.json()).run!.errors).toEqual(
      failedRun.errors
    );
  });

  it('returns null before the first run', async () => {
    mockUpstream({ legal_check_runs: () => Response.json([]) });
    const response = await request('/legislation/runs/latest');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ run: null });
  });
});
