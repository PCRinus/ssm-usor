import {
  adminImportDetailSchema,
  adminImportFileLinkSchema,
  adminImportListSchema,
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

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const goneId = '7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const ownCopyId = 'c0c0c0c0-0000-4000-8000-000000000001';
const partCopyId = 'c0c0c0c0-0000-4000-8000-000000000002';
const secretKey = 'sb_secret_test_key_admin_imports';
const folder = `${organizationId}/${importId}`;

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
  actor: string | null;
  aal: string | null;
};

const listRow = {
  import_id: importId,
  organization_id: organizationId,
  organization_name: 'Protecția Muncii Expert SRL',
  row_deleted: false,
  kind: 'client',
  status: 'confirmed',
  created_at: '2026-11-03T08:00:00+00:00',
  ended_at: '2026-11-03T09:10:00+00:00',
  reading_version: { models: { reading: 'gpt-5.2' }, prompts: 'a1b2c3d4e5f6' },
  reading_flags: {
    files: {
      total: 4,
      byKind: {},
      unreadable: [{ file: 2, kind: 'pdf' }],
      setAside: 0,
      forEmployees: 0,
      otherCompany: 0,
    },
    found: {},
    emptyRequired: ['client.cui'],
    checks: { quote_not_found: 3, 'person.invalid_cnp': 1 },
    nothingFound: [],
    proposedValues: 40,
  },
  quality: { client: { changed: 6, unticked: 4, kept: 10 } },
  cost_usd: 0.42,
  reported_at: '2026-11-03T09:20:00+00:00',
  copy_written_at: '2026-11-03T09:10:05+00:00',
  copy_expires_at: '2027-11-03T09:10:00+00:00',
  copy_removed_at: null,
  part_copies: 1,
  total: 3,
};

const goneRow = {
  ...listRow,
  import_id: goneId,
  row_deleted: true,
  kind: null,
  status: null,
  created_at: null,
  reading_version: null,
  reading_flags: null,
  quality: null,
  cost_usd: null,
  reported_at: null,
  part_copies: 0,
};

const importRow = {
  id: importId,
  organization_id: organizationId,
  kind: 'client',
  status: 'confirmed',
  failure_reason: null,
  client_id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a',
  into_existing_client: false,
  created_at: '2026-11-03T08:00:00+00:00',
  started_at: '2026-11-03T08:01:00+00:00',
  ready_at: '2026-11-03T08:20:00+00:00',
  confirmed_at: '2026-11-03T09:10:00+00:00',
  abandoned_at: null,
  failed_at: null,
  reported_at: null,
  reported_by: null,
  cost_usd: 0.42,
  input_tokens: 120_000,
  cached_input_tokens: 30_000,
  output_tokens: 9_000,
  reading_version: listRow.reading_version,
  reading_flags: listRow.reading_flags,
  quality: listRow.quality,
  proposal: { client: { legalName: 'Construcții Vest SRL' } },
};

const partRow = {
  import_id: importId,
  organization_id: organizationId,
  part: 'risk_evaluations',
  status: 'confirmed',
  attempt: 1,
  failure_reason: null,
  read_at: '2026-11-03T08:40:00+00:00',
  confirmed_at: '2026-11-03T09:30:00+00:00',
  failed_at: null,
  reported_at: null,
  reported_by: null,
  cost_usd: 0.12,
  reading_version: { models: { risks: 'gpt-5.2' }, prompts: '0f0f0f0f0f0f' },
  reading_flags: { found: { factors: 12 }, checks: { 'factor.level_mismatch': 2 } },
  quality: { factors: { changed: 1, unticked: 0, kept: 11 } },
};

const copyRows = (id: string) =>
  id === importId
    ? [
        {
          id: ownCopyId,
          organization_id: organizationId,
          part: null,
          written_at: '2026-11-03T09:10:05+00:00',
          expires_at: '2027-11-03T09:10:00+00:00',
          removed_at: null,
        },
        {
          id: partCopyId,
          organization_id: organizationId,
          part: 'risk_evaluations',
          written_at: '2026-11-03T09:30:05+00:00',
          expires_at: '2027-11-03T09:30:00+00:00',
          removed_at: null,
        },
      ]
    : id === goneId
      ? [
          {
            id: ownCopyId,
            organization_id: organizationId,
            part: null,
            written_at: '2026-10-01T09:10:05+00:00',
            expires_at: '2027-09-15T09:10:00+00:00',
            removed_at: null,
          },
        ]
      : [];

