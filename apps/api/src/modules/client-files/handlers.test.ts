import {
  apiErrorResponseSchema,
  clientFileDownloadResponseSchema,
  clientFileListResponseSchema,
  clientFileResponseSchema,
} from '@ssm-usor/contracts';
import PizZip from 'pizzip';
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
const colleagueId = '6f1e2d3c-4b5a-4968-8776-655443322110';

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ownFileId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const colleagueFileId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const pathOf = (fileId: string, extension: string) =>
  `${organizationId}/${clientId}/${fileId}.${extension}`;

const ownFile = {
  id: ownFileId,
  name: 'Certificat de înregistrare',
  note: null as string | null,
  owners_only: false,
  original_file_name: 'Certificat de înregistrare.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1234,
  sha256: 'a'.repeat(64),
  storage_path: pathOf(ownFileId, 'pdf'),
  uploaded_by: user.id as string | null,
  created_at: '2026-09-30T10:00:00+00:00',
  updated_at: '2026-09-30T10:00:00+00:00',
};
const colleagueFile = {
  ...ownFile,
  id: colleagueFileId,
  name: 'Anexă prețuri',
  original_file_name: 'Anexa preturi.xlsx',
  mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  storage_path: pathOf(colleagueFileId, 'xlsx'),
  uploaded_by: colleagueId,
  created_at: '2026-09-29T10:00:00+00:00',
};

const clientRow = { id: clientId, stage: 'client', archived_at: null as string | null };

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;

const fetchMock = vi.fn<typeof fetch>();
let role: 'owner' | 'specialist' = 'specialist';

function mockUpstream(handlers: { clients?: Handler; files?: Handler; storage?: Handler } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json([{ user_id: user.id, organization_id: organizationId, role }]);
    }
    if (url.pathname === '/rest/v1/clients') {
      return handlers.clients?.(init, url) ?? Response.json([clientRow]);
    }
    if (url.pathname === '/rest/v1/profiles') {
      return Response.json([
        { user_id: user.id, full_name: 'Ana Popescu' },
        { user_id: colleagueId, full_name: 'Ion Ionescu' },
      ]);
    }
    if (url.pathname === '/rest/v1/client_files') {
      const custom = handlers.files?.(init, url);
      if (custom) return custom;
      if (method === 'POST') {
        const row = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json(
          {
            ...ownFile,
            ...row,
            storage_path: pathOf(ownFileId, 'pdf'),
            created_at: ownFile.created_at,
            updated_at: ownFile.updated_at,
          },
          { status: 201 }
        );
      }
      if (method === 'PATCH') {
        return Response.json([{ ...ownFile, ...(JSON.parse(String(init?.body)) as object) }]);
      }
      if (method === 'DELETE') return new Response(null, { status: 204 });
      const id = url.searchParams.get('id');
      if (id === `eq.${ownFileId}`) return Response.json([ownFile]);
      if (id === `eq.${colleagueFileId}`) return Response.json([colleagueFile]);
      return Response.json([ownFile, colleagueFile]);
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/client-files/')) {
      return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
    }
    if (url.pathname.startsWith('/storage/v1/object/client-files')) {
      const custom = handlers.storage?.(init, url);
      if (custom) return custom;
      if (method === 'DELETE') return Response.json([]);
      return Response.json({ Key: url.pathname.slice('/storage/v1/object/'.length) });
    }
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const calls = (pathname: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname.startsWith(pathname) && (init?.method ?? 'GET') === method
  );

const sent = (pathname: string, method: string) =>
  JSON.parse(String(calls(pathname, method)[0]![1]?.body)) as Record<string, unknown>;

