import {
  adminLegalActListSchema,
  adminLegalActSchema,
  adminLegalChangeDetailSchema,
  adminLegalChangeListSchema,
  adminLegalCheckRunListSchema,
  apiErrorResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminApp } from '../../admin-app';
import type { ApiEnv } from '../../lib/env';

const admin = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'mircea@example.ro',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email', role: 'admin' },
  user_metadata: {},
};
const member = { ...admin, app_metadata: { provider: 'email' } };

const changeId = 'd1d1d1d1-0000-4000-8000-000000000001';
const versionId = 'a1a1a1a1-0000-4000-8000-000000000001';
const secretKey = 'sb_secret_test_key_admin_legislation';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: secretKey,
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'ES256', typ: 'JWT' })}.${encode({ sub: admin.id, aal: 'aal2' })}.c2ln`;

type Call = {
  method: string;
  url: URL;
  body: unknown;
  secret: boolean;
  ownToken: boolean;
  actor: string | null;
};

const act = { id: 'oug-195-2002', name: 'O.U.G. 195/2002', portal_id: 41006 };

const helmetOld =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.';
const helmetNew =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru motocicliști.';

const changeRow = {
  id: changeId,
  act_id: act.id,
  seen_at: '2026-11-07T03:20:00+00:00',
  consolidated_on: '2026-11-06',
  compared_with: '2026-08-25',
  outcome: 'quote_differs',
  assessed_at: '2026-11-13T03:21:00+00:00',
  amending_act: 'LEGE 207 03/11/2026',
  amending_acts: [
    {
      name: 'Legea 207/2026',
      kind: 'LEGEA',
      number: '207',
      date: '2026-11-03',
      portalId: 301234,
      gazette: { number: '912', date: '2026-11-04' },
    },
    { name: 'O.U.G. 9/2026' },
  ],
  resolution: 'open',
  resolved_at: null,
  resolved_by_note: null,
  act,
  verified: { verified_consolidated_on: '2026-08-25' },
  amended_units: [
    {
      unit: 'Art. 36 alin. (2)',
      subject: 'Alineatul (2), Articolul 36',
      operation: 'modified',
      date: '2026-11-06',
      amendingAct: 'Legea 207/2026',
    },
  ],
  review: ['Art. 6 is referred to without a quote and was amended.'],
};

const passageRow = (overrides: Record<string, unknown>) => ({
  id: 'f1f1f1f1-0000-4000-8000-000000000001',
  manifest: 'ssm',
  template_file: '2.2_general_training_material.docx',
  type_key: 'general_training_material',
  paragraph: 2048,
  citation_form: 'quote',
  locator: 'Art. 36 alin. (1) – (3)',
  article: '36',
  unit_label: 'Art. 36 alin. (2)',
  status: 'changed',
  old_text: helmetOld,
  new_text: helmetNew,
  hunks: [{ old: 'casca', new: 'pe cap cască', before: 'să poarte', after: 'de protecție' }],
  ...overrides,
});

const versionRow = {
  id: versionId,
  version: 4,
  kind: 'legal',
  note: 'Art. 36 alin. (2) din O.U.G. 195/2002, citat în material, preia forma din 6 noiembrie 2026.',
  created_at: '2026-11-08T10:00:00+00:00',
  template: { type_key: 'general_training_material', title: 'Material instruire generală' },
};

const actRow = {
  id: act.id,
  name: act.name,
  portal_id: act.portal_id,
  portal_status: 'in_force',
  verified_consolidated_on: '2026-08-25',
  last_consolidated_on: '2026-11-06',
  last_amending_act: 'LEGE 207 03/11/2026',
  last_checked_at: '2026-11-13T03:20:00+00:00',
  checked_by_hand_on: null,
};

const runRow = (index: number) => ({
  id: `e1e1e1e1-0000-4000-8000-00000000000${index}`,
  started_at: `2026-11-1${index}T03:17:00+00:00`,
  finished_at: `2026-11-1${index}T03:21:00+00:00`,
  status: 'failed',
  acts_checked: 36,
  changes_found: 1,
  acts_skipped: 1,
  errors: [{ act: 'hg-1425-2006', message: 'Page 76337 has no "Forme act" section.' }],
});

const fetchMock = vi.fn<typeof fetch>();
let calls: Call[] = [];
let user: typeof admin | typeof member = admin;
let change: Record<string, unknown> | null = changeRow;
let rpcError: { code: string; message: string } | null = null;
let runs: unknown[] = [];
let listed: unknown[] = [];
let older: unknown[] = [];

function mockUpstream() {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const raw = init?.body;
    calls.push({
      method,
      url,
      body: typeof raw === 'string' && /^[[{]/.test(raw) ? JSON.parse(raw) : raw,
      secret: headers.get('Authorization') === `Bearer ${secretKey}`,
      ownToken: headers.get('Authorization') === `Bearer ${token}`,
      actor: headers.get('x-audit-actor'),
    });
    const path = url.pathname;
    const params = url.searchParams;
    const single = headers.get('Accept') === 'application/vnd.pgrst.object+json';

    if (path === '/auth/v1/user') return Response.json(user);
    if (path.startsWith('/rest/v1/rpc/')) {
      if (rpcError) return Response.json(rpcError, { status: 400 });
      if (path === '/rest/v1/rpc/admin_record_verified_form') {
        return Response.json({ ...actRow, verified_consolidated_on: '2026-11-06' });
      }
      return Response.json(changeRow);
    }
    if (path === '/rest/v1/legal_changes' && params.get('select')?.includes('passages:')) {
      const from = Number(params.get('offset') ?? 0);
      return Response.json(listed.slice(from, from + Number(params.get('limit'))));
    }
    if (path === '/rest/v1/legal_changes' && params.get('consolidated_on')?.startsWith('lt.')) {
      return Response.json(older);
    }
    if (path === '/rest/v1/legal_changes' && params.get('id')) {
      return single ? Response.json(change) : Response.json(change ? [change] : []);
    }
    if (path === '/rest/v1/legal_changes' && method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'Content-Range': '*/0' } });
    }
    if (path === '/rest/v1/legal_change_passages') {
      return Response.json([
        passageRow({
          id: 'f1f1f1f1-0000-4000-8000-000000000002',
          paragraph: 1970,
          citation_form: 'reference',
          locator: null,
          unit_label: 'Art. 36',
          hunks: 'not a list',
        }),
        passageRow({}),
      ]);
    }
    if (path === '/rest/v1/document_template_versions') {
      if (params.get('resolves_legal_change_id')?.startsWith('eq.')) return Response.json([]);
      return Response.json([versionRow]);
    }
    if (path === '/rest/v1/legal_acts') {
      return Response.json([
        {
          ...actRow,
          id: 'lege-319-2006',
          name: 'Legea 319/2006',
          portal_id: 73772,
          open: [{ count: 0 }],
        },
        { ...actRow, open: [{ count: 2 }] },
      ]);
    }
    if (path === '/rest/v1/legal_check_runs') {
      const from = Number(params.get('offset') ?? 0);
      const limit = Number(params.get('limit') ?? 1000);
      if (from >= runs.length && from > 0) {
        return Response.json(
          { code: 'PGRST103', message: 'Requested range not satisfiable' },
          { status: 416 }
        );
      }
      const rows = runs.slice(from, from + limit);
      return Response.json(rows, {
        headers: { 'Content-Range': `${from}-${from + rows.length - 1}/${runs.length}` },
      });
    }
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const request = (path: string, init: RequestInit = {}) =>
  createAdminApp().request(
    path,
    {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
    env
  );

const restCalls = () => calls.filter((call) => call.url.pathname.startsWith('/rest/'));
const rpcCalls = () => calls.filter((call) => call.url.pathname.startsWith('/rest/v1/rpc/'));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  calls = [];
  user = admin;
  change = changeRow;
  rpcError = null;
  runs = [runRow(3), runRow(2), runRow(1)];
  listed = [{ ...changeRow, passages: [{ count: 2 }] }];
  older = [];
  mockUpstream();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin legislation routes', () => {
  it.each([
    ['GET', '/admin/legislation/changes'],
    ['GET', `/admin/legislation/changes/${changeId}`],
    ['POST', `/admin/legislation/changes/${changeId}/no-impact`],
    ['POST', `/admin/legislation/changes/${changeId}/template-version`],
    ['GET', '/admin/legislation/acts'],
    ['PUT', '/admin/legislation/acts/oug-195-2002/verified-form'],
    ['GET', '/admin/legislation/runs'],
  ])(
    'refuse %s %s to a member without the admin claim before reading anything',
    async (method, path) => {
      user = member;
      const response = await request(path, {
        method,
        body: method === 'GET' ? undefined : '{}',
      });
      expect(response.status).toBe(403);
      expect(restCalls()).toEqual([]);
    }
  );
});

describe('GET /admin/legislation/changes', () => {
  it('lists the changes newest first with the secret key, filtered by status and outcome', async () => {
    const response = await request('/admin/legislation/changes?status=open&outcome=quote_differs');

    expect(response.status).toBe(200);
    const list = adminLegalChangeListSchema.parse(await response.json());
    expect(list.items).toEqual([
      expect.objectContaining({
        id: changeId,
        act: { id: act.id, name: act.name, portalId: 41006 },
        comparedWith: '2026-08-25',
        outcome: 'quote_differs',
        amendingActs: [
          { name: 'Legea 207/2026', adoptedOn: '2026-11-03', portalId: 301234 },
          { name: 'O.U.G. 9/2026', adoptedOn: null, portalId: null },
        ],
        passageCount: 2,
      }),
    ]);
    const [read] = restCalls();
    expect(read).toMatchObject({ secret: true, actor: admin.id });
    expect(read!.url.searchParams.get('resolution')).toBe('eq.open');
    expect(read!.url.searchParams.get('outcome')).toBe('eq.quote_differs');
    expect(read!.url.searchParams.get('order')).toBe('seen_at.desc,consolidated_on.desc,id.asc');
  });

  it('reads every change past the thousand rows the database answers at once', async () => {
    listed = Array.from({ length: 1001 }, () => ({ ...changeRow, passages: [{ count: 0 }] }));

    const list = adminLegalChangeListSchema.parse(
      await (await request('/admin/legislation/changes?status=open')).json()
    );

    expect(list.items).toHaveLength(1001);
    expect(restCalls().map((call) => call.url.searchParams.get('offset'))).toEqual(['0', '1000']);
    expect(restCalls().every((call) => call.url.searchParams.get('resolution') === 'eq.open')).toBe(
      true
    );
  });

  it('reads the resolved and the unassessed changes', async () => {
    await request('/admin/legislation/changes?status=resolved&outcome=unassessed');

    const [read] = restCalls();
    expect(read!.url.searchParams.get('resolution')).toBe('neq.open');
    expect(read!.url.searchParams.get('outcome')).toBe('is.null');
  });

  it('refuses an unknown filter', async () => {
    const response = await request('/admin/legislation/changes?status=closed');

    expect(response.status).toBe(400);
    expect(restCalls()).toEqual([]);
  });
});

describe('GET /admin/legislation/changes/:id', () => {
  it('shows the passages in template order, the review and the versions that can answer it', async () => {
    const response = await request(`/admin/legislation/changes/${changeId}`);

    expect(response.status).toBe(200);
    const detail = adminLegalChangeDetailSchema.parse(await response.json());
    expect(detail.review).toEqual(['Art. 6 is referred to without a quote and was amended.']);
    expect(detail.amendedUnits).toEqual([
      expect.objectContaining({
        unit: 'Art. 36 alin. (2)',
        subject: 'Alineatul (2), Articolul 36',
      }),
    ]);
    expect(detail.passages.map((passage) => [passage.paragraph, passage.hunks.length])).toEqual([
      [1970, 0],
      [2048, 1],
    ]);
    expect(detail.passages[1]).toMatchObject({
      typeKey: 'general_training_material',
      locator: 'Art. 36 alin. (1) – (3)',
      oldText: helmetOld,
      newText: helmetNew,
    });
    expect(detail.resolvingVersion).toBeNull();
    expect(detail.candidateVersions).toEqual([
      expect.objectContaining({ id: versionId, typeKey: 'general_training_material', version: 4 }),
    ]);

    const candidates = restCalls().find(
      (call) =>
        call.url.pathname === '/rest/v1/document_template_versions' &&
        !call.url.searchParams.has('resolves_legal_change_id', `eq.${changeId}`)
    )!;
    expect(candidates.secret).toBe(true);
    expect(Object.fromEntries(candidates.url.searchParams)).toMatchObject({
      'template.organization_id': 'is.null',
      'template.type_key': 'in.(general_training_material)',
      resolves_legal_change_id: 'is.null',
      kind: 'neq.layout',
      note: 'not.is.null',
      created_at: `gt.${changeRow.seen_at}`,
    });
    expect(detail.awaitingAssessment).toBe(false);
    expect(detail.olderOpenChanges).toEqual([]);
  });

  it('names the act’s older open changes, oldest first, which are resolved before it', async () => {
    older = [{ id: 'd1d1d1d1-0000-4000-8000-000000000002', consolidated_on: '2026-10-30' }];

    const detail = adminLegalChangeDetailSchema.parse(
      await (await request(`/admin/legislation/changes/${changeId}`)).json()
    );

    expect(detail.olderOpenChanges).toEqual([
      { id: 'd1d1d1d1-0000-4000-8000-000000000002', consolidatedOn: '2026-10-30' },
    ]);
    const read = restCalls().find((call) => call.url.searchParams.has('consolidated_on'))!;
    expect(Object.fromEntries(read.url.searchParams)).toMatchObject({
      act_id: `eq.${act.id}`,
      resolution: 'eq.open',
      consolidated_on: `lt.${changeRow.consolidated_on}`,
      order: 'consolidated_on.asc,id.asc',
    });
  });

  it.each([
    ['after the verified form', '2026-08-25', true],
    ['at or before the verified form, which the check never assesses', '2026-11-06', false],
    ['of an act with no verified form', null, true],
  ])('is awaiting the check while not assessed %s', async (_, verifiedOn, awaiting) => {
    change = {
      ...changeRow,
      outcome: null,
      assessed_at: null,
      verified: { verified_consolidated_on: verifiedOn },
    };

    const detail = adminLegalChangeDetailSchema.parse(
      await (await request(`/admin/legislation/changes/${changeId}`)).json()
    );

    expect(detail.awaitingAssessment).toBe(awaiting);
  });

  it('offers no version for a resolved change', async () => {
    change = { ...changeRow, resolution: 'no_impact', resolved_at: '2026-11-13T09:00:00+00:00' };

    const detail = adminLegalChangeDetailSchema.parse(
      await (await request(`/admin/legislation/changes/${changeId}`)).json()
    );

    expect(detail.candidateVersions).toEqual([]);
    expect(
      restCalls().filter((call) => call.url.pathname === '/rest/v1/document_template_versions')
    ).toHaveLength(1);
  });

  it('answers 404 for a change that does not exist or an id that is not one', async () => {
    change = null;
    expect((await request(`/admin/legislation/changes/${changeId}`)).status).toBe(404);
    expect((await request('/admin/legislation/changes/nope')).status).toBe(404);
  });
});

describe('POST /admin/legislation/changes/:id/no-impact', () => {
  it('resolves the change with the admin’s own token and answers with the change read again', async () => {
    const response = await request(`/admin/legislation/changes/${changeId}/no-impact`, {
      method: 'POST',
      body: JSON.stringify({ note: '  Art. 36 alin. (2) nu e citat în niciun document.  ' }),
    });

    expect(response.status).toBe(200);
    adminLegalChangeDetailSchema.parse(await response.json());
    const [write] = rpcCalls();
    expect(write).toMatchObject({
      ownToken: true,
      body: { p_change_id: changeId, p_note: 'Art. 36 alin. (2) nu e citat în niciun document.' },
    });
    expect(write!.url.pathname).toBe('/rest/v1/rpc/admin_resolve_legal_change_no_impact');
  });

  it('refuses a missing note before writing', async () => {
    const response = await request(`/admin/legislation/changes/${changeId}/no-impact`, {
      method: 'POST',
      body: JSON.stringify({ note: ' ' }),
    });

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe('note');
    expect(rpcCalls()).toEqual([]);
  });

  it.each([
    ['LGA01', 409, 'legal_change_not_open'],
    ['LGA05', 422, 'change_not_assessed'],
    ['LGA06', 422, 'older_change_open'],
    ['P0002', 404, undefined],
    ['42501', 403, undefined],
  ])('answers the database’s %s with %i', async (code, status, reason) => {
    rpcError = { code, message: 'refused' };

    const response = await request(`/admin/legislation/changes/${changeId}/no-impact`, {
      method: 'POST',
      body: JSON.stringify({ note: 'Fără impact.' }),
    });

    expect(response.status).toBe(status);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(reason);
  });
});

describe('POST /admin/legislation/changes/:id/template-version', () => {
  it('links the version with the admin’s own token', async () => {
    const response = await request(`/admin/legislation/changes/${changeId}/template-version`, {
      method: 'POST',
      body: JSON.stringify({ templateVersionId: versionId }),
    });

    expect(response.status).toBe(200);
    const [write] = rpcCalls();
    expect(write!.url.pathname).toBe('/rest/v1/rpc/admin_link_legal_change');
    expect(write).toMatchObject({
      ownToken: true,
      body: { p_change_id: changeId, p_template_version_id: versionId },
    });
  });

  it.each([
    ['LGA02', 'template_version_cannot_answer'],
    ['LGA05', 'change_not_assessed'],
    ['LGA06', 'older_change_open'],
  ])('answers the database’s %s with 422 %s', async (code, reason) => {
    rpcError = { code, message: 'refused' };

    const response = await request(`/admin/legislation/changes/${changeId}/template-version`, {
      method: 'POST',
      body: JSON.stringify({ templateVersionId: versionId }),
    });

    expect(response.status).toBe(422);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(reason);
  });

  it('does not read an invalid parameter as a note, which the link has none of', async () => {
    rpcError = { code: '22023', message: 'invalid' };

    const response = await request(`/admin/legislation/changes/${changeId}/template-version`, {
      method: 'POST',
      body: JSON.stringify({ templateVersionId: versionId }),
    });

    expect(response.status).toBe(500);
    expect(apiErrorResponseSchema.parse(await response.json()).issues).toBeUndefined();
  });
});

describe('GET /admin/legislation/acts', () => {
  it('lists the acts by name with their open changes', async () => {
    const response = await request('/admin/legislation/acts');

    expect(response.status).toBe(200);
    const { items } = adminLegalActListSchema.parse(await response.json());
    expect(items.map((item) => [item.name, item.openChanges])).toEqual([
      ['Legea 319/2006', 0],
      ['O.U.G. 195/2002', 2],
    ]);
    const [read] = restCalls();
    expect(restCalls()).toHaveLength(1);
    expect(read!.secret).toBe(true);
    expect(read!.url.searchParams.get('select')).toContain('open:legal_changes(count)');
    expect(read!.url.searchParams.get('open.resolution')).toBe('eq.open');
  });
});

describe('PUT /admin/legislation/acts/:id/verified-form', () => {
  it('records the form with the admin’s own token', async () => {
    const response = await request('/admin/legislation/acts/oug-195-2002/verified-form', {
      method: 'PUT',
      body: JSON.stringify({ consolidatedOn: '2026-11-06' }),
    });

    expect(response.status).toBe(200);
    expect(adminLegalActSchema.parse(await response.json())).toMatchObject({
      verifiedConsolidatedOn: '2026-11-06',
      openChanges: 0,
    });
    const [write] = rpcCalls();
    expect(write!.url.pathname).toBe('/rest/v1/rpc/admin_record_verified_form');
    expect(write).toMatchObject({
      ownToken: true,
      body: { p_act_id: 'oug-195-2002', p_consolidated_on: '2026-11-06' },
    });
  });

  it('refuses a date that is not one before writing, and a form not seen after', async () => {
    const invalid = await request('/admin/legislation/acts/oug-195-2002/verified-form', {
      method: 'PUT',
      body: JSON.stringify({ consolidatedOn: '6 noiembrie' }),
    });
    expect(invalid.status).toBe(400);
    expect(rpcCalls()).toEqual([]);

    rpcError = { code: 'LGA03', message: 'refused' };
    const unseen = await request('/admin/legislation/acts/oug-195-2002/verified-form', {
      method: 'PUT',
      body: JSON.stringify({ consolidatedOn: '2026-12-01' }),
    });
    expect(unseen.status).toBe(422);
    expect(apiErrorResponseSchema.parse(await unseen.json()).reason).toBe('form_not_seen');
  });

  it('refuses a form while a change of the act at or before it is open', async () => {
    rpcError = { code: 'LGA04', message: 'refused' };

    const response = await request('/admin/legislation/acts/oug-195-2002/verified-form', {
      method: 'PUT',
      body: JSON.stringify({ consolidatedOn: '2026-11-06' }),
    });

    expect(response.status).toBe(422);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'open_changes_at_or_before'
    );
  });
});

describe('GET /admin/legislation/runs', () => {
  it('lists the runs newest first as a page with its total', async () => {
    const response = await request('/admin/legislation/runs?page=1&pageSize=2');

    expect(response.status).toBe(200);
    const page = adminLegalCheckRunListSchema.parse(await response.json());
    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(page.items[0]).toMatchObject({
      status: 'failed',
      errors: [{ act: 'hg-1425-2006', kind: 'other' }],
    });
    expect(restCalls()[0]!.url.searchParams.get('order')).toBe('started_at.desc,id.asc');
  });

  it('answers a page past the end with no runs and the total', async () => {
    const page = adminLegalCheckRunListSchema.parse(
      await (await request('/admin/legislation/runs?page=5&pageSize=2')).json()
    );

    expect(page).toMatchObject({ items: [], total: 3 });
  });
});
