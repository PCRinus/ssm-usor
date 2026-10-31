import { type SheetPage, type SheetPageInput, toEmployeeProposal } from '@ssm-usor/import';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv, ImportMessage } from '../../lib/env';
import { syncResultRows, syncTrainingRows } from '../signed-sheets/signed-sheets';

vi.mock('../signed-sheets/signed-sheets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../signed-sheets/signed-sheets')>()),
  signedSheetContext: vi.fn(() => ({})),
  syncTrainingRows: vi.fn(async () => {}),
  syncResultRows: vi.fn(async () => {}),
}));

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
const clientImportId = '8b3a4f5e-6d7c-4e8f-9a01-b2c3d4e5f607';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const positionId = 'b0000000-0000-4000-8000-000000000001';
const employeeId = 'e0000000-0000-4000-8000-000000000001';
const secretKey = 'sb_secret_test_key_imports';
const cnp = '1900101123457';

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
    upload_path: `Fise/Poza ${n}.jpg`,
    original_file_name: `Poza ${n}.jpg`,
    mime_type: 'image/jpeg',
    size_bytes: 1000,
    sha256: 'a'.repeat(64),
    storage_path: storagePath(importId, n, 'jpg'),
    state: 'read',
    document_kind: null,
    reason: null,
    company_name: null,
    company_cui: null,
    page_count: 1,
    is_scan: true,
    text_path: storagePath(importId, n, 'json'),
    derived_path: storagePath(importId, n, 'jpeg'),
    ...overrides,
  };
}

const noPerson: SheetPage['person'] = {
  lastName: null,
  firstName: null,
  cnp: null,
  employeeNumber: null,
};
const noFields: SheetPage['fields'] = {
  birthDate: null,
  birthPlace: null,
  homeAddress: null,
  education: null,
  qualification: null,
  bloodGroup: null,
  rhFactor: null,
  jobTitle: null,
  hiredAt: null,
  leftOn: null,
  workplace: null,
  commuteRoute: null,
  commuteMinutes: null,
};

const page = (
  n: number,
  person: Partial<SheetPage['person']>,
  fields: Partial<SheetPage['fields']>,
  trainings: SheetPage['trainings'] = []
): SheetPageInput => ({
  id: `page-${n}`,
  fileId: fileId(n),
  page: null,
  label: `Fise/Poza ${n}.jpg`,
  reading: {
    pageKind: 'ssm_sheet_front',
    person: { ...noPerson, ...person },
    fields: { ...noFields, ...fields },
    admission: { admittedOn: null, admittedByName: null, admittedByJobTitle: null },
    trainings,
    unreadable: [],
    notes: [],
  },
});

const sheetPages = [
  page(
    1,
    { lastName: 'Popescu', firstName: 'Ion', cnp },
    { birthDate: '1990-01-01', jobTitle: 'Vânzător', hiredAt: '2015-03-02' },
    [
      {
        domain: 'ssm',
        phase: 'introductory_general',
        annualTest: false,
        heldOn: '2015-03-02',
        durationMinutes: 480,
        trainerName: 'Vasile Georgescu',
        trainerJobTitle: 'Inspector SSM',
        verifierName: 'Elena Marin',
        verifierJobTitle: 'Administrator',
        material: 'Legislația SSM',
        supplementaryReason: null,
        traineeSignature: 'present',
        trainerSignature: 'present',
        verifierSignature: 'present',
      },
    ]
  ),
  page(
    2,
    { lastName: 'Ionescu', firstName: 'Maria' },
    { jobTitle: 'Vânzătoare', hiredAt: '2019-01-07' }
  ),
];

const proposalOf = (pages: SheetPageInput[]) =>
  toEmployeeProposal({
    pages,
    client: { jobPositions: [{ id: positionId, name: 'Vânzător' }], workplaces: [], employees: [] },
    themes: () => null,
    today: '2026-10-31',
  });

const proposal = proposalOf(sheetPages);

const checkedPopescu = {
  people: { 'person-1': { state: 'checked' } },
  jobTitles: {},
  workplaces: {},
  rows: {},
  pages: {},
};

function importRow(overrides: Record<string, unknown> = {}) {
  return {
    id: importId,
    kind: 'employees',
    status: 'ready',
    client_id: clientId,
    into_existing_client: true,
    company_name: null,
    company_cui: null,
    source_import_id: null,
    failure_reason: null,
    created_by: user.id,
    created_at: '2026-10-28T09:00:00+00:00',
    updated_at: '2026-10-30T12:00:00+00:00',
    started_at: '2026-10-28T09:01:00+00:00',
    ready_at: '2026-10-28T09:20:00+00:00',
    failed_at: null,
    confirmed_at: null,
    clients: { id: clientId, legal_name: 'BRUTĂRIA FICTIVĂ S.R.L.' },
    import_files: [{ count: 2 }],
    last_file: [{ updated_at: '2026-10-28T09:19:00+00:00' }],
    version: 4,
    proposal,
    changes: checkedPopescu,
    proposal_dropped_at: null,
    read_characters: null,
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    usage_by_step: {},
    ...overrides,
  };
}

