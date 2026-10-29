import { toProposal } from '@ssm-usor/import';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv, ImportMessage } from '../../lib/env';

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
const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const splitId = '7a2f3e4d-5c6b-4d7e-8f90-a1b2c3d4e5f6';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const secretKey = 'sb_secret_test_key_imports';

const sent: ImportMessage[] = [];
const queue = {
  send: vi.fn(async (body: ImportMessage) => {
    sent.push(body);
  }),
  sendBatch: vi.fn(async (messages: Iterable<{ body: ImportMessage }>) => {
    for (const message of messages) sent.push(message.body);
  }),
};

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: secretKey,
  CORS_ORIGINS: 'http://localhost:5173',
  EXTRACTOR_URL: 'http://localhost:3302',
  AI_GATEWAY_URL: 'https://gateway.example/v1/account/ssm-usor',
  AI_GATEWAY_TOKEN: 'gateway-token',
  IMPORT_QUEUE: queue,
};

const fileId = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const storagePath = (id: string, n: number, extension: string) =>
  `${organizationId}/${id}/${fileId(n)}.${extension}`;

function fileRow(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: fileId(n),
    import_id: importId,
    upload_path: `Dosar/Fisier ${n}.docx`,
    original_file_name: `Fisier ${n}.docx`,
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size_bytes: 1000,
    sha256: 'a'.repeat(64),
    storage_path: storagePath(importId, n, 'docx'),
    state: 'uploading',
    document_kind: null,
    reason: null,
    company_name: null,
    company_cui: null,
    page_count: null,
    is_scan: null,
    text_path: null,
    derived_path: null,
    ...overrides,
  };
}

const reading = {
  facts: [
    {
      field: 'client.legalName',
      value: 'BRUTĂRIA FICTIVĂ S.R.L.',
      file: 'Dosar/Fisier 1.docx',
      quote: 'BRUTĂRIA',
      otherCompany: null,
    },
    {
      field: 'client.cui',
      value: '12345674',
      file: 'Dosar/Fisier 1.docx',
      quote: '12345674',
      otherCompany: null,
    },
  ],
  workplaces: [],
  workplaceFacts: [],
  jobPositionFacts: [],
  jobPositions: [],
  responsiblePersons: [],
  fireEquipment: [],
  fireInstallations: [],
  protectiveEquipment: [],
  employees: [],
  notes: [],
};

function importRow(overrides: Record<string, unknown> = {}) {
  return {
    id: importId,
    kind: 'client',
    status: 'uploading',
    client_id: null,
    into_existing_client: false,
    company_name: null,
    company_cui: null,
    source_import_id: null,
    failure_reason: null,
    created_by: user.id,
    created_at: '2026-10-28T09:00:00+00:00',
    started_at: null,
    ready_at: null,
    failed_at: null,
    confirmed_at: null,
    clients: null,
    import_files: [{ count: 2 }],
    version: 0,
    proposal: null,
    changes: null,
    proposal_dropped_at: null,
    read_characters: null,
    ...overrides,
  };
}

type Call = { method: string; url: URL; body: unknown; admin: boolean };
type Handler = (call: Call) => Response | Promise<Response> | undefined;

const fetchMock = vi.fn<typeof fetch>();
let calls: Call[] = [];
let authUser: object = user;

function mockUpstream(handler: Handler = () => undefined) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const raw = init?.body;
    const call: Call = {
      method,
      url,
      body:
        (typeof raw === 'string' && raw.startsWith('{')) ||
        (typeof raw === 'string' && raw.startsWith('['))
          ? JSON.parse(raw)
          : raw,
      admin: headers.get('Authorization') === `Bearer ${secretKey}`,
    };
    calls.push(call);
    if (url.pathname === '/auth/v1/user') return Response.json(authUser);
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json([
        { user_id: user.id, organization_id: organizationId, role: 'specialist', access: 'full' },
      ]);
    }
    if (url.pathname === '/rest/v1/profiles') {
      return Response.json([{ user_id: user.id, full_name: 'Ana Popescu' }]);
    }
    const custom = handler(call);
    if (custom) return custom;
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const request = (path: string, method = 'GET', body?: unknown, bindings = env) =>
  createApp().request(
    path,
    {
      method,
      headers: {
        Authorization: 'Bearer user-token',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    bindings
  );

const callsTo = (pathname: string, method?: string) =>
  calls.filter((call) => call.url.pathname === pathname && (!method || call.method === method));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  calls = [];
  authUser = user;
  sent.length = 0;
  queue.send.mockClear();
  queue.sendBatch.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /imports', () => {
  it('answers that imports are unavailable without the gateway settings', async () => {
    mockUpstream();
    const response = await createApp().request(
      '/imports',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
        body: '{}',
      },
      { ...env, AI_GATEWAY_TOKEN: undefined }
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: 'import_unavailable' });
  });

  it('creates an import into an existing client, as the member, with the secret key', async () => {
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/clients') {
        return Response.json({ id: clientId, stage: 'client', archived_at: null });
      }
      if (url.pathname === '/rest/v1/imports' && method === 'POST') {
        return Response.json({ id: importId }, { status: 201 });
      }
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(
          importRow({
            client_id: clientId,
            into_existing_client: true,
            clients: { id: clientId, legal_name: 'BRUTĂRIA' },
          })
        );
      }
    });
    const response = await request('/imports', 'POST', { clientId });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      import: {
        id: importId,
        status: 'uploading',
        client: { id: clientId, legalName: 'BRUTĂRIA' },
        intoExistingClient: true,
        fileCount: 2,
        createdBy: { id: user.id, fullName: 'Ana Popescu' },
      },
    });
    const insert = callsTo('/rest/v1/imports', 'POST')[0]!;
    expect(insert.admin).toBe(true);
    expect(insert.body).toMatchObject({
      organization_id: organizationId,
      kind: 'client',
      client_id: clientId,
      into_existing_client: true,
      created_by: user.id,
    });
  });

  it('refuses a lead', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/clients'
        ? Response.json({ id: clientId, stage: 'lead', archived_at: null })
        : undefined
    );
    const response = await request('/imports', 'POST', { clientId });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'client_is_lead' });
  });
});