const objects = (prefix: string) => {
  const base = prefix.replace(/\/$/, '');
  const tree: Record<string, { name: string; id: string | null; size?: number }[]> = {
    [folder]: [
      { name: 'files', id: null },
      { name: 'parts', id: null },
      { name: 'record.json', id: 'o1', size: 2_048 },
    ],
    [`${folder}/files`]: [
      { name: 'f1.pdf', id: 'o2', size: 120_000 },
      { name: 'Fișă Popescu Ion.docx', id: 'o3', size: 40_000 },
    ],
    [`${folder}/parts`]: [{ name: 'risk_evaluations', id: null }],
    [`${folder}/parts/risk_evaluations`]: [
      { name: 'files', id: null },
      { name: 'record.json', id: 'o4', size: 512 },
    ],
    [`${folder}/parts/risk_evaluations/files`]: [
      { name: 'risk_evaluations.1.answer.json', id: 'o5', size: 9_000 },
    ],
    [`${organizationId}/${goneId}`]: [{ name: 'record.json', id: 'o6', size: 300 }],
  };
  return (tree[base] ?? []).map((entry) => ({
    name: entry.name,
    id: entry.id,
    metadata: entry.id ? { size: entry.size } : null,
  }));
};

const records: Record<string, unknown> = {
  [`${folder}/record.json`]: {
    import: importId,
    proposal: { client: { legalName: 'Construcții Vest SRL' } },
    changes: { client: { legalName: 'Construcții Vest S.R.L.' } },
  },
  [`${folder}/parts/risk_evaluations/record.json`]: { part: 'risk_evaluations', proposal: {} },
  [`${organizationId}/${goneId}/record.json`]: { import: goneId, status: 'abandoned' },
};

const fetchMock = vi.fn<typeof fetch>();
let calls: Call[] = [];
let user: typeof admin | typeof member = admin;
let listRows: unknown[] = [];
let copyRowsOverride: unknown[] | null = null;

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
      actor: headers.get('x-audit-actor'),
      aal: headers.get('x-audit-aal'),
    });
    const body = calls.at(-1)!.body as Record<string, unknown>;
    const path = decodeURIComponent(url.pathname);
    const eq = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '');

    if (path === '/auth/v1/user') return Response.json(user);
    if (path === '/rest/v1/rpc/admin_list_imports') {
      const offset = Number(body.p_offset);
      return Response.json(listRows.slice(offset, offset + Number(body.p_limit)));
    }
    if (path === '/rest/v1/rpc/record_admin_event') return Response.json(1);
    if (path === '/rest/v1/imports') {
      return Response.json(eq('id') === importId ? importRow : null);
    }
    if (path === '/rest/v1/import_library_parts') {
      return Response.json(eq('import_id') === importId ? [partRow] : []);
    }
    if (path === '/rest/v1/import_copies')
      return Response.json(copyRowsOverride ?? copyRows(eq('import_id')!));
    if (path === '/rest/v1/organizations') return Response.json({ name: 'Protecția Muncii SRL' });
    if (path === '/storage/v1/object/list/import-copies') {
      return Response.json(objects(String(body.prefix)));
    }
    if (path.startsWith('/storage/v1/object/sign/import-copies/') && method === 'POST') {
      return Response.json({
        signedURL: `${path.slice('/storage/v1'.length)}?token=signed`,
      });
    }
    if (path.startsWith('/storage/v1/object/sign/import-copies/') && method === 'GET') {
      const key = path.slice('/storage/v1/object/sign/import-copies/'.length);
      return key in records ? Response.json(records[key]) : new Response(null, { status: 404 });
    }
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const request = (path: string) =>
  createAdminApp().request(path, { headers: { Authorization: `Bearer ${token}` } }, env);

const events = () =>
  calls.filter((call) => call.url.pathname === '/rest/v1/rpc/record_admin_event');