type Call = { method: string; url: URL; body: unknown; admin: boolean };
type Handler = (call: Call) => Response | Promise<Response> | undefined;

const fetchMock = vi.fn<typeof fetch>();
let calls: Call[] = [];

const emptyClientTables = new Set([
  '/rest/v1/client_workplaces',
  '/rest/v1/employees',
  '/rest/v1/training_records',
  '/rest/v1/test_results',
]);

function mockUpstream(handler: Handler = () => undefined) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const raw = init?.body;
    const call: Call = {
      method,
      url,
      body: typeof raw === 'string' && /^[[{]/.test(raw) ? JSON.parse(raw) : raw,
      admin: headers.get('Authorization') === `Bearer ${secretKey}`,
    };
    calls.push(call);
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json([
        { user_id: user.id, organization_id: organizationId, role: 'specialist', access: 'full' },
      ]);
    }
    if (url.pathname === '/rest/v1/profiles') {
      return Response.json([{ user_id: user.id, full_name: 'Ana Popescu' }]);
    }
    const custom = await handler(call);
    if (custom) return custom;
    if (url.pathname === '/rest/v1/job_positions') {
      return Response.json([{ id: positionId, name: 'Vânzător' }]);
    }
    if (emptyClientTables.has(url.pathname)) return Response.json([]);
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const request = (path: string, method = 'GET', body?: unknown) =>
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
    env
  );

const callsTo = (pathname: string, method?: string) =>
  calls.filter((call) => call.url.pathname === pathname && (!method || call.method === method));

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  calls = [];
  sent.length = 0;
  queue.send.mockClear();
  queue.sendBatch.mockClear();
  vi.mocked(syncTrainingRows).mockClear();
  vi.mocked(syncResultRows).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /imports for an employee import', () => {
  it('creates an employee import for an existing client', async () => {
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/clients') {
        return Response.json({ id: clientId, stage: 'client', archived_at: null });
      }
      if (url.pathname === '/rest/v1/imports' && method === 'POST') {
        return Response.json({ id: importId }, { status: 201 });
      }
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(
          importRow({ status: 'uploading', proposal: null, changes: null, last_file: [] })
        );
      }
    });
    const response = await request('/imports', 'POST', { clientId, kind: 'employees' });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      import: {
        kind: 'employees',
        status: 'uploading',
        expiresAt: '2026-11-13T12:00:00.000Z',
        people: null,
      },
    });
    expect(callsTo('/rest/v1/imports', 'POST')[0]!.body).toMatchObject({
      kind: 'employees',
      client_id: clientId,
      into_existing_client: true,
    });
  });

  it('refuses an employee import without its client, and found sheets for a client import', async () => {
    mockUpstream();
    const withoutClient = await request('/imports', 'POST', { kind: 'employees' });
    const clientKind = await request('/imports', 'POST', { clientId, addFoundSheets: true });

    expect(withoutClient.status).toBe(400);
    expect(clientKind.status).toBe(400);
    expect(callsTo('/rest/v1/imports', 'POST')).toEqual([]);
  });
});