const request = (path: string, method = 'GET', body?: unknown) =>
  createApp().request(
    path,
    {
      method,
      headers: {
        Authorization: 'Bearer test-access-token',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env
  );

const upload = (query: Record<string, string>, bytes: Uint8Array) =>
  createApp().request(
    `/clients/${clientId}/files?${new URLSearchParams(query).toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-access-token',
        'Content-Type': 'application/octet-stream',
      },
      body: new Blob([bytes as BlobPart]),
    },
    env
  );

const reasonOf = async (response: Response) =>
  apiErrorResponseSchema.parse(await response.json()).reason;

const pdf = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n');
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const compoundFile = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);

function zipWith(part: string) {
  const zip = new PizZip();
  zip.file(part, '<x/>');
  return zip.generate({ type: 'uint8array' });
}

beforeEach(() => {
  role = 'specialist';
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('GET /clients/{clientId}/files', () => {
  it('lists what the caller sees, newest first, with who uploaded each and who may change it', async () => {
    mockUpstream();
    const response = await request(`/clients/${clientId}/files`);
    expect(response.status).toBe(200);
    const { items } = clientFileListResponseSchema.parse(await response.json());
    expect(items.map((item) => [item.name, item.uploadedBy?.fullName, item.canChange])).toEqual([
      ['Certificat de înregistrare', 'Ana Popescu', true],
      ['Anexă prețuri', 'Ion Ionescu', false],
    ]);
    const listed = new URL(String(calls('/rest/v1/client_files', 'GET')[0]![0]));
    expect(listed.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(listed.searchParams.get('order')).toBe('created_at.desc,id.asc');
  });

  it('lets an owner change every file', async () => {
    role = 'owner';
    mockUpstream();
    const { items } = clientFileListResponseSchema.parse(
      await (await request(`/clients/${clientId}/files`)).json()
    );
    expect(items.every((item) => item.canChange)).toBe(true);
  });

  it('answers 404 for a client the caller cannot see', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await request(`/clients/${clientId}/files`)).status).toBe(404);
  });
});

describe('POST /clients/{clientId}/files', () => {
  it('records the row, then stores the file under the path the row names', async () => {
    mockUpstream();
    const response = await upload({ fileName: 'Certificat de înregistrare.PDF' }, pdf);
    expect(response.status).toBe(201);
    const { file } = clientFileResponseSchema.parse(await response.json());
    expect(file.canChange).toBe(true);
    const row = sent('/rest/v1/client_files', 'POST');
    expect(row).toMatchObject({
      organization_id: organizationId,
      client_id: clientId,
      name: 'Certificat de înregistrare',
      note: null,
      owners_only: false,
      original_file_name: 'Certificat de înregistrare.PDF',
      mime_type: 'application/pdf',
      size_bytes: pdf.length,
      uploaded_by: user.id,
    });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    const [stored] = calls(`/storage/v1/object/client-files/${pathOf(ownFileId, 'pdf')}`, 'POST');
    expect(stored).toBeDefined();
    expect(fetchMock.mock.calls.indexOf(stored!)).toBeGreaterThan(
      fetchMock.mock.calls.indexOf(calls('/rest/v1/client_files', 'POST')[0]!)
    );
  });

  it('takes the name and the note given with the upload', async () => {
    mockUpstream();
    await upload(
      { fileName: 'scan0001.png', name: 'Fișă de aptitudine', note: 'Expiră în mai' },
      png
    );
    expect(sent('/rest/v1/client_files', 'POST')).toMatchObject({
      name: 'Fișă de aptitudine',
      note: 'Expiră în mai',
      mime_type: 'image/png',
    });
  });

  it.each([
    [
      'Oferta.xlsx',
      zipWith('xl/workbook.xml'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    [
      'Oferta.docx',
      zipWith('word/document.xml'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      'Oferta protejata.xlsx',
      compoundFile,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    ['Oferta.doc', compoundFile, 'application/msword'],
    ['Oferta.xls', compoundFile, 'application/vnd.ms-excel'],
  ])('keeps %s', async (fileName, bytes, type) => {
    mockUpstream();
    expect((await upload({ fileName }, bytes)).status).toBe(201);
    expect(sent('/rest/v1/client_files', 'POST').mime_type).toBe(type);
  });

  it.each([
    ['setup.exe', new Uint8Array([0x4d, 0x5a]), 'client_file_type_not_allowed'],
    ['pagina.html', new TextEncoder().encode('<html>'), 'client_file_type_not_allowed'],
    ['desen.svg', new TextEncoder().encode('<svg/>'), 'client_file_type_not_allowed'],
    ['fara extensie', pdf, 'client_file_type_not_allowed'],
    ['poza.pdf', png, 'client_file_content_mismatch'],
    ['tabel.docx', zipWith('xl/workbook.xml'), 'client_file_content_mismatch'],
    ['gol.pdf', new Uint8Array(), 'client_file_empty'],
  ])('refuses %s', async (fileName, bytes, reason) => {
    mockUpstream();
    const response = await upload({ fileName }, bytes);
    expect(response.status).toBe(400);
    expect(await reasonOf(response)).toBe(reason);
    expect(calls('/rest/v1/client_files', 'POST')).toHaveLength(0);
  });

  it('refuses a file larger than 20 MiB', async () => {
    mockUpstream();
    const bytes = new Uint8Array(20 * 1024 * 1024 + 1);
    bytes.set(pdf);
    const response = await upload({ fileName: 'mare.pdf' }, bytes);
    expect(response.status).toBe(400);
    expect(await reasonOf(response)).toBe('client_file_too_large');
  });

  it('keeps a file for owners only only when an owner asks', async () => {
    mockUpstream();
    expect((await upload({ fileName: 'oferta.pdf', ownersOnly: 'true' }, pdf)).status).toBe(403);
    expect(calls('/rest/v1/client_files', 'POST')).toHaveLength(0);

    role = 'owner';
    expect((await upload({ fileName: 'oferta.pdf', ownersOnly: 'true' }, pdf)).status).toBe(201);
    expect(sent('/rest/v1/client_files', 'POST').owners_only).toBe(true);
  });

  it("keeps a lead's file for owners only", async () => {
    role = 'owner';
    mockUpstream({ clients: () => Response.json([{ ...clientRow, stage: 'lead' }]) });
    expect((await upload({ fileName: 'oferta.pdf' }, pdf)).status).toBe(201);
    expect(sent('/rest/v1/client_files', 'POST').owners_only).toBe(true);
  });

  it('adds nothing to an archived client', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }]),
    });
    const response = await upload({ fileName: 'oferta.pdf' }, pdf);
    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('client_archived');
    expect(calls('/rest/v1/client_files', 'POST')).toHaveLength(0);
  });

  it('removes the row again when the file cannot be stored', async () => {
    mockUpstream({
      storage: (init) =>
        init?.method === 'POST' ? Response.json({ message: 'down' }, { status: 500 }) : undefined,
    });
    expect((await upload({ fileName: 'oferta.pdf' }, pdf)).status).toBe(503);
    const [removed] = calls('/rest/v1/client_files', 'DELETE');
    expect(new URL(String(removed![0])).searchParams.get('id')).toBe(`eq.${ownFileId}`);
  });
});

describe('PATCH /clients/{clientId}/files/{fileId}', () => {
  it('renames and annotates the caller’s own file; an empty note clears it', async () => {
    mockUpstream();
    const response = await request(`/clients/${clientId}/files/${ownFileId}`, 'PATCH', {
      name: 'Certificat ONRC',
      note: '',
    });
    expect(response.status).toBe(200);
    expect(sent('/rest/v1/client_files', 'PATCH')).toEqual({ name: 'Certificat ONRC', note: null });
  });

  it("refuses a specialist a colleague's file", async () => {
    mockUpstream();
    const response = await request(`/clients/${clientId}/files/${colleagueFileId}`, 'PATCH', {
      name: 'Altceva',
    });
    expect(response.status).toBe(403);
    expect(calls('/rest/v1/client_files', 'PATCH')).toHaveLength(0);
  });

  it('answers the archived client', async () => {
    mockUpstream({
      files: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ code: 'CLA01', message: 'archived' }, { status: 400 })
          : undefined,
    });
    const response = await request(`/clients/${clientId}/files/${ownFileId}`, 'PATCH', {
      name: 'Certificat ONRC',
    });
    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('client_archived');
  });

  it('answers 404 for a file the caller cannot see', async () => {
    mockUpstream({
      files: (init) => ((init?.method ?? 'GET') === 'GET' ? Response.json([]) : undefined),
    });
    expect(
      (await request(`/clients/${clientId}/files/${ownFileId}`, 'PATCH', { name: 'X' })).status
    ).toBe(404);
  });
});

describe('PUT /clients/{clientId}/files/{fileId}/owners-only', () => {
  const setFlag = (ownersOnly: boolean) =>
    request(`/clients/${clientId}/files/${colleagueFileId}/owners-only`, 'PUT', { ownersOnly });

  it('is for owners', async () => {
    mockUpstream();
    expect((await setFlag(true)).status).toBe(403);
    expect(calls('/rest/v1/client_files', 'PATCH')).toHaveLength(0);
  });

  it('lets an owner hide a file from the team', async () => {
    role = 'owner';
    mockUpstream();
    expect((await setFlag(true)).status).toBe(200);
    expect(sent('/rest/v1/client_files', 'PATCH')).toEqual({ owners_only: true });
  });

  it("keeps a lead's file for owners only", async () => {
    role = 'owner';
    mockUpstream({
      files: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ code: 'CFL01', message: 'lead' }, { status: 400 })
          : undefined,
    });
    const response = await setFlag(false);
    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('client_file_lead_owners_only');
  });
});

describe('GET /clients/{clientId}/files/{fileId}/download', () => {
  it('opens a PDF in a tab, under the name it was uploaded with', async () => {
    mockUpstream();
    const response = await request(`/clients/${clientId}/files/${ownFileId}/download`);
    expect(response.status).toBe(200);
    const link = clientFileDownloadResponseSchema.parse(await response.json());
    expect(link).toMatchObject({
      fileName: 'Certificat de înregistrare.pdf',
      disposition: 'inline',
      expiresInSeconds: 60,
    });
    expect(link.url).toContain(`/client-files/${pathOf(ownFileId, 'pdf')}`);
  });

  it('downloads a spreadsheet', async () => {
    mockUpstream();
    const link = clientFileDownloadResponseSchema.parse(
      await (await request(`/clients/${clientId}/files/${colleagueFileId}/download`)).json()
    );
    expect(link).toMatchObject({ fileName: 'Anexa preturi.xlsx', disposition: 'attachment' });
  });

  it('shortens a long name to what the download route takes, keeping the extension', async () => {
    mockUpstream({
      files: (init) =>
        (init?.method ?? 'GET') === 'GET'
          ? Response.json([{ ...ownFile, original_file_name: `${'a'.repeat(250)}.pdf` }])
          : undefined,
    });
    const link = clientFileDownloadResponseSchema.parse(
      await (await request(`/clients/${clientId}/files/${ownFileId}/download`)).json()
    );
    expect(link.fileName).toHaveLength(200);
    expect(link.fileName.endsWith('.pdf')).toBe(true);
  });
});

describe('DELETE /clients/{clientId}/files/{fileId}', () => {
  const remove = (fileId: string) => request(`/clients/${clientId}/files/${fileId}`, 'DELETE');

  it('removes the stored file, then the row', async () => {
    mockUpstream();
    expect((await remove(ownFileId)).status).toBe(204);
    const [object] = calls('/storage/v1/object/client-files', 'DELETE');
    expect(JSON.parse(String(object![1]?.body))).toEqual({ prefixes: [pathOf(ownFileId, 'pdf')] });
    const [row] = calls('/rest/v1/client_files', 'DELETE');
    expect(fetchMock.mock.calls.indexOf(row!)).toBeGreaterThan(
      fetchMock.mock.calls.indexOf(object!)
    );
  });

  it("refuses a specialist a colleague's file", async () => {
    mockUpstream();
    expect((await remove(colleagueFileId)).status).toBe(403);
    expect(calls('/storage/v1/object/client-files', 'DELETE')).toHaveLength(0);
  });

  it("lets an owner delete a colleague's file", async () => {
    role = 'owner';
    mockUpstream();
    expect((await remove(colleagueFileId)).status).toBe(204);
  });

  it('keeps the files of an archived client', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }]),
    });
    const response = await remove(ownFileId);
    expect(response.status).toBe(409);
    expect(await reasonOf(response)).toBe('client_archived');
    expect(calls('/storage/v1/object/client-files', 'DELETE')).toHaveLength(0);
    expect(calls('/rest/v1/client_files', 'DELETE')).toHaveLength(0);
  });
});