describe('POST /imports/{importId}/files', () => {
  const upload = (uploadPath: string, mimeType = 'application/pdf') => ({
    uploadPath,
    mimeType,
    sizeBytes: 1000,
    sha256: 'b'.repeat(64),
  });

  it('registers the files and says where the browser uploads each', async () => {
    mockUpstream(({ url, method, body }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_files' && method === 'GET') return Response.json([]);
      if (url.pathname === '/rest/v1/import_files' && method === 'POST') {
        return Response.json(
          (body as { upload_path: string }[]).map((row, index) => ({
            id: fileId(index + 1),
            upload_path: row.upload_path,
            storage_path: storagePath(importId, index + 1, 'pdf'),
          })),
          { status: 201 }
        );
      }
    });
    const response = await request(`/imports/${importId}/files`, 'POST', {
      files: [upload('Dosar/Decizia 1.pdf'), upload('Dosar/PSI/Plan.PDF')],
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      files: [
        {
          id: fileId(1),
          uploadPath: 'Dosar/Decizia 1.pdf',
          bucket: 'imports',
          storagePath: storagePath(importId, 1, 'pdf'),
        },
        {
          id: fileId(2),
          uploadPath: 'Dosar/PSI/Plan.PDF',
          bucket: 'imports',
          storagePath: storagePath(importId, 2, 'pdf'),
        },
      ],
    });
    const insert = callsTo('/rest/v1/import_files', 'POST')[0]!;
    expect(insert.admin).toBe(true);
    expect((insert.body as Record<string, unknown>[])[1]).toMatchObject({
      import_id: importId,
      organization_id: organizationId,
      upload_path: 'Dosar/PSI/Plan.PDF',
      original_file_name: 'Plan.PDF',
    });
  });

  it('refuses a path twice, an extension that is not the type, and a path that climbs out', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([fileRow(1, { upload_path: 'Dosar/Decizia 1.pdf' })]);
      }
    });
    const twice = await request(`/imports/${importId}/files`, 'POST', {
      files: [upload('Dosar/Decizia 1.pdf')],
    });
    expect(twice.status).toBe(409);
    expect(await twice.json()).toMatchObject({ reason: 'import_duplicate_path' });

    const mismatch = await request(`/imports/${importId}/files`, 'POST', {
      files: [upload('Dosar/Poza.jpg', 'application/pdf')],
    });
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({ reason: 'import_type_mismatch' });

    const climbing = await request(`/imports/${importId}/files`, 'POST', {
      files: [upload('../etc/x.pdf')],
    });
    expect(climbing.status).toBe(400);
  });

  it('answers past the caps as the database does', async () => {
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_files' && method === 'GET') {
        return Response.json(Array.from({ length: 150 }, (_, index) => fileRow(index + 1)));
      }
    });
    const response = await request(`/imports/${importId}/files`, 'POST', {
      files: [upload('Dosar/Unul.pdf')],
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'import_too_large' });
  });
});