const foundRow = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: fileId(n),
  upload_path: `Dosar/Fise/Poza ${n}.jpg`,
  imports: {
    id: clientImportId,
    kind: 'client',
    status: 'confirmed',
    client_id: clientId,
    confirmed_at: '2026-10-12T08:00:00+00:00',
    files_copied_at: '2026-10-12T08:01:00+00:00',
  },
  client_file: {
    id: `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    storage_path: `${organizationId}/${clientId}/client-file-${n}.jpg`,
    original_file_name: `Poza ${n}.jpg`,
    mime_type: 'image/jpeg',
    size_bytes: 2000 + n,
    sha256: String(n).repeat(64).slice(0, 64),
  },
  ...overrides,
});

function foundSheets(found: unknown[], taken: unknown[]): Handler {
  return ({ url, method }) => {
    if (url.pathname !== '/rest/v1/import_files' || method !== 'GET') return undefined;
    const select = url.searchParams.get('select') ?? '';
    if (select.includes('client_file')) return Response.json(found);
    if (select.startsWith('source_file_id')) return Response.json(taken);
    return undefined;
  };
}

describe('GET /clients/{clientId}/found-sheets', () => {
  it('lists the sheets a confirmed client import set aside that no employee import holds', async () => {
    const other = {
      ...foundRow(3).imports,
      id: 'aa000000-0000-4000-8000-000000000003',
      confirmed_at: '2026-10-20T08:00:00+00:00',
    };
    mockUpstream(
      foundSheets(
        [foundRow(1), foundRow(2), foundRow(3, { imports: other })],
        [{ source_file_id: fileId(2), imports: { kind: 'employees', status: 'ready' } }]
      )
    );
    const response = await request(`/clients/${clientId}/found-sheets`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          importId: other.id,
          confirmedAt: other.confirmed_at,
          sheets: [expect.objectContaining({ id: fileId(3) })],
        },
        {
          importId: clientImportId,
          confirmedAt: '2026-10-12T08:00:00+00:00',
          sheets: [
            {
              id: fileId(1),
              clientFileId: 'c0000000-0000-4000-8000-000000000001',
              uploadPath: 'Dosar/Fise/Poza 1.jpg',
              fileName: 'Poza 1.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 2001,
            },
          ],
        },
      ],
      total: 2,
    });
    const [found, taken] = callsTo('/rest/v1/import_files');
    expect(found!.admin).toBe(false);
    expect(found!.url.searchParams.get('state')).toBe('eq.for_employees');
    expect(found!.url.searchParams.get('imports.status')).toBe('eq.confirmed');
    expect(found!.url.searchParams.get('imports.client_id')).toBe(`eq.${clientId}`);
    expect(found!.url.searchParams.get('imports.files_copied_at')).toBe('not.is.null');
    expect(found!.url.searchParams.get('client_file.mime_type')).toBe(
      'in.(application/pdf,image/jpeg,image/png)'
    );
    expect(found!.url.searchParams.get('client_file.owners_only')).toBe('eq.false');
    expect(taken!.url.searchParams.get('imports.kind')).toBe('eq.employees');
    expect(taken!.url.searchParams.get('imports.status')).toBe('not.in.(abandoned,failed)');
  });

  it('offers a photograph found twice once, and not at all when an import holds a copy of it', async () => {
    const later = {
      ...foundRow(1).imports,
      id: 'aa000000-0000-4000-8000-000000000003',
      confirmed_at: '2026-10-20T08:00:00+00:00',
    };
    const again = (n: number, of: number) =>
      foundRow(n, {
        imports: later,
        client_file: { ...foundRow(n).client_file, sha256: foundRow(of).client_file.sha256 },
      });
    mockUpstream(
      foundSheets(
        [foundRow(1), foundRow(2), again(3, 1), again(4, 5)],
        [
          {
            source_file_id: fileId(5),
            sha256: foundRow(5).client_file.sha256,
            imports: { kind: 'employees', status: 'ready' },
          },
        ]
      )
    );
    const response = await request(`/clients/${clientId}/found-sheets`);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: { sheets: { id: string }[] }[] };
    expect(body.items.flatMap((group) => group.sheets.map((sheet) => sheet.id))).toEqual([
      fileId(1),
      fileId(2),
    ]);
    expect(callsTo('/rest/v1/import_files')[1]!.url.searchParams.get('select')).toContain('sha256');
  });
});

describe('found sheets taken into an employee import', () => {
  function adding(
    options: { failCopy?: boolean; status?: string; startedMeanwhile?: boolean } = {}
  ): Handler {
    const found = foundSheets([foundRow(1), foundRow(2)], []);
    return (call) => {
      const { url, method } = call;
      const listed = found(call);
      if (listed) return listed;
      if (url.pathname === '/rest/v1/clients') {
        return Response.json({ id: clientId, stage: 'client', archived_at: null });
      }
      if (url.pathname === '/rest/v1/imports' && method === 'POST') {
        return Response.json({ id: importId }, { status: 201 });
      }
      if (url.pathname === '/rest/v1/imports' && method === 'DELETE') return Response.json([]);
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(
          importRow({ status: options.status ?? 'uploading', proposal: null, changes: null })
        );
      }
      if (url.pathname === '/rest/v1/import_files' && method === 'GET') return Response.json([]);
      if (url.pathname === '/rest/v1/import_files' && method === 'POST') {
        const rows = call.body as { source_file_id: string }[];
        return Response.json(
          rows.map((row, index) => ({
            id: fileId(10 + index),
            storage_path: storagePath(importId, 10 + index, 'jpg'),
            source_file_id: row.source_file_id,
          })),
          { status: 201 }
        );
      }
      if (url.pathname === '/rest/v1/import_files') return Response.json([]);
      if (url.pathname === '/storage/v1/object/copy') {
        return options.failCopy
          ? Response.json({ statusCode: '500', error: 'down', message: 'down' }, { status: 500 })
          : Response.json({ Key: 'imports/x' });
      }
      if (url.pathname === '/storage/v1/object/imports' && method === 'DELETE') {
        return Response.json([]);
      }
      if (url.pathname === '/rest/v1/rpc/mark_found_sheets_uploaded') {
        return options.startedMeanwhile
          ? Response.json({ code: 'IMP01', message: 'not uploading' }, { status: 400 })
          : new Response(null, { status: 204 });
      }
      return undefined;
    };
  }

  it('starts an import with every found sheet, copied from the client files as if uploaded', async () => {
    mockUpstream(adding());
    const response = await request('/imports', 'POST', {
      clientId,
      kind: 'employees',
      addFoundSheets: true,
    });

    expect(response.status).toBe(201);
    const inserted = callsTo('/rest/v1/import_files', 'POST')[0]!;
    expect(inserted.admin).toBe(true);
    expect(inserted.body).toEqual([
      {
        import_id: importId,
        organization_id: organizationId,
        upload_path: 'Din documentația importată pe 12.10.2026/Dosar/Fise/Poza 1.jpg',
        original_file_name: 'Poza 1.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 2001,
        sha256: '1'.repeat(64),
        source_file_id: fileId(1),
      },
      expect.objectContaining({
        upload_path: 'Din documentația importată pe 12.10.2026/Dosar/Fise/Poza 2.jpg',
        source_file_id: fileId(2),
      }),
    ]);
    expect(callsTo('/storage/v1/object/copy').map((call) => call.body)).toEqual([
      {
        bucketId: 'client-files',
        sourceKey: `${organizationId}/${clientId}/client-file-1.jpg`,
        destinationKey: storagePath(importId, 10, 'jpg'),
        destinationBucket: 'imports',
      },
      expect.objectContaining({ destinationKey: storagePath(importId, 11, 'jpg') }),
    ]);
    const marked = callsTo('/rest/v1/rpc/mark_found_sheets_uploaded')[0]!;
    expect(marked.admin).toBe(true);
    expect(marked.body).toEqual({ p_import_id: importId, p_file_ids: [fileId(10), fileId(11)] });
    expect(callsTo('/rest/v1/import_files', 'PATCH')).toEqual([]);
  });

  it('numbers the copies of two photographs that would land on one path', async () => {
    const sameDay = {
      ...foundRow(2).imports,
      id: 'aa000000-0000-4000-8000-000000000003',
      confirmed_at: '2026-10-12T15:00:00+00:00',
    };
    mockUpstream((call) => {
      const listed = foundSheets(
        [foundRow(1), foundRow(2, { upload_path: 'Dosar/Fise/Poza 1.jpg', imports: sameDay })],
        []
      )(call);
      return listed ?? adding()(call);
    });
    const response = await request(`/imports/${importId}/found-sheets`, 'POST', {});

    expect(response.status).toBe(201);
    expect(
      (callsTo('/rest/v1/import_files', 'POST')[0]!.body as { upload_path: string }[]).map(
        (row) => row.upload_path
      )
    ).toEqual([
      'Din documentația importată pe 12.10.2026/Dosar/Fise/Poza 1.jpg',
      'Din documentația importată pe 12.10.2026/Dosar/Fise/Poza 1 (2).jpg',
    ]);
  });

  it('creates nothing when the client has no found sheet left', async () => {
    mockUpstream((call) => {
      if (call.url.pathname === '/rest/v1/clients') {
        return Response.json({ id: clientId, stage: 'client', archived_at: null });
      }
      return foundSheets(
        [foundRow(1)],
        [{ source_file_id: fileId(1), imports: { kind: 'employees', status: 'uploading' } }]
      )(call);
    });
    const response = await request('/imports', 'POST', {
      clientId,
      kind: 'employees',
      addFoundSheets: true,
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'import_no_found_sheets' });
    expect(callsTo('/rest/v1/imports', 'POST')).toEqual([]);
  });

  it('takes the copies and the import back when a copy fails', async () => {
    mockUpstream(adding({ failCopy: true }));
    const response = await request('/imports', 'POST', {
      clientId,
      kind: 'employees',
      addFoundSheets: true,
    });

    expect(response.status).toBe(503);
    expect(callsTo('/rest/v1/import_files', 'DELETE')[0]!.url.searchParams.get('id')).toBe(
      `in.(${fileId(10)},${fileId(11)})`
    );
    expect(callsTo('/rest/v1/imports', 'DELETE')[0]!.url.searchParams.get('id')).toBe(
      `eq.${importId}`
    );
  });

  it('takes the copies back when the reading started while they were copied', async () => {
    mockUpstream(adding({ startedMeanwhile: true }));
    const response = await request(`/imports/${importId}/found-sheets`, 'POST', {});

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_not_uploading' });
    expect(callsTo('/storage/v1/object/imports', 'DELETE')[0]!.body).toEqual({
      prefixes: [storagePath(importId, 10, 'jpg'), storagePath(importId, 11, 'jpg')],
    });
    expect(callsTo('/rest/v1/import_files', 'DELETE')[0]!.url.searchParams.get('id')).toBe(
      `in.(${fileId(10)},${fileId(11)})`
    );
  });

  it('adds the found sheets named to an import still uploading', async () => {
    mockUpstream(adding());
    const response = await request(`/imports/${importId}/found-sheets`, 'POST', {
      fileIds: [fileId(2)],
    });

    expect(response.status).toBe(201);
    expect(callsTo('/rest/v1/import_files', 'POST')[0]!.body).toEqual([
      expect.objectContaining({ source_file_id: fileId(2) }),
    ]);
  });

  it('refuses a sheet not offered, an import past uploading and a client import', async () => {
    mockUpstream(adding());
    const notOffered = await request(`/imports/${importId}/found-sheets`, 'POST', {
      fileIds: [fileId(2), fileId(7)],
    });
    expect(notOffered.status).toBe(422);
    expect(await notOffered.json()).toMatchObject({ reason: 'import_no_found_sheets' });

    mockUpstream(adding({ status: 'preparing' }));
    const started = await request(`/imports/${importId}/found-sheets`, 'POST', {});
    expect(started.status).toBe(409);
    expect(await started.json()).toMatchObject({ reason: 'import_not_uploading' });

    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports'
        ? Response.json(importRow({ kind: 'client', status: 'uploading' }))
        : undefined
    );
    const clientImport = await request(`/imports/${importId}/found-sheets`, 'POST', {});
    expect(clientImport.status).toBe(409);
    expect(await clientImport.json()).toMatchObject({ reason: 'import_wrong_kind' });
    expect(callsTo('/rest/v1/import_files', 'POST')).toEqual([]);
  });
});

describe('POST /imports/{importId}/files for an employee import', () => {
  it('takes only photographs and PDFs', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports'
        ? Response.json(importRow({ status: 'uploading', proposal: null, changes: null }))
        : undefined
    );
    const response = await request(`/imports/${importId}/files`, 'POST', {
      files: [
        { uploadPath: 'Fise/1.jpg', mimeType: 'image/jpeg', sizeBytes: 10, sha256: 'a'.repeat(64) },
        {
          uploadPath: 'Fise/nota.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sizeBytes: 10,
          sha256: 'a'.repeat(64),
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      reason: 'import_photos_only',
      issues: [{ path: 'files.1.mimeType' }],
    });
    expect(callsTo('/rest/v1/import_files', 'POST')).toEqual([]);
  });
});

describe('GET /imports for employee imports', () => {
  it("lists a client's open employee imports with their people by state and the day they expire", async () => {
    mockUpstream(({ url }) => {
      if (url.pathname !== '/rest/v1/imports') return undefined;
      if (url.searchParams.get('select')?.startsWith('id,people')) {
        return Response.json([{ id: importId, people: proposal.people, changes: checkedPopescu }]);
      }
      return Response.json([importRow()]);
    });
    const response = await request(`/imports?clientId=${clientId}&kind=employees`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [
        {
          id: importId,
          kind: 'employees',
          expiresAt: '2026-11-13T12:00:00.000Z',
          people: { total: 2, toCheck: 1, checked: 1, setAside: 0 },
        },
      ],
    });
    const [list, people] = callsTo('/rest/v1/imports');
    expect(list!.url.searchParams.get('kind')).toBe('eq.employees');
    expect(list!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(list!.url.searchParams.get('last_file.limit')).toBe('1');
    expect(people!.url.searchParams.get('id')).toBe(`in.(${importId})`);
  });

  it("lists a client's last confirmed employee imports, latest confirmation first, with who is left to invite", async () => {
    const olderId = '7b1f3a52-0d4e-4c8a-9f61-2e5d8c7b4a10';
    const [lazar, pop, toma, ene] = [1, 2, 3, 4].map(
      (n) => `e1e1e1e1-0000-4000-8000-00000000003${n}`
    );
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') {
        return Response.json([
          importRow({ status: 'confirmed', confirmed_at: '2026-10-30T09:15:00+00:00' }),
          importRow({
            id: olderId,
            status: 'confirmed',
            confirmed_at: '2026-10-20T09:15:00+00:00',
          }),
        ]);
      }
      if (url.pathname === '/rest/v1/employees') {
        return Response.json([
          { id: lazar, client_files: [{ import_id: importId }, { import_id: importId }] },
          { id: pop, client_files: [{ import_id: olderId }] },
          { id: toma, client_files: [{ import_id: olderId }, { import_id: importId }] },
          { id: ene, client_files: [{ import_id: olderId }] },
        ]);
      }
      if (url.pathname === '/rest/v1/client_participants') {
        return Response.json([{ employee_id: lazar }]);
      }
      if (url.pathname === '/rest/v1/participant_invitations') {
        return Response.json([{ employee_id: ene }]);
      }
      return undefined;
    });
    const response = await request(`/imports?clientId=${clientId}&kind=employees&status=confirmed`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [
        {
          id: importId,
          status: 'confirmed',
          confirmedAt: '2026-10-30T09:15:00+00:00',
          expiresAt: null,
          people: null,
          uninvited: 1,
        },
        { id: olderId, uninvited: 2 },
      ],
    });
    const [employees] = callsTo('/rest/v1/employees');
    expect(employees!.url.searchParams.get('client_files.import_id')).toBe(
      `in.(${importId},${olderId})`
    );
    expect(employees!.url.searchParams.get('status')).toBe('eq.active');
    const [list] = callsTo('/rest/v1/imports');
    expect(list!.url.searchParams.get('status')).toBe('eq.confirmed');
    expect(list!.url.searchParams.get('order')).toBe('confirmed_at.desc');
    expect(list!.url.searchParams.get('limit')).toBe('10');
    expect(list!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('lists client imports only when no kind is named', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports' ? Response.json([]) : undefined
    );
    await request('/imports');

    expect(callsTo('/rest/v1/imports')[0]!.url.searchParams.get('kind')).toBe('eq.client');
  });

  it("keeps an import's expiry from the last change to its files", async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports'
        ? Response.json([
            importRow({
              status: 'uploading',
              proposal: null,
              changes: null,
              last_file: [{ updated_at: '2026-10-31T08:30:00.5+00:00' }],
            }),
          ])
        : undefined
    );
    const response = await request(`/imports?clientId=${clientId}&kind=employees`);

    expect(await response.json()).toMatchObject({
      items: [{ expiresAt: '2026-11-14T08:30:00.500Z', people: null }],
    });
  });
});

describe('GET /imports/{importId} for an employee import', () => {
  it("serves the employee proposal, the member's changes and each person's state", async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([fileRow(1), fileRow(2)]);
      }
    });
    const response = await request(`/imports/${importId}`);
    const body = (await response.json()) as { import: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.import).toMatchObject({
      kind: 'employees',
      proposal: null,
      changes: null,
      blockers: [],
      people: { total: 2, toCheck: 1, checked: 1, setAside: 0 },
      employees: {
        proposal: { people: [{ id: 'person-1' }, { id: 'person-2' }] },
        changes: checkedPopescu,
        states: { 'person-1': 'checked', 'person-2': 'to_check' },
      },
    });
  });

  it('names what keeps a checked person from being written', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(
          importRow({
            changes: {
              ...checkedPopescu,
              people: {
                'person-1': { state: 'checked', fields: { lastName: { value: null } } },
              },
            },
          })
        );
      }
      if (url.pathname === '/rest/v1/import_files') return Response.json([fileRow(1)]);
    });
    const response = await request(`/imports/${importId}`);

    expect(await response.json()).toMatchObject({
      import: { blockers: [{ path: 'people.person-1.fields.lastName', code: 'missing' }] },
    });
  });

  it('serves no proposal while the sheets are read', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(importRow({ status: 'reading', proposal: null, changes: null }));
      }
      if (url.pathname === '/rest/v1/import_files') {
        return Response.json([fileRow(1, { state: 'prepared' }), fileRow(2)]);
      }
    });
    const response = await request(`/imports/${importId}`);

    expect(await response.json()).toMatchObject({
      import: {
        employees: null,
        people: null,
        expiresAt: null,
        progress: { files: 2, scans: 2, scansRead: 1 },
      },
    });
    expect(callsTo('/rest/v1/employees')).toEqual([]);
  });
});

describe('PUT /imports/{importId}/employee-changes', () => {
  it('saves the review on the version read', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json({ kind: 'employees' });
      if (url.pathname === '/rest/v1/rpc/save_import_changes') return Response.json(5);
    });
    const changes = {
      people: { 'person-1': { state: 'checked', cnpCorrection: true } },
      jobTitles: { 'title-2': { jobPositionId: positionId } },
      workplaces: { 'workplace-1': { workplaceId: null } },
      rows: { 'row-1': { included: false } },
      pages: { 'page-2': { personId: null } },
    };
    const response = await request(`/imports/${importId}/employee-changes`, 'PUT', {
      version: 4,
      changes,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 5 });
    const rpc = callsTo('/rest/v1/rpc/save_import_changes')[0]!;
    expect(rpc.admin).toBe(false);
    expect(rpc.body).toEqual({ p_import_id: importId, p_expected_version: 4, p_changes: changes });
  });

  it("refuses changes outside the review's shape, and a client import", async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports' ? Response.json({ kind: 'client' }) : undefined
    );
    const invalid = await request(`/imports/${importId}/employee-changes`, 'PUT', {
      version: 4,
      changes: { people: { 'person-1': { state: 'done' } } },
    });
    const clientImport = await request(`/imports/${importId}/employee-changes`, 'PUT', {
      version: 4,
      changes: {},
    });

    expect(invalid.status).toBe(400);
    expect(clientImport.status).toBe(409);
    expect(await clientImport.json()).toMatchObject({ reason: 'import_wrong_kind' });
    expect(callsTo('/rest/v1/rpc/save_import_changes')).toEqual([]);
  });

  it('answers a save on an old version as a conflict', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json({ kind: 'employees' });
      if (url.pathname === '/rest/v1/rpc/save_import_changes') {
        return Response.json({ code: 'IMP02', message: 'saved since' }, { status: 400 });
      }
    });
    const response = await request(`/imports/${importId}/employee-changes`, 'PUT', {
      version: 3,
      changes: {},
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_changed' });
  });
});

describe('POST /imports/{importId}/confirm for an employee import', () => {
  const applied = {
    client_id: clientId,
    employees: { 'person-1': employeeId },
    training_record_ids: ['70000000-0000-4000-8000-000000000001'],
    test_result_ids: ['80000000-0000-4000-8000-000000000001'],
    files: [{ client_file_id: 'x', source_path: 'a', target_path: 'b' }],
  };

  it('writes the checked people, syncs their signed sheets, and queues their files', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/rpc/apply_employee_import') return Response.json(applied);
    });
    const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      clientId,
      fileCount: 1,
      employeeIds: [employeeId],
    });
    const rpc = callsTo('/rest/v1/rpc/apply_employee_import')[0]!;
    expect(rpc.admin).toBe(false);
    expect(rpc.body).toMatchObject({
      p_import_id: importId,
      p_expected_version: 4,
      p_payload: {
        employees: [
          {
            key: 'person-1',
            job_position_id: positionId,
            last_name: 'Popescu',
            first_name: 'Ion',
            cnp,
            birth_date: '1990-01-01',
            job_title: 'Vânzător',
            hired_at: '2015-03-02',
            status: 'active',
          },
        ],
        trainings: [
          {
            domain: 'ssm',
            phase: 'introductory_general',
            held_on: '2015-03-02',
            records: [{ employee_key: 'person-1' }],
          },
        ],
        test_results: [
          { employee_key: 'person-1', domain: 'ssm', test: 'hiring', taken_on: '2015-03-02' },
        ],
        files: [{ employee_key: 'person-1', import_file_id: fileId(1) }],
      },
    });
    expect(callsTo('/rest/v1/employees')[0]!.url.searchParams.get('client_id')).toBe(
      `eq.${clientId}`
    );
    expect(syncTrainingRows).toHaveBeenCalledWith({}, applied.training_record_ids);
    expect(syncResultRows).toHaveBeenCalledWith({}, applied.test_result_ids);
    expect(sent).toEqual([{ type: 'copy', importId }]);
  });

  it("gives a person only their own pages of a PDF that holds other people's sheets", async () => {
    const scanned = proposalOf(
      sheetPages.map((each, index) => ({
        ...each,
        fileId: fileId(9),
        page: index + 1,
        label: `Fise/Scanate.pdf (pagina ${index + 1})`,
      }))
    );
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(importRow({ proposal: scanned }));
      }
      if (url.pathname === '/rest/v1/rpc/apply_employee_import') return Response.json(applied);
    });
    const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });

    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/rpc/apply_employee_import')[0]!.body).toMatchObject({
      p_payload: { files: [{ employee_key: 'person-1', import_file_id: fileId(9), page: 1 }] },
    });
  });

  it('confirms though the signed sheets could not be brought up to date', async () => {
    vi.mocked(syncTrainingRows).mockRejectedValueOnce(new Error('signer down'));
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/rpc/apply_employee_import') return Response.json(applied);
    });
    const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });

    expect(response.status).toBe(200);
    expect(sent).toEqual([{ type: 'copy', importId }]);
  });

  it('confirms nothing while nobody is checked, or a checked person lacks a value', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports' ? Response.json(importRow({ changes: null })) : undefined
    );
    const nobody = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });
    expect(nobody.status).toBe(422);
    expect(await nobody.json()).toMatchObject({
      reason: 'import_incomplete',
      issues: [{ path: 'people', message: 'missing' }],
    });

    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports'
        ? Response.json(
            importRow({
              changes: {
                ...checkedPopescu,
                people: { 'person-1': { state: 'checked', fields: { hiredAt: { value: null } } } },
              },
            })
          )
        : undefined
    );
    const blocked = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });
    expect(blocked.status).toBe(422);
    expect(await blocked.json()).toMatchObject({
      reason: 'import_incomplete',
      issues: [{ path: 'people.person-1.fields.hiredAt', message: 'missing' }],
    });
    expect(callsTo('/rest/v1/rpc/apply_employee_import')).toEqual([]);
  });

  it('answers a version read before a save, and an import not ready, as conflicts', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports' ? Response.json(importRow()) : undefined
    );
    const stale = await request(`/imports/${importId}/confirm`, 'POST', { version: 3 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ reason: 'import_changed' });

    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports'
        ? Response.json(importRow({ status: 'checking', proposal: null }))
        : undefined
    );
    const early = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({ reason: 'import_not_ready' });
  });

  it("maps the database's refusals as a client import's are, naming the person whose CNP is taken", async () => {
    const logged = vi.mocked(console.error);
    const refusals: [Record<string, unknown>, number, Record<string, unknown>][] = [
      [{ code: 'P0002', message: 'No such import.' }, 404, { error: 'not_found' }],
      [{ code: 'IMP01', message: 'not ready' }, 409, { reason: 'import_not_ready' }],
      [{ code: 'IMP02', message: 'saved since' }, 409, { reason: 'import_changed' }],
      [{ code: 'CLA01', message: 'archived' }, 409, { reason: 'client_archived' }],
      [
        { code: '22023', message: 'The client has no employee.' },
        409,
        { reason: 'import_outdated' },
      ],
      [
        {
          code: '23514',
          message:
            'new row for relation "trainings" violates check constraint "trainings_held_on_past"',
        },
        422,
        {
          reason: 'import_refused',
          issues: [{ path: 'rows', message: 'trainings_held_on_past' }],
        },
      ],
      [
        {
          code: '23514',
          message:
            'new row for relation "test_results" violates check constraint "test_results_hiring_once"',
        },
        422,
        { issues: [{ path: 'rows', message: 'test_results_hiring_once' }] },
      ],
      [
        {
          code: '23505',
          message: 'duplicate key value violates unique constraint "employees_client_cnp_key"',
          details: `Key (client_id, cnp)=(${clientId}, ${cnp}) already exists.`,
        },
        422,
        {
          reason: 'import_refused',
          issues: [{ path: 'people.person-1.fields.cnp', message: 'employees_client_cnp_key' }],
        },
      ],
      [
        {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "employees_client_employee_number_key"',
          details: `Key (client_id, employee_number)=(${clientId}, 42) already exists.`,
        },
        422,
        { issues: [{ path: 'people', message: 'employees_client_employee_number_key' }] },
      ],
    ];
    const answers = [];
    for (const [refusal, status, answer] of refusals) {
      mockUpstream(({ url }) => {
        if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
        if (url.pathname === '/rest/v1/rpc/apply_employee_import') {
          return Response.json({ hint: null, details: null, ...refusal }, { status: 400 });
        }
      });
      const response = await request(`/imports/${importId}/confirm`, 'POST', { version: 4 });
      const body = await response.json();
      answers.push(body);
      expect({ status: response.status, body }).toMatchObject({ status, body: answer });
    }

    expect(JSON.stringify([answers, logged.mock.calls])).not.toContain(cnp);
    expect(syncTrainingRows).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});

describe('the other routes of an employee import', () => {
  it('serves the converted photograph of a page as its source', async () => {
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json({ id: importId });
      if (url.pathname === '/rest/v1/import_files') return Response.json([fileRow(1)]);
      if (url.pathname.startsWith('/storage/v1/object/sign/imports/') && method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
    });
    const response = await request(
      `/imports/${importId}/source?file=${encodeURIComponent('Fise/Poza 1.jpg')}`
    );
    const body = (await response.json()) as { derived: { url: string; mimeType: string } };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ fileId: fileId(1), page: null, text: null, pages: null });
    expect(body.derived.mimeType).toBe('image/jpeg');
    expect(body.derived.url).toContain(storagePath(importId, 1, 'jpeg'));
    expect(calls.some((call) => call.url.pathname.endsWith('.json'))).toBe(false);
  });

  it('sends no file set aside back to be read, which only a client import does', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports' ? Response.json(importRow()) : undefined
    );
    const response = await request(`/imports/${importId}/files/${fileId(1)}/read`, 'POST');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_wrong_kind' });
  });
});