const storageCalls = () => calls.filter((call) => call.url.pathname.startsWith('/storage/'));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  calls = [];
  user = admin;
  copyRowsOverride = null;
  listRows = [listRow, goneRow, { ...goneRow, import_id: 'aaaaaaaa-0000-4000-8000-000000000003' }];
  mockUpstream();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /admin/imports', () => {
  it('refuses a member without the admin claim before reading anything', async () => {
    user = member;
    const response = await request('/admin/imports');
    expect(response.status).toBe(403);
    expect(calls.map((call) => call.url.pathname)).toEqual(['/auth/v1/user']);
  });

  it('lists every organization’s imports with the secret key, as a page with its total', async () => {
    const response = await request(
      '/admin/imports?page=1&pageSize=2&kind=client&status=confirmed&reported=true&hasCopy=true'
    );

    expect(response.status).toBe(200);
    const page = adminImportListSchema.parse(await response.json());
    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    const [rpc] = calls.filter((call) => call.url.pathname === '/rest/v1/rpc/admin_list_imports');
    expect(rpc!.secret).toBe(true);
    expect(rpc!.body).toEqual({
      p_kind: 'client',
      p_status: 'confirmed',
      p_reported: true,
      p_has_copy: true,
      p_limit: 2,
      p_offset: 0,
    });
    expect(page.items[0]).toEqual({
      id: importId,
      organization: { id: organizationId, name: 'Protecția Muncii Expert SRL' },
      rowDeleted: false,
      kind: 'client',
      status: 'confirmed',
      createdAt: '2026-11-03T08:00:00+00:00',
      endedAt: '2026-11-03T09:10:00+00:00',
      readingVersion: 'a1b2c3d4',
      flags: { unreadableFiles: 1, nothingFound: 0, emptyRequired: 1, checks: 4 },
      changedShare: 0.25,
      costUsd: 0.42,
      reportedAt: '2026-11-03T09:20:00+00:00',
      copy: {
        writtenAt: '2026-11-03T09:10:05+00:00',
        expiresAt: '2027-11-03T09:10:00+00:00',
        removedAt: null,
      },
      partCopies: 1,
    });
    expect(page.items[1]).toMatchObject({
      id: goneId,
      rowDeleted: true,
      kind: null,
      status: null,
      flags: null,
      changedShare: null,
      costUsd: null,
    });
  });

  it('pages on, and still counts the whole list on a page past its end', async () => {
    const second = adminImportListSchema.parse(
      await (await request('/admin/imports?page=2&pageSize=2')).json()
    );
    expect(second.items.map((item) => item.id)).toEqual(['aaaaaaaa-0000-4000-8000-000000000003']);

    const past = adminImportListSchema.parse(
      await (await request('/admin/imports?page=9&pageSize=2')).json()
    );
    expect(past).toMatchObject({ items: [], page: 9, total: 3 });
  });

  it('refuses a page whose offset the database could not hold, before reading the list', async () => {
    const response = await request('/admin/imports?page=2147483647&pageSize=100');
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
    expect(calls.map((call) => call.url.pathname)).not.toContain('/rest/v1/rpc/admin_list_imports');
  });

  it('refuses a filter it does not know', async () => {
    const response = await request('/admin/imports?status=lost');
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
  });
});