describe('POST /imports/{importId}/start', () => {
  it('drops the files that never arrived and queues one message per file', async () => {
    let status = 'uploading';
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports' && method === 'PATCH') {
        status = 'preparing';
        return Response.json([{ id: importId }]);
      }
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow({ status }));
      if (url.pathname === '/rest/v1/import_files' && method === 'GET') {
        return Response.json([fileRow(1), fileRow(2), fileRow(3)]);
      }
      if (url.pathname === '/rest/v1/import_files') return new Response(null, { status: 204 });
      if (url.pathname === '/storage/v1/object/list/imports') {
        return Response.json([
          { name: `${fileId(1)}.docx`, metadata: { size: 1000 } },
          { name: `${fileId(3)}.docx`, metadata: { size: 1000 } },
        ]);
      }
    });
    const response = await request(`/imports/${importId}/start`, 'POST');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ import: { status: 'preparing' } });
    const deleted = callsTo('/rest/v1/import_files', 'DELETE')[0]!;
    expect(deleted.url.searchParams.get('id')).toBe(`in.(${fileId(2)})`);
    const marked = callsTo('/rest/v1/import_files', 'PATCH')[0]!;
    expect(marked.body).toEqual({ state: 'uploaded' });
    expect(marked.url.searchParams.get('id')).toBe(`in.(${fileId(1)},${fileId(3)})`);
    expect(callsTo('/storage/v1/object/list/imports')[0]!.body).toMatchObject({
      prefix: `${organizationId}/${importId}`,
    });
    expect(sent).toEqual([
      { type: 'prepare', importId, fileId: fileId(1) },
      { type: 'prepare', importId, fileId: fileId(3) },
    ]);
  });

  it('drops a file whose object is not the size declared, and removes the object', async () => {
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports' && method === 'PATCH') {
        return Response.json([{ id: importId }]);
      }
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_files' && method === 'GET') {
        return Response.json([fileRow(1), fileRow(2)]);
      }
      if (url.pathname === '/rest/v1/import_files') return new Response(null, { status: 204 });
      if (url.pathname === '/storage/v1/object/list/imports') {
        return Response.json([
          { name: `${fileId(1)}.docx`, metadata: { size: 1000 } },
          { name: `${fileId(2)}.docx`, metadata: { size: 20 * 1024 * 1024 } },
        ]);
      }
      if (url.pathname === '/storage/v1/object/imports' && method === 'DELETE') {
        return Response.json([]);
      }
    });
    const response = await request(`/imports/${importId}/start`, 'POST');

    expect(response.status).toBe(200);
    expect(callsTo('/storage/v1/object/imports', 'DELETE')[0]!.body).toEqual({
      prefixes: [storagePath(importId, 2, 'docx')],
    });
    const deleted = callsTo('/rest/v1/import_files', 'DELETE')[0]!;
    expect(deleted.url.searchParams.get('id')).toBe(`in.(${fileId(2)})`);
    expect(sent).toEqual([{ type: 'prepare', importId, fileId: fileId(1) }]);
  });

  it('answers that nothing arrived', async () => {
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_files' && method === 'GET')
        return Response.json([fileRow(1)]);
      if (url.pathname === '/rest/v1/import_files') return new Response(null, { status: 204 });
      if (url.pathname === '/storage/v1/object/list/imports') return Response.json([]);
    });
    const response = await request(`/imports/${importId}/start`, 'POST');
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'import_empty' });
    expect(sent).toEqual([]);
  });
});

describe('PUT /imports/{importId}/changes', () => {
  it('answers a save on an old version as a conflict', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/rpc/save_import_changes'
        ? Response.json(
            { code: 'IMP02', message: 'The import was saved since it was read.' },
            { status: 400 }
          )
        : undefined
    );
    const response = await request(`/imports/${importId}/changes`, 'PUT', {
      version: 2,
      changes: { fields: { 'client.locality': { value: 'Lugoj' } }, items: {} },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_changed' });
    expect(callsTo('/rest/v1/rpc/save_import_changes')[0]!.body).toEqual({
      p_import_id: importId,
      p_expected_version: 2,
      p_changes: { fields: { 'client.locality': { value: 'Lugoj' } }, items: {} },
    });
  });

  it('saves and answers the next version', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/rpc/save_import_changes' ? Response.json(3) : undefined
    );
    const response = await request(`/imports/${importId}/changes`, 'PUT', {
      version: 2,
      changes: {},
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 3 });
  });
});

describe('GET /imports/{importId}', () => {
  it('shows the files, the progress, the other companies and what blocks confirming', async () => {
    const proposal = { ...toProposal(reading), registeredCompany: null };
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(
          importRow({
            status: 'ready',
            ready_at: '2026-10-28T09:10:00+00:00',
            version: 1,
            proposal,
          })
        );
      }
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([
          fileRow(1, { state: 'read' }),
          fileRow(2, {
            state: 'other_company',
            company_name: 'ATELIERUL INVENTAT S.R.L.',
            company_cui: '87654329',
          }),
          fileRow(3, { state: 'read', mime_type: 'image/jpeg', is_scan: true }),
        ]);
      }
    });
    const response = await request(`/imports/${importId}`);
    const body = (await response.json()) as { import: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.import).toMatchObject({
      status: 'ready',
      version: 1,
      progress: { files: 3, prepared: 3, scans: 1, scansRead: 1 },
      otherCompanies: [
        { name: 'ATELIERUL INVENTAT S.R.L.', cui: '87654329', fileIds: [fileId(2)] },
      ],
      blockers: [],
      changes: null,
    });
    expect((body.import.proposal as { client: unknown }).client).toBeDefined();
  });

  it('keeps the proposal back before the import is ready', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(importRow({ status: 'checking', proposal: toProposal(reading) }));
      }
      if (url.pathname === '/rest/v1/import_files') return Response.json([]);
    });
    const body = (await (await request(`/imports/${importId}`)).json()) as {
      import: { proposal: unknown };
    };
    expect(body.import.proposal).toBeNull();
  });

  describe('usage', () => {
    const step = { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 200, cost_usd: 0.01 };
    const getUsage = async (bindings: ApiEnv['Bindings']) => {
      mockUpstream(({ url }) => {
        if (url.pathname === '/rest/v1/imports') {
          return Response.json(
            importRow({
              status: 'ready',
              read_characters: 410000,
              input_tokens: 182000,
              cached_input_tokens: 31000,
              output_tokens: 6400,
              cost_usd: '0.270000',
              usage_by_step: {
                sorting: step,
                reading: { ...step, input_tokens: 181000, cost_usd: '0.26' },
              },
            })
          );
        }
        if (url.pathname === '/rest/v1/import_files') return Response.json([]);
      });
      const body = (await (
        await request(`/imports/${importId}`, 'GET', undefined, bindings)
      ).json()) as {
        import: { usage?: unknown };
      };
      return body.import.usage;
    };

    it('serves the cost and tokens as numbers outside production', async () => {
      for (const environment of ['non-prod', undefined]) {
        expect(await getUsage({ ...env, ENVIRONMENT: environment })).toEqual({
          costUsd: 0.27,
          inputTokens: 182000,
          cachedInputTokens: 31000,
          outputTokens: 6400,
          readCharacters: 410000,
          bySteps: {
            sorting: { costUsd: 0.01, inputTokens: 1000, cachedInputTokens: 0, outputTokens: 200 },
            reading: {
              costUsd: 0.26,
              inputTokens: 181000,
              cachedInputTokens: 0,
              outputTokens: 200,
            },
          },
        });
      }
    });

    it('serves them in production to a platform admin only', async () => {
      const production = { ...env, ENVIRONMENT: 'production' };
      expect(await getUsage(production)).toBeUndefined();
      authUser = { ...user, app_metadata: { provider: 'email', role: 'admin' } };
      expect(await getUsage(production)).toMatchObject({ costUsd: 0.27 });
    });
  });
});

