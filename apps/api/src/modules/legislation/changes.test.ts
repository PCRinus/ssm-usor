import {
  apiErrorResponseSchema,
  appliedLegalChangeListResponseSchema,
  legalChangeDetailResponseSchema,
  openLegalChangeListResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import { bundledCitingDocuments } from './act-citations';

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

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const membership = { user_id: user.id, organization_id: organizationId, role: 'specialist' };

const helmet = {
  id: 'f2f2f2f2-0000-4000-8000-000000000002',
  template_file: '2.2_general_training_material.docx',
  type_key: 'general_training_material',
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

const traffic = { id: 'oug-195-2002', name: 'O.U.G. 195/2002', portal_id: 41006 };
const fire = { id: 'lege-307-2006', name: 'Legea 307/2006', portal_id: 73298 };

const material = (version: number, note: string | null = 'Casca se poartă pe cap.') => ({
  id: `a0a0a0a0-0000-4000-8000-00000000000${version}`,
  version,
  note,
  created_at: '2026-11-14T09:00:00+00:00',
  template: {
    type_key: 'general_training_material',
    title: 'Material de instruire introductiv-generală',
  },
});

const applied = {
  id: 'd1d1d1d1-0000-4000-8000-000000000002',
  seen_at: '2026-11-07T03:47:00+00:00',
  consolidated_on: '2026-11-06',
  amending_act: 'LEGE 207 03/11/2026',
  resolution: 'template_version',
  resolved_at: '2026-11-14T09:00:00+00:00',
  resolved_by_note: 'Casca se poartă pe cap.',
  outcome: 'quote_differs',
  compared_with: '2026-08-25',
  assessed_at: '2026-11-07T03:50:00+00:00',
  amending_acts: [
    {
      kind: 'LEGEA',
      number: '207',
      date: '2026-11-03',
      name: 'Legea 207/2026',
      portalId: 301234,
      gazette: { number: '905', date: '2026-11-04' },
    },
  ],
  amended_units: [
    {
      unit: 'Art. 36 alin. (2)',
      operation: 'modified',
      date: '2026-11-06',
      amendingAct: 'Legea 207/2026',
    },
    { unit: 'Art. 6', operation: 'supplemented', date: '2026-11-06', amendingAct: null },
  ],
  act: traffic,
  passages: [helmet],
  versions: [material(2)],
};

// Registration records a form an environment never saw as answered, with nothing assessed.
const registered = {
  ...applied,
  id: 'd1d1d1d1-0000-4000-8000-000000000003',
  consolidated_on: '2026-08-14',
  amending_act: null,
  outcome: null,
  compared_with: null,
  assessed_at: null,
  amending_acts: null,
  amended_units: null,
  passages: [],
  versions: [],
};

const unassessed = {
  id: 'd1d1d1d1-0000-4000-8000-000000000004',
  seen_at: '2026-11-15T03:47:00+00:00',
  consolidated_on: '2026-11-14',
  outcome: null,
  act: fire,
  passages: [],
};

const behind = (client: number, version: number, document = client) => ({
  type_key: 'general_training_material',
  client_id: `c0c0c0c0-0000-4000-8000-00000000000${client}`,
  document_id: `b0b0b0b0-0000-4000-8000-00000000000${document}`,
  revision_version: version,
});

const fetchMock = vi.fn<typeof fetch>();

type Upstream = (params: URLSearchParams, init?: RequestInit) => Response;

function mockUpstream(tables: Record<string, Upstream>) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    const table = tables[url.pathname.replace('/rest/v1/', '')];
    if (table && (init?.method ?? 'GET') === 'GET') return table(url.searchParams, init);
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

const page = (rows: unknown[], total: number) => (params: URLSearchParams) => {
  const from = Number(params.get('offset') ?? 0);
  if (from >= total && from > 0) {
    return Response.json(
      { code: 'PGRST103', message: 'Requested range not satisfiable' },
      { status: 416 }
    );
  }
  const shown = rows.slice(0, Number(params.get('limit') ?? rows.length));
  return Response.json(shown, {
    headers: { 'Content-Range': `${from}-${from + shown.length - 1}/${total}` },
  });
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const materialDocument = {
  typeKey: 'general_training_material',
  title: 'Material de instruire introductiv-generală',
  set: 'occupational_safety',
};

describe('GET /legislation/changes/open', () => {
  it('lists the open changes with what their passages touched and what cites the act', async () => {
    mockUpstream({
      legal_changes: () =>
        Response.json([
          {
            ...applied,
            resolution: 'open',
            passages: [helmet, { ...helmet, paragraph: 2050, unit_label: 'Art. 36 alin. (2)' }],
          },
          unassessed,
        ]),
    });
    const response = await request('/legislation/changes/open');
    expect(response.status).toBe(200);
    const { items } = openLegalChangeListResponseSchema.parse(await response.json());
    expect(items[0]).toEqual({
      id: applied.id,
      act: {
        id: 'oug-195-2002',
        name: 'O.U.G. 195/2002',
        portalId: 41006,
        subject: 'privind circulația pe drumurile publice',
      },
      consolidatedOn: '2026-11-06',
      seenAt: '2026-11-07T03:47:00+00:00',
      outcome: 'quote_differs',
      touched: { documents: [materialDocument], units: ['Art. 36 alin. (2)'] },
      citedBy: [materialDocument],
    });
    expect(items[1]).toMatchObject({
      outcome: null,
      touched: { documents: [], units: [] },
      citedBy: bundledCitingDocuments().get('lege-307-2006'),
    });
    expect(items[1]!.citedBy.map((document) => document.set)).toContain('fire_safety');

    const [query] = searchParams('legal_changes');
    expect(query!.get('resolution')).toBe('eq.open');
    expect(query!.get('order')).toBe('consolidated_on.desc,seen_at.desc,id.asc');
  });
});

describe('GET /legislation/changes/applied', () => {
  it('pages the changes a template version answers, newest form first, 20 by default', async () => {
    mockUpstream({
      legal_changes: page([applied, registered], 2),
      documents_behind: () => Response.json([]),
    });
    const response = await request('/legislation/changes/applied');
    expect(response.status).toBe(200);
    const body = appliedLegalChangeListResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(body.items).toEqual([
      {
        id: applied.id,
        act: {
          id: 'oug-195-2002',
          name: 'O.U.G. 195/2002',
          portalId: 41006,
          subject: 'privind circulația pe drumurile publice',
        },
        consolidatedOn: '2026-11-06',
        seenAt: '2026-11-07T03:47:00+00:00',
        appliedAt: '2026-11-14T09:00:00+00:00',
        note: 'Casca se poartă pe cap.',
        updatedDocuments: [
          {
            ...materialDocument,
            version: 2,
            note: 'Casca se poartă pe cap.',
            registeredAt: '2026-11-14T09:00:00+00:00',
          },
        ],
        behind: { documents: 0, clients: 0, types: [] },
      },
      expect.objectContaining({ id: registered.id, updatedDocuments: [] }),
    ]);

    const [query] = searchParams('legal_changes');
    expect(query!.get('resolution')).toBe('eq.template_version');
    expect(query!.get('order')).toBe('consolidated_on.desc,seen_at.desc,id.asc');
    expect(query!.get('offset')).toBe('0');
    expect(query!.get('limit')).toBe('20');
  });

  it('counts the documents still made from a version older than the one that answers the change', async () => {
    mockUpstream({
      legal_changes: page([{ ...applied, versions: [material(3, 'Altceva.'), material(2)] }], 1),
      documents_behind: () =>
        Response.json([behind(1, 1), behind(2, 2), behind(3, 1), behind(3, 1, 4)]),
    });
    const body = appliedLegalChangeListResponseSchema.parse(
      await (await request('/legislation/changes/applied')).json()
    );
    expect(body.items[0]!.updatedDocuments).toEqual([
      expect.objectContaining({ version: 2, note: 'Casca se poartă pe cap.' }),
    ]);
    expect(body.items[0]!.behind).toEqual({
      documents: 3,
      clients: 2,
      types: [{ ...materialDocument, documents: 3, clients: 2 }],
    });

    const [query] = searchParams('documents_behind');
    expect(query!.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(query!.get('behind_template')).toBe('eq.true');
    expect(query!.get('type_key')).toBe('in.(general_training_material)');
  });

  it('leaves out the documents already on the answering version or a later one', async () => {
    mockUpstream({
      legal_changes: page([applied], 1),
      documents_behind: () => Response.json([behind(1, 2), behind(2, 3), behind(3, 1)]),
    });
    const body = appliedLegalChangeListResponseSchema.parse(
      await (await request('/legislation/changes/applied')).json()
    );
    expect(body.items[0]!.behind).toMatchObject({ documents: 1, clients: 1 });
  });

  it('reads no documents when no change on the page updated a template', async () => {
    mockUpstream({ legal_changes: page([registered], 1) });
    const response = await request('/legislation/changes/applied');
    expect(response.status).toBe(200);
    expect(searchParams('documents_behind')).toEqual([]);
  });

  it('answers an empty page past the last, with the total', async () => {
    mockUpstream({ legal_changes: page([applied, registered], 2) });
    const response = await request('/legislation/changes/applied?page=3&pageSize=1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], page: 3, pageSize: 1, total: 2 });
  });

  it.each(['pageSize=101', 'page=0', 'page=abc'])('answers 400 to %s', async (query) => {
    mockUpstream({});
    const response = await request(`/legislation/changes/applied?${query}`);
    expect(response.status).toBe(400);
  });
});

describe('GET /legislation/changes/{changeId}', () => {
  it('gives the change with its versions, the documents citing the act and those behind', async () => {
    mockUpstream({
      legal_changes: () => Response.json(applied),
      documents_behind: () => Response.json([behind(1, 1), behind(2, 1)]),
    });
    const response = await request(`/legislation/changes/${applied.id}`);
    expect(response.status).toBe(200);
    const { change } = legalChangeDetailResponseSchema.parse(await response.json());
    expect(change).toMatchObject({
      id: applied.id,
      act: { id: 'oug-195-2002', subject: 'privind circulația pe drumurile publice' },
      resolution: 'template_version',
      resolvedAt: '2026-11-14T09:00:00+00:00',
      resolvedByNote: 'Casca se poartă pe cap.',
      amendingActs: [{ name: 'Legea 207/2026', adoptedOn: '2026-11-03', portalId: 301234 }],
      amendedUnits: [
        expect.objectContaining({ unit: 'Art. 36 alin. (2)', operation: 'modified' }),
        expect.objectContaining({ unit: 'Art. 6', operation: 'supplemented' }),
      ],
      passages: [
        expect.objectContaining({
          document: { typeKey: 'general_training_material', title: materialDocument.title },
          locator: 'Art. 36 alin. (1) – (3)',
          oldText: helmet.old_text,
          newText: helmet.new_text,
        }),
      ],
      updatedDocuments: [
        expect.objectContaining({ typeKey: 'general_training_material', version: 2 }),
      ],
      citedBy: [materialDocument],
      behind: {
        documents: 2,
        clients: 2,
        types: [{ ...materialDocument, documents: 2, clients: 2 }],
      },
    });
    const [query] = searchParams('legal_changes');
    expect(query!.get('id')).toBe(`eq.${applied.id}`);
    expect(query!.get('select')).not.toContain('review');
  });

  it('counts every document behind, page by page, past the rows one request answers', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      type_key: 'general_training_material',
      client_id: `c0c0c0c0-0000-4000-8000-${String(index % 400).padStart(12, '0')}`,
      document_id: `b0b0b0b0-0000-4000-8000-${String(index).padStart(12, '0')}`,
      revision_version: 1,
    }));
    mockUpstream({
      legal_changes: () => Response.json(applied),
      documents_behind: (params) => {
        const from = Number(params.get('offset') ?? 0);
        return Response.json(rows.slice(from, from + Number(params.get('limit') ?? rows.length)));
      },
    });
    const response = await request(`/legislation/changes/${applied.id}`);
    const { change } = legalChangeDetailResponseSchema.parse(await response.json());
    expect(change.behind).toMatchObject({ documents: 1001, clients: 400 });
    const pages = searchParams('documents_behind');
    expect(pages.map((page) => page.get('offset'))).toEqual(['0', '1000']);
    expect(pages.every((page) => page.get('order') === 'document_id.asc')).toBe(true);
  });

  it('gives a change still under review nothing behind and asks for no documents', async () => {
    mockUpstream({
      legal_changes: () =>
        Response.json({ ...registered, resolution: 'open', resolved_at: null, act: fire }),
    });
    const response = await request(`/legislation/changes/${registered.id}`);
    expect(response.status).toBe(200);
    const { change } = legalChangeDetailResponseSchema.parse(await response.json());
    expect(change).toMatchObject({
      resolution: 'open',
      amendingActs: [],
      amendedUnits: [],
      passages: [],
      updatedDocuments: [],
      behind: { documents: 0, clients: 0, types: [] },
    });
    expect(change.citedBy.length).toBeGreaterThan(1);
    expect(searchParams('documents_behind')).toEqual([]);
  });

  it('names the document a passage sits in by its type, else by its file, and none when neither is known', async () => {
    const byFile = {
      ...helmet,
      id: 'f2f2f2f2-0000-4000-8000-000000000003',
      template_file: 'fire/2.1_fire_own_instructions.docx',
      type_key: null,
    };
    const unknown = {
      ...helmet,
      id: 'f2f2f2f2-0000-4000-8000-000000000004',
      template_file: 'retired.docx',
      type_key: null,
    };
    const renamed = {
      ...helmet,
      id: 'f2f2f2f2-0000-4000-8000-000000000005',
      template_file: 'renamed.docx',
      type_key: 'fire_own_instructions',
    };
    mockUpstream({
      legal_changes: () =>
        Response.json({ ...applied, passages: [byFile, unknown, renamed], versions: [] }),
    });
    const response = await request(`/legislation/changes/${applied.id}`);
    const { change } = legalChangeDetailResponseSchema.parse(await response.json());
    const fireInstructions = {
      typeKey: 'fire_own_instructions',
      title: 'Instrucțiuni proprii în domeniul situațiilor de urgență',
    };
    expect(change.passages.map((passage) => passage.document)).toEqual([
      fireInstructions,
      fireInstructions,
      null,
    ]);
  });

  it('drops only the stored amending acts and amended units it cannot read', async () => {
    mockUpstream({
      legal_changes: () =>
        Response.json({
          ...applied,
          versions: [],
          amending_acts: [{ kind: 'LEGEA' }, ...applied.amending_acts],
          amended_units: [
            ...applied.amended_units,
            { ...applied.amended_units[0], operation: 'renumbered' },
          ],
        }),
    });
    const response = await request(`/legislation/changes/${applied.id}`);
    const { change } = legalChangeDetailResponseSchema.parse(await response.json());
    expect(change.amendingActs).toEqual([
      { name: 'Legea 207/2026', adoptedOn: '2026-11-03', portalId: 301234 },
    ]);
    expect(change.amendedUnits.map((unit) => unit.unit)).toEqual(['Art. 36 alin. (2)', 'Art. 6']);
  });

  it('answers only the fields members see of a stored amending act and amended unit', async () => {
    mockUpstream({
      legal_changes: () =>
        Response.json({
          ...applied,
          versions: [],
          amended_units: [{ ...applied.amended_units[0], subject: 'Alineatul (2), Articolul 36' }],
        }),
    });
    const response = await request(`/legislation/changes/${applied.id}`);
    const { change } = (await response.json()) as { change: Record<string, unknown> };
    expect(change.amendingActs).toEqual([
      { name: 'Legea 207/2026', adoptedOn: '2026-11-03', portalId: 301234 },
    ]);
    expect(change.amendedUnits).toEqual([
      {
        unit: 'Art. 36 alin. (2)',
        operation: 'modified',
        date: '2026-11-06',
        amendingAct: 'Legea 207/2026',
      },
    ]);
  });

  it('answers 404 for a change that does not exist', async () => {
    mockUpstream({ legal_changes: () => Response.json([]) });
    const response = await request(`/legislation/changes/${applied.id}`);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });

  it('answers 400 for an id that is not a UUID', async () => {
    mockUpstream({});
    const response = await request('/legislation/changes/not-a-change');
    expect(response.status).toBe(400);
  });
});