describe('GET /admin/imports/{id}', () => {
  it('records the copy opened by the admin before reading it, then answers the import, its parts and its copy', async () => {
    const response = await request(`/admin/imports/${importId}`);

    expect(response.status).toBe(200);
    const detail = adminImportDetailSchema.parse(await response.json());
    expect(events()).toHaveLength(1);
    expect(events()[0]!.body).toEqual({
      p_action: 'import_copy_opened',
      p_table_name: 'import_copies',
      p_row_id: ownCopyId,
      p_organization_id: organizationId,
      p_details: { import_id: importId },
    });
    expect(events()[0]!.secret).toBe(true);
    expect(events()[0]!.actor).toBe(admin.id);
    expect(events()[0]!.aal).toBe('aal2');
    expect(calls.indexOf(events()[0]!)).toBeLessThan(calls.indexOf(storageCalls()[0]!));

    expect(detail.organization).toEqual({ id: organizationId, name: 'Protecția Muncii SRL' });
    expect(detail.import).toMatchObject({
      kind: 'client',
      status: 'confirmed',
      costUsd: 0.42,
      flags: { unreadableFiles: 1, nothingFound: 0, emptyRequired: 1, checks: 4 },
      changedShare: 0.25,
    });
    expect(JSON.stringify(detail.import)).not.toContain('Construcții Vest SRL');
    expect(detail.parts).toMatchObject([
      { part: 'risk_evaluations', status: 'confirmed', flags: { checks: 2 }, changedShare: 1 / 12 },
    ]);
    expect(detail.copies.map((copy) => copy.id)).toEqual([ownCopyId, partCopyId]);
    expect(detail.record).toEqual(records[`${folder}/record.json`]);
    expect(detail.partRecords).toEqual([
      { part: 'risk_evaluations', record: { part: 'risk_evaluations', proposal: {} } },
    ]);
    expect(detail.files).toEqual([
      { path: 'files/f1.pdf', sizeBytes: 120_000 },
      { path: 'files/Fișă Popescu Ion.docx', sizeBytes: 40_000 },
      { path: 'parts/risk_evaluations/files/risk_evaluations.1.answer.json', sizeBytes: 9_000 },
      { path: 'parts/risk_evaluations/record.json', sizeBytes: 512 },
      { path: 'record.json', sizeBytes: 2_048 },
    ]);
  });

  it('shows what the copy holds of an import whose row is gone', async () => {
    const detail = adminImportDetailSchema.parse(
      await (await request(`/admin/imports/${goneId}`)).json()
    );
    expect(detail).toMatchObject({
      id: goneId,
      import: null,
      parts: [],
      record: { import: goneId, status: 'abandoned' },
      files: [{ path: 'record.json', sizeBytes: 300 }],
    });
    expect(events()).toHaveLength(1);
  });

  it('records nothing and reads no storage for an import without a copy', async () => {
    copyRowsOverride = [];
    const detail = adminImportDetailSchema.parse(
      await (await request(`/admin/imports/${importId}`)).json()
    );
    expect(detail).toMatchObject({ copies: [], record: null, partRecords: [], files: [] });
    expect(events()).toHaveLength(0);
    expect(storageCalls()).toHaveLength(0);
  });

  it('answers 404 for an import with neither row nor copy, and for an id that is not one', async () => {
    expect((await request('/admin/imports/aaaaaaaa-0000-4000-8000-00000000ffff')).status).toBe(404);
    expect((await request('/admin/imports/not-an-id')).status).toBe(404);
    expect(events()).toHaveLength(0);
  });
});

describe('GET /admin/imports/{id}/files', () => {
  const link = (path: string) =>
    request(`/admin/imports/${importId}/files?path=${encodeURIComponent(path)}`);

  it.each([
    '../other-import/record.json',
    'files/../../x',
    '%2e%2e/other-import/record.json',
    '/record.json',
    'files//f1.pdf',
    'files\\f1.pdf',
    './record.json',
  ])('refuses %s, outside the copy’s folder or not a plain name', async (path) => {
    const response = await link(path);
    expect(response.status).toBe(400);
    expect(events()).toHaveLength(0);
    expect(storageCalls()).toHaveLength(0);
  });

  it('answers 404 for a file the copy does not hold, recording nothing', async () => {
    const response = await link('files/missing.pdf');
    expect(response.status).toBe(404);
    expect(events()).toHaveLength(0);
    expect(storageCalls().some((call) => call.url.pathname.includes('/object/sign/'))).toBe(false);
  });

  it('records the file opened, then hands out a link that lasts 60 seconds', async () => {
    const response = await link('files/Fișă Popescu Ion.docx');

    expect(response.status).toBe(200);
    const answer = adminImportFileLinkSchema.parse(await response.json());
    expect(decodeURIComponent(answer.url)).toBe(
      `https://example.supabase.co/storage/v1/object/sign/import-copies/${folder}/files/Fișă Popescu Ion.docx?token=signed`
    );
    expect(events().map((call) => call.body)).toEqual([
      {
        p_action: 'import_copy_file_opened',
        p_table_name: 'import_copies',
        p_row_id: ownCopyId,
        p_organization_id: organizationId,
        p_details: { import_id: importId, path: 'files/Fișă Popescu Ion.docx' },
      },
    ]);
    const sign = storageCalls().find((call) => call.url.pathname.includes('/object/sign/'))!;
    expect(sign.body).toEqual({ expiresIn: 60 });
    expect(calls.indexOf(events()[0]!)).toBeLessThan(calls.indexOf(sign));
  });

  it('names the part’s copy for a file under its folder', async () => {
    const response = await link('parts/risk_evaluations/files/risk_evaluations.1.answer.json');
    expect(response.status).toBe(200);
    expect(events()[0]!.body).toMatchObject({ p_row_id: partCopyId });
  });

  it('answers 404 for a part without a copy kept', async () => {
    const response = await link('parts/instructions_ssm/record.json');
    expect(response.status).toBe(404);
    expect(events()).toHaveLength(0);
  });
});