describe('POST /imports/{importId}/confirm', () => {
  const ready = (changes: unknown = null) =>
    importRow({
      status: 'ready',
      ready_at: '2026-10-28T09:10:00+00:00',
      version: 4,
      proposal: {
        ...toProposal(reading),
        registeredCompany: {
          cui: '12345674',
          legalName: 'BRUTĂRIA FICTIVĂ S.R.L.',
          vatPayer: true,
          inactive: false,
        },
      },
      changes,
    });

  it('confirms with the payload the database takes, and queues the copy of the folder', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(
          ready({ fields: { 'client.locality': { value: 'Timișoara' } }, items: {} })
        );
      }
      if (url.pathname === '/rest/v1/rpc/apply_client_import') {
        return Response.json({ client_id: clientId, files: [{}, {}] });
      }
    });
    const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ clientId, fileCount: 2 });
    const rpc = callsTo('/rest/v1/rpc/apply_client_import')[0]!;
    expect(rpc.admin).toBe(false);
    expect(rpc.body).toMatchObject({
      p_import_id: importId,
      p_expected_version: 4,
      p_payload: {
        client: {
          legal_name: 'BRUTĂRIA FICTIVĂ S.R.L.',
          cui: '12345674',
          locality: 'Timișoara',
          vat_payer: true,
        },
        workplaces: [],
        quality: { client: { changed: 1, unticked: 0, kept: 0 } },
      },
    });
    expect(sent).toEqual([{ type: 'copy', importId }]);
  });

  it('lists what still blocks, and confirms nothing', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports'
        ? Response.json(ready({ fields: { 'client.cui': { value: null } }, items: {} }))
        : undefined
    );
    const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      reason: 'import_incomplete',
      issues: [{ path: 'client.cui', message: 'missing' }],
    });
    expect(callsTo('/rest/v1/rpc/apply_client_import')).toEqual([]);
  });

  it('answers a CUI the organization has already', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(ready());
      if (url.pathname === '/rest/v1/rpc/apply_client_import') {
        return Response.json({ code: 'IMP04', message: 'taken' }, { status: 400 });
      }
    });
    const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_client_exists' });
    expect(sent).toEqual([]);
  });

  it('answers a row the client no longer has as a conflict, not an error', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(ready());
      if (url.pathname === '/rest/v1/rpc/apply_client_import') {
        return Response.json({ code: '22023', message: 'no workplace' }, { status: 400 });
      }
    });
    const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_outdated' });
  });

  it('answers a value a table refuses with its section and rule, and logs no value', async () => {
    const logged = vi.mocked(console.error);
    const refusals = [
      {
        code: '23514',
        message:
          'new row for relation "job_position_equipment" violates check constraint "job_position_equipment_duration_by_allocation"',
        details: 'Failing row contains (Substante de curatat (maini), Manusi, 1, null).',
      },
      {
        code: '23502',
        message:
          'null value in column "risk" of relation "job_position_equipment" violates not-null constraint',
        details: 'Failing row contains (null, Manusi).',
      },
      {
        code: '23514',
        message:
          'new row for relation "client_files" violates check constraint "client_files_name_length"',
      },
    ];
    const answers = [];
    for (const refusal of refusals) {
      mockUpstream(({ url }) => {
        if (url.pathname === '/rest/v1/imports') return Response.json(ready());
        if (url.pathname === '/rest/v1/rpc/apply_client_import') {
          return Response.json({ hint: null, ...refusal }, { status: 400 });
        }
      });
      const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });
      expect(response.status).toBe(422);
      answers.push(await response.json());
    }

    expect(answers).toEqual([
      expect.objectContaining({
        error: 'unprocessable',
        reason: 'import_refused',
        issues: [
          {
            path: 'protectiveEquipment',
            message: 'job_position_equipment_duration_by_allocation',
          },
        ],
      }),
      expect.objectContaining({
        issues: [{ path: 'protectiveEquipment', message: 'job_position_equipment_risk_not_null' }],
      }),
      expect.objectContaining({
        issues: [{ path: 'client_files', message: 'client_files_name_length' }],
      }),
    ]);
    expect(logged).toHaveBeenCalledWith(
      'Database request rejected (confirm import): 23514 job_position_equipment_duration_by_allocation'
    );
    expect(JSON.stringify([answers, logged.mock.calls])).not.toMatch(/Manusi|Failing row/);
    expect(sent).toEqual([]);
  });
});

