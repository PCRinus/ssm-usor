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
  outcome: null,
  compared_with: null,
  assessed_at: null,
  amending_acts: null,
  amended_units: null,
  act: { id: 'lege-319-2006', name: 'Legea 319/2006', portal_id: 73772 },
  passages: [],
};

const quoted = {
  id: 'f2f2f2f2-0000-4000-8000-000000000002',
  template_file: '2.2_general_training_material.docx',
  paragraph: 2048,
  citation_form: 'quote',
  locator: 'Art. 36 alin. (1) – (3)',
  unit_label: 'Art. 36 alin. (2)',
  status: 'changed',
  old_text: '(2) … să poarte casca de protecție omologată.',
  new_text: '(2) … să poarte pe cap cască de protecție omologată.',
  hunks: [
    { old: 'casca', new: 'pe cap cască', before: 'să poarte', after: 'de protecție omologată.' },
  ],
};
const referred = {
  ...quoted,
  id: 'f2f2f2f2-0000-4000-8000-000000000001',
  paragraph: 22,
  citation_form: 'reference',
  locator: null,
  unit_label: 'Art. 6',
  old_text: 'Art. 6 …',
  new_text: 'Art. 6 … 47^1. …',
  hunks: [],
};

const assessed = {
  ...change,
  id: 'd1d1d1d1-0000-4000-8000-000000000002',
  consolidated_on: '2026-11-06',
  amending_act: null,
  outcome: 'quote_differs',
  compared_with: '2026-08-25',
  assessed_at: '2026-11-13T03:18:00+00:00',
  amending_acts: [
    {
      kind: 'LEGEA',
      number: '207',
      date: '2026-11-03',
      name: 'Legea 207/2026',
      portalId: null,
      gazette: { number: '905', date: '2026-11-04' },
    },
  ],
  amended_units: [
    {
      unit: 'Art. 36 alin. (2)',
      subject: 'Alineatul (2), Articolul 36',
      operation: 'modified',
      date: '2026-11-06',
      amendingAct: 'Legea 207/2026',
    },
  ],
  act: { id: 'oug-195-2002', name: 'O.U.G. 195/2002', portal_id: 41006 },
  passages: [quoted, referred],
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
    mockUpstream({ legal_changes: () => Response.json([assessed, change]) });
    const response = await request('/legislation/changes');
    expect(response.status).toBe(200);
    expect(legalChangeListResponseSchema.parse(await response.json())).toEqual({
      items: [
        {
          id: 'd1d1d1d1-0000-4000-8000-000000000002',
          act: { id: 'oug-195-2002', name: 'O.U.G. 195/2002', portalId: 41006 },
          seenAt: '2026-10-07T04:00:05+00:00',
          consolidatedOn: '2026-11-06',
          amendingAct: null,
          resolution: 'open',
          resolvedAt: null,
          resolvedByNote: null,
          outcome: 'quote_differs',
          comparedWith: '2026-08-25',
          assessedAt: '2026-11-13T03:18:00+00:00',
          amendingActs: [{ name: 'Legea 207/2026', adoptedOn: '2026-11-03' }],
          amendedUnits: [
            {
              unit: 'Art. 36 alin. (2)',
              operation: 'modified',
              date: '2026-11-06',
              amendingAct: 'Legea 207/2026',
            },
          ],
          passages: [
            {
              id: referred.id,
              templateFile: '2.2_general_training_material.docx',
              document: {
                typeKey: 'general_training_material',
                title: 'Material de instruire introductiv-generală',
              },
              citationForm: 'reference',
              locator: null,
              unit: 'Art. 6',
              status: 'changed',
              oldText: 'Art. 6 …',
              newText: 'Art. 6 … 47^1. …',
              hunks: [],
            },
            {
              id: quoted.id,
              templateFile: '2.2_general_training_material.docx',
              document: {
                typeKey: 'general_training_material',
                title: 'Material de instruire introductiv-generală',
              },
              citationForm: 'quote',
              locator: 'Art. 36 alin. (1) – (3)',
              unit: 'Art. 36 alin. (2)',
              status: 'changed',
              oldText: '(2) … să poarte casca de protecție omologată.',
              newText: '(2) … să poarte pe cap cască de protecție omologată.',
              hunks: quoted.hunks,
            },
          ],
        },
        {
          id: 'd1d1d1d1-0000-4000-8000-000000000001',
          act: { id: 'lege-319-2006', name: 'Legea 319/2006', portalId: 73772 },
          seenAt: '2026-10-07T04:00:05+00:00',
          consolidatedOn: '2021-07-25',
          amendingAct: 'LEGE 208 21/07/2021',
          resolution: 'open',
          resolvedAt: null,
          resolvedByNote: null,
          outcome: null,
          comparedWith: null,
          assessedAt: null,
          amendingActs: [],
          amendedUnits: [],
          passages: [],
        },
      ],
    });
    const [list] = searchParams('legal_changes');
    expect(list!.get('order')).toBe('seen_at.desc,consolidated_on.desc,id.asc');
    expect(list!.get('select')).toContain('act:legal_acts(id,name,portal_id)');
    expect(list!.get('select')).toContain('passages:legal_change_passages(');
  });

  it('drops only the stored amending acts and amended units it cannot read', async () => {
    mockUpstream({
      legal_changes: () =>
        Response.json([
          {
            ...assessed,
            amending_acts: [{ kind: 'LEGEA' }, ...assessed.amending_acts],
            amended_units: [
              ...assessed.amended_units,
              { ...assessed.amended_units[0], operation: 'renumbered' },
            ],
          },
        ]),
    });
    const response = await request('/legislation/changes');
    const [item] = legalChangeListResponseSchema.parse(await response.json()).items;
    expect(item!.amendingActs).toEqual([{ name: 'Legea 207/2026', adoptedOn: '2026-11-03' }]);
    expect(item!.amendedUnits.map((unit) => unit.unit)).toEqual(['Art. 36 alin. (2)']);
  });

  it('never asks for the reasons to review, which members cannot read', async () => {
    mockUpstream({ legal_changes: () => Response.json([change]) });
    await request('/legislation/changes');
    const [list] = searchParams('legal_changes');
    expect(list!.get('select')).not.toMatch(/(^|,)review(,|$)/);
  });

  it('names the document a passage sits in by its template, and none for a file no template lists', async () => {
    const firePassage = {
      ...quoted,
      id: 'f2f2f2f2-0000-4000-8000-000000000003',
      template_file: 'fire/2.1_fire_own_instructions.docx',
    };
    const unknown = {
      ...quoted,
      id: 'f2f2f2f2-0000-4000-8000-000000000004',
      template_file: 'retired.docx',
    };
    mockUpstream({
      legal_changes: () => Response.json([{ ...assessed, passages: [firePassage, unknown] }]),
    });
    const response = await request('/legislation/changes');
    const { items } = legalChangeListResponseSchema.parse(await response.json());
    expect(items[0]!.passages.map((passage) => passage.document)).toEqual([
      {
        typeKey: 'fire_own_instructions',
        title: 'Instrucțiuni proprii în domeniul situațiilor de urgență',
      },
      null,
    ]);
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