describe('POST /imports/{importId}/split', () => {
  const splitting = (n: number) => ({
    source_path: storagePath(importId, n, 'docx'),
    target_path: storagePath(splitId, n + 7, 'docx'),
  });

  it("takes another company's files into a new import, copying their objects, and starts it", async () => {
    let splitStatus = 'uploading';
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/rpc/split_import') {
        return Response.json({ import_id: splitId, files: [splitting(2)] });
      }
      if (url.pathname === '/rest/v1/imports' && method === 'PATCH') {
        splitStatus = 'preparing';
        return Response.json([{ id: splitId }]);
      }
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(
          importRow({ id: splitId, status: splitStatus, source_import_id: importId })
        );
      }
      if (url.pathname === '/rest/v1/import_files' && method === 'GET') {
        return Response.json([
          fileRow(9, { import_id: splitId, storage_path: storagePath(splitId, 9, 'docx') }),
        ]);
      }
      if (url.pathname === '/rest/v1/import_files') return Response.json([]);
      if (url.pathname === '/storage/v1/object/copy') return Response.json({ Key: 'imports/x' });
      if (url.pathname === '/storage/v1/object/list/imports') {
        return Response.json([{ name: `${fileId(9)}.docx`, metadata: { size: 1000 } }]);
      }
    });
    const response = await request(`/imports/${importId}/split`, 'POST', { fileIds: [fileId(2)] });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      import: { id: splitId, status: 'preparing', sourceImportId: importId },
    });
    const rpc = callsTo('/rest/v1/rpc/split_import')[0]!;
    expect(rpc.admin).toBe(false);
    expect(rpc.body).toEqual({ p_import_id: importId, p_file_ids: [fileId(2)] });
    expect(callsTo('/rest/v1/imports', 'POST')).toEqual([]);
    expect(callsTo('/storage/v1/object/copy')[0]!.body).toMatchObject({
      bucketId: 'imports',
      sourceKey: storagePath(importId, 2, 'docx'),
      destinationKey: storagePath(splitId, 9, 'docx'),
      destinationBucket: 'imports',
    });
    expect(sent).toEqual([{ type: 'prepare', importId: splitId, fileId: fileId(9) }]);
  });

  it('abandons the new import when the objects copied cannot be removed', async () => {
    mockUpstream(({ url, method, body }) => {
      if (url.pathname === '/rest/v1/rpc/split_import') {
        return Response.json({ import_id: splitId, files: [splitting(2), splitting(3)] });
      }
      if (url.pathname === '/rest/v1/rpc/abandon_import')
        return new Response(null, { status: 204 });
      if (url.pathname === '/storage/v1/object/copy') {
        return (body as { sourceKey: string }).sourceKey === storagePath(importId, 2, 'docx')
          ? Response.json({ Key: 'imports/x' })
          : Response.json(
              { statusCode: '500', error: 'internal', message: 'down' },
              { status: 500 }
            );
      }
      if (url.pathname === '/storage/v1/object/imports' && method === 'DELETE') {
        return Response.json(
          { statusCode: '500', error: 'internal', message: 'down' },
          { status: 500 }
        );
      }
    });
    const response = await request(`/imports/${importId}/split`, 'POST', {
      fileIds: [fileId(2), fileId(3)],
    });

    expect(response.status).toBe(503);
    expect(callsTo('/rest/v1/imports', 'DELETE')).toEqual([]);
    expect(callsTo('/rest/v1/rpc/abandon_import')[0]!.body).toEqual({ p_import_id: splitId });
    expect(sent).toEqual([]);
  });

  it('removes the new import and the objects copied when a copy fails', async () => {
    mockUpstream(({ url, method, body }) => {
      if (url.pathname === '/rest/v1/rpc/split_import') {
        return Response.json({ import_id: splitId, files: [splitting(2), splitting(3)] });
      }
      if (url.pathname === '/rest/v1/imports' && method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/storage/v1/object/copy') {
        return (body as { sourceKey: string }).sourceKey === storagePath(importId, 2, 'docx')
          ? Response.json({ Key: 'imports/x' })
          : Response.json(
              { statusCode: '500', error: 'internal', message: 'down' },
              { status: 500 }
            );
      }
      if (url.pathname === '/storage/v1/object/imports' && method === 'DELETE') {
        return Response.json([]);
      }
    });
    const response = await request(`/imports/${importId}/split`, 'POST', {
      fileIds: [fileId(2), fileId(3)],
    });

    expect(response.status).toBe(503);
    expect(callsTo('/storage/v1/object/imports', 'DELETE')[0]!.body).toEqual({
      prefixes: [storagePath(splitId, 9, 'docx'), storagePath(splitId, 10, 'docx')],
    });
    const deleted = callsTo('/rest/v1/imports', 'DELETE')[0]!;
    expect(deleted.admin).toBe(true);
    expect(deleted.url.searchParams.get('id')).toBe(`eq.${splitId}`);
    expect(sent).toEqual([]);
  });

  it.each([
    ['IMP08', 409, 'import_already_split'],
    ['IMP07', 422, 'import_not_other_company'],
    ['IMP01', 409, 'import_ended'],
  ])('answers the database refusing with %s as %i', async (code, status, reason) => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/rpc/split_import'
        ? Response.json({ code, message: 'refused' }, { status: 400 })
        : undefined
    );
    const response = await request(`/imports/${importId}/split`, 'POST', { fileIds: [fileId(2)] });

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ reason });
    expect(callsTo('/storage/v1/object/copy')).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('answers an import the member cannot see as not found', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/rpc/split_import'
        ? Response.json({ code: 'P0002', message: 'No such import.' }, { status: 404 })
        : undefined
    );
    const response = await request(`/imports/${importId}/split`, 'POST', { fileIds: [fileId(2)] });
    expect(response.status).toBe(404);
  });
});

describe('GET /imports/{importId}/source', () => {
  it('finds the page of a PDF a quote is on, with links to the file', async () => {
    const pdf = fileRow(1, {
      upload_path: 'Dosar/Decizie.pdf',
      original_file_name: 'Decizie.pdf',
      mime_type: 'application/pdf',
      storage_path: storagePath(importId, 1, 'pdf'),
      text_path: storagePath(importId, 1, 'json'),
      state: 'read',
    });
    const pages = {
      pageCount: 3,
      pages: [
        { number: 1, text: 'Decizia nr. 1', isScan: false },
        { number: 2, text: 'Administratorul, dl. Vasilescu Andrei, numește', isScan: false },
        { number: 3, text: '', isScan: true },
      ],
    };
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow({ status: 'ready' }));
      if (url.pathname === '/rest/v1/import_files') return Response.json([pdf]);
      if (url.pathname.startsWith('/storage/v1/object/sign/imports/') && method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      if (url.pathname.endsWith('.json')) return Response.json(pages);
    });
    const quote = 'dl. Vasilescu Andrei';
    const response = await request(
      `/imports/${importId}/source?file=${encodeURIComponent('Dosar/Decizie.pdf')}&quote=${encodeURIComponent(quote)}`
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      fileId: fileId(1),
      page: null,
      text: null,
      derived: null,
      pages: [
        { number: 1, text: 'Decizia nr. 1' },
        { number: 2, text: 'Administratorul, dl. Vasilescu Andrei, numește' },
      ],
      match: { page: 2, start: 17, end: 37, parts: [{ start: 17, end: 37 }] },
    });
    expect(String((body.original as { url: string }).url)).toContain(
      storagePath(importId, 1, 'pdf')
    );

    calls = [];
    const scanned = await request(
      `/imports/${importId}/source?file=${encodeURIComponent('Dosar/Decizie.pdf (pagina 3)')}`
    );
    expect(await scanned.json()).toMatchObject({ page: 3, text: null, pages: null, match: null });
    expect(calls.some((call) => call.url.pathname.endsWith('.json'))).toBe(false);
  });

  it('looks up the file, reads its text and signs its links at the same time', async () => {
    const word = fileRow(1, {
      upload_path: 'Dosar/Fișa.doc',
      original_file_name: 'Fișa.doc',
      mime_type: 'application/msword',
      storage_path: storagePath(importId, 1, 'doc'),
      derived_path: storagePath(importId, 1, 'docx'),
      text_path: storagePath(importId, 1, 'txt'),
      state: 'read',
    });
    const waiting = new Map<string, () => void>();
    const held = (name: string, respond: () => Response) =>
      new Promise<Response>((resolve) => waiting.set(name, () => resolve(respond())));
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports') {
        return held('import', () => Response.json({ id: importId }));
      }
      if (url.pathname === '/rest/v1/import_files') {
        return held('files', () => Response.json([word]));
      }
      if (url.pathname.startsWith('/storage/v1/object/sign/imports/') && method === 'POST') {
        return held(`sign ${url.pathname.split('.').at(-1)}`, () =>
          Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` })
        );
      }
      if (url.pathname.endsWith('.txt')) return held('text', () => new Response('Fișa postului'));
    });
    const answer = request(
      `/imports/${importId}/source?file=${encodeURIComponent('Dosar/Fișa.doc')}&quote=${encodeURIComponent('Fișa postului')}`
    );
    const pending = async (count: number) => {
      await vi.waitFor(() => expect(waiting.size).toBe(count));
      const names = [...waiting.keys()].sort();
      for (const release of waiting.values()) release();
      waiting.clear();
      return names;
    };

    expect(await pending(2)).toEqual(['files', 'import']);
    expect(await pending(3)).toEqual(['sign doc', 'sign docx', 'sign txt']);
    expect(await pending(1)).toEqual(['text']);
    const body = (await (await answer).json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      text: 'Fișa postului',
      match: { page: null, start: 0, end: 13 },
      derived: {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });
    expect(calls.find((call) => call.url.pathname === '/rest/v1/imports')?.url.search).toContain(
      'select=id'
    );
  });

  it('answers an import the member cannot see as not found, though its files are asked for at once', async () => {
    const waiting = new Map<string, () => void>();
    const held = (name: string, respond: () => Response) =>
      new Promise<Response>((resolve) => waiting.set(name, () => resolve(respond())));
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return held('import', () => Response.json([]));
      if (url.pathname === '/rest/v1/import_files') {
        return held('files', () => Response.json([fileRow(1, { upload_path: 'Dosar/Fișa.doc' })]));
      }
    });
    const answer = request(
      `/imports/${importId}/source?file=${encodeURIComponent('Dosar/Fișa.doc')}&quote=${encodeURIComponent('Fișa postului')}`
    );

    await vi.waitFor(() => expect([...waiting.keys()].sort()).toEqual(['files', 'import']));
    for (const release of waiting.values()) release();
    const response = await answer;

    expect(response.status).toBe(404);
    expect(calls.some((call) => call.url.pathname.startsWith('/storage/'))).toBe(false);
  });

  it('places a row repeated under several posts under the post the value is for', async () => {
    const word = fileRow(1, {
      upload_path: 'Dosar/Echipament.doc',
      original_file_name: 'Echipament.doc',
      mime_type: 'application/msword',
      storage_path: storagePath(importId, 1, 'doc'),
      text_path: storagePath(importId, 1, 'txt'),
      state: 'read',
    });
    const row = '| Substanțe de curățat (mâini) | Mănuși | - | Inventar |';
    const text = [
      'Posturi: Bucătar, Cameristă',
      'MESERIA : BUCĂTAR',
      row,
      'MESERIA : CAMERISTĂ',
      row,
    ].join('\n');
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow({ status: 'ready' }));
      if (url.pathname === '/rest/v1/import_files') return Response.json([word]);
      if (url.pathname.startsWith('/storage/v1/object/sign/imports/') && method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      if (url.pathname.endsWith('.txt')) return new Response(text);
    });
    const source = async (near?: string) => {
      const response = await request(
        `/imports/${importId}/source?file=${encodeURIComponent('Dosar/Echipament.doc')}&quote=${encodeURIComponent(row)}${near ? `&near=${encodeURIComponent(near)}` : ''}`
      );
      return (await response.json()) as { match: { start: number } };
    };
    const cells = row.slice(2, -2);

    const span = { start: text.lastIndexOf(cells), end: text.lastIndexOf(cells) + cells.length };
    expect((await source('Cameristă')).match).toEqual({ page: null, ...span, parts: [span] });
    expect((await source()).match.start).toBe(text.indexOf(cells));
  });

  it('finds a table broken across PDF pages on the page of its row', async () => {
    const pdf = fileRow(1, {
      upload_path: 'Dosar/Echipament.pdf',
      original_file_name: 'Echipament.pdf',
      mime_type: 'application/pdf',
      storage_path: storagePath(importId, 1, 'pdf'),
      text_path: storagePath(importId, 1, 'json'),
      state: 'read',
    });
    const row = '| Praf | Mască | 1 an | Inventar |';
    const pages = {
      pageCount: 3,
      pages: [
        {
          number: 1,
          text: 'MESERIA : BUCĂTAR\n| Arsuri | Mănuși | 6 luni | Inventar |',
          isScan: false,
        },
        { number: 2, text: '', isScan: true },
        { number: 3, text: `${row}\nMESERIA : AJUTOR BUCĂTAR\n${row}`, isScan: false },
      ],
    };
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow({ status: 'ready' }));
      if (url.pathname === '/rest/v1/import_files') return Response.json([pdf]);
      if (url.pathname.startsWith('/storage/v1/object/sign/imports/') && method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      if (url.pathname.endsWith('.json')) return Response.json(pages);
    });
    const response = await request(
      `/imports/${importId}/source?file=${encodeURIComponent('Dosar/Echipament.pdf')}&quote=${encodeURIComponent(`MESERIA : BUCĂTAR … ${row}`)}&near=Bucătar`
    );
    const end = row.length - 2;

    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toMatchObject({
      match: { page: 3, start: 2, end, parts: [{ start: 2, end }] },
    });
  });
});

describe('POST /imports/{importId}/abandon', () => {
  it('abandons through the database function, and answers one already ended', async () => {
    let ended = false;
    mockUpstream(({ url }) => {
      if (url.pathname !== '/rest/v1/rpc/abandon_import') return undefined;
      if (ended) return Response.json({ code: 'IMP01', message: 'ended' }, { status: 400 });
      ended = true;
      return new Response(null, { status: 204 });
    });
    expect((await request(`/imports/${importId}/abandon`, 'POST')).status).toBe(204);
    const again = await request(`/imports/${importId}/abandon`, 'POST');
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ reason: 'import_ended' });
  });
});

describe('POST /imports/{importId}/files/{fileId}/read', () => {
  const ready = { status: 'ready', ready_at: '2026-10-28T09:10:00+00:00', version: 3 };

  const storedText =
    (characters: Record<number, number>): Handler =>
    ({ url, method }) => {
      if (url.pathname.startsWith('/storage/v1/object/sign/imports/') && method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      for (const [n, count] of Object.entries(characters)) {
        if (url.pathname.endsWith(`${fileId(Number(n))}.txt`)) {
          return new Response('x'.repeat(count));
        }
      }
    };

  it('sends a scan set aside back to be read, with every document again', async () => {
    let status = 'ready';
    const texts = storedText({ 1: 2_000, 2: 300 });
    mockUpstream((call) => {
      const { url, method } = call;
      const text = texts(call);
      if (text) return text;
      if (url.pathname === '/rest/v1/imports' && method === 'PATCH') {
        status = 'reading';
        return Response.json([{ id: importId }]);
      }
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(importRow({ ...ready, status, proposal: { notes: [] } }));
      }
      if (url.pathname === '/rest/v1/import_files' && method === 'PATCH') {
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([
          fileRow(1, { state: 'read' }),
          fileRow(2, {
            state: 'set_aside',
            reason: 'Formular sau registru necompletat.',
            is_scan: true,
          }),
        ]);
      }
    });
    const response = await request(`/imports/${importId}/files/${fileId(2)}/read`, 'POST');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ import: { id: importId, status: 'reading' } });
    const moved = callsTo('/rest/v1/imports', 'PATCH')[0]!;
    expect(moved.admin).toBe(true);
    expect(moved.body).toEqual({
      status: 'reading',
      proposal: null,
      changes: null,
      ready_at: null,
      version: 4,
      read_characters: 2_300,
    });
    expect(moved.url.searchParams.get('version')).toBe('eq.3');
    expect(callsTo('/rest/v1/import_files', 'PATCH')[0]!.body).toEqual({
      state: 'prepared',
      reason: null,
    });
    expect(sent).toEqual([
      { type: 'scan', importId, fileId: fileId(2) },
      { type: 'read', importId, waits: 0 },
    ]);
  });

  it('sends the general training material back to be read', async () => {
    const texts = storedText({ 1: 2_000, 2: 285_000 });
    mockUpstream((call) => {
      const { url, method } = call;
      const text = texts(call);
      if (text) return text;
      if (url.pathname === '/rest/v1/imports' && method === 'PATCH') {
        return Response.json([{ id: importId }]);
      }
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow(ready));
      if (url.pathname === '/rest/v1/import_files' && method === 'PATCH') {
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([
          fileRow(1, { state: 'read' }),
          fileRow(2, {
            state: 'set_aside',
            document_kind: 'training_material',
            reason:
              'Material de instruire introductiv-generală: text general, nu conține date despre client. Îl citim doar dacă ceri.',
          }),
        ]);
      }
    });
    const response = await request(`/imports/${importId}/files/${fileId(2)}/read`, 'POST');

    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/imports', 'PATCH')[0]!.body).toMatchObject({
      status: 'reading',
      read_characters: 287_000,
    });
    expect(callsTo('/rest/v1/import_files', 'PATCH')[0]!.body).toEqual({
      state: 'read',
      reason: null,
    });
    expect(sent).toEqual([{ type: 'read', importId, waits: 0 }]);
  });

  it('refuses before the import is ready, and a file that was not set aside', async () => {
    let row = importRow({ status: 'reading', started_at: '2026-10-28T09:01:00+00:00' });
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(row);
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([fileRow(1, { state: 'read' })]);
      }
    });
    const early = await request(`/imports/${importId}/files/${fileId(1)}/read`, 'POST');
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ reason: 'import_not_ready' });

    row = importRow(ready);
    const read = await request(`/imports/${importId}/files/${fileId(1)}/read`, 'POST');
    expect(read.status).toBe(422);
    expect(await read.json()).toMatchObject({ reason: 'import_file_not_set_aside' });

    const missing = await request(`/imports/${importId}/files/${fileId(7)}/read`, 'POST');
    expect(missing.status).toBe(404);
    expect(sent).toEqual([]);
  });

  it('refuses a file whose text would pass the cap with the files already read', async () => {
    const texts = storedText({ 1: 450_000, 2: 160_000 });
    mockUpstream((call) => {
      const { url } = call;
      const text = texts(call);
      if (text) return text;
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow(ready));
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([
          fileRow(1, { state: 'read' }),
          fileRow(2, { state: 'set_aside', document_kind: 'own_instructions' }),
          fileRow(3, { state: 'set_aside', document_kind: 'cover' }),
        ]);
      }
    });
    const response = await request(`/imports/${importId}/files/${fileId(2)}/read`, 'POST');

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'import_too_much_text' });
    expect(
      calls.filter((call) => call.method === 'GET' && call.url.pathname.endsWith('.txt'))
    ).toHaveLength(2);
    expect(calls.filter((call) => call.method === 'PATCH')).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('refuses a scan whose pages would pass the cap with the files already read', async () => {
    const scanned = (pages: number) => ({
      pageCount: pages,
      pages: Array.from({ length: pages }, (_, index) => ({
        number: index + 1,
        text: '',
        isScan: true,
      })),
    });
    const pdf = (n: number, overrides: Record<string, unknown>) =>
      fileRow(n, {
        mime_type: 'application/pdf',
        storage_path: storagePath(importId, n, 'pdf'),
        is_scan: true,
        ...overrides,
      });
    mockUpstream(({ url, method }) => {
      if (url.pathname.startsWith('/storage/v1/object/sign/imports/') && method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      if (url.pathname.endsWith(`${fileId(1)}.json`)) return Response.json(scanned(120));
      if (url.pathname.endsWith(`${fileId(2)}.json`)) return Response.json(scanned(40));
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow(ready));
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([
          pdf(1, { state: 'read' }),
          pdf(2, { state: 'set_aside', document_kind: 'blank_form' }),
        ]);
      }
    });
    const response = await request(`/imports/${importId}/files/${fileId(2)}/read`, 'POST');

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'import_too_many_scans' });
    expect(calls.filter((call) => call.method === 'PATCH')).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('answers a conflict when someone saved since', async () => {
    const texts = storedText({ 2: 300 });
    mockUpstream((call) => {
      const { url, method } = call;
      const text = texts(call);
      if (text) return text;
      if (url.pathname === '/rest/v1/imports' && method === 'PATCH') return Response.json([]);
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow(ready));
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([fileRow(2, { state: 'set_aside' })]);
      }
    });
    const response = await request(`/imports/${importId}/files/${fileId(2)}/read`, 'POST');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_changed' });
    expect(sent).toEqual([]);
  });
});
