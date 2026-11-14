import { apiErrorResponseSchema, earlierInstructionsResponseSchema } from '@ssm-usor/contracts';
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
const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const importId = '4c3b2a19-0f8e-4d7c-8b6a-5f4e3d2c1b0a';

const file = (id: string, extra: Record<string, unknown>) => ({
  id,
  name: id,
  note: null,
  owners_only: false,
  original_file_name: `${id}.pdf`,
  mime_type: 'application/pdf',
  size_bytes: 1000,
  sha256: 'a'.repeat(64),
  storage_path: `${organizationId}/${clientId}/${id}.pdf`,
  uploaded_by: user.id,
  import_id: null,
  import_path: null,
  earlier_instructions_domain: null,
  valid_until: null,
  created_at: '2026-11-12T10:00:00+00:00',
  updated_at: '2026-11-12T10:00:00+00:00',
  employees: null,
  import_files: [],
  imports: null,
  ...extra,
});

const ids = {
  addedSsm: '11111111-1111-4111-8111-111111111111',
  importedSu: '22222222-2222-4222-8222-222222222222',
  otherCompany: '33333333-3333-4333-8333-333333333333',
  decision: '44444444-4444-4444-8444-444444444444',
  employeeImport: '55555555-5555-4555-8555-555555555555',
};

const fromClientImport = (kind: string, domain: string | null, state = 'set_aside') => ({
  import_id: importId,
  import_files: [{ state, reason: null, document_kind: kind, document_domain: domain }],
  imports: { kind: 'client', confirmed_at: '2026-10-12T09:30:00+00:00' },
});

const allFiles = [
  file(ids.addedSsm, { earlier_instructions_domain: 'ssm', valid_until: '2026-11-12' }),
  file(ids.importedSu, fromClientImport('own_instructions', 'su')),
  file(ids.otherCompany, fromClientImport('own_instructions', 'ssm', 'other_company')),
  file(ids.decision, fromClientImport('decision', null, 'read')),
  file(ids.employeeImport, {
    import_id: importId,
    import_files: [
      {
        state: 'for_employees',
        reason: null,
        document_kind: 'own_instructions',
        document_domain: 'ssm',
      },
    ],
    imports: { kind: 'employees', confirmed_at: '2026-10-16T09:30:00+00:00' },
  }),
];

const fetchMock = vi.fn<typeof fetch>();
let clientRow: Record<string, unknown>;
let answers: Record<string, unknown>[];
let files: typeof allFiles;
const paperTrainings = { ssm: 61, su: 0 };

function mockUpstream() {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json([
        { user_id: user.id, organization_id: organizationId, role: 'specialist' },
      ]);
    }
    if (url.pathname === '/rest/v1/clients') return Response.json([clientRow]);
    if (url.pathname === '/rest/v1/profiles') {
      return Response.json([{ user_id: user.id, full_name: 'Andreea Ionescu' }]);
    }
    if (url.pathname === '/rest/v1/client_files') return Response.json(files);
    if (url.pathname === '/rest/v1/trainings') {
      const domain = url.searchParams.get('domain')!.slice(3) as 'ssm' | 'su';
      return new Response(null, {
        status: 200,
        headers: { 'Content-Range': `*/${paperTrainings[domain]}` },
      });
    }
    if (url.pathname === '/rest/v1/earlier_instructions_unavailable') {
      return method === 'GET' ? Response.json(answers) : new Response(null, { status: 201 });
    }
    if (url.pathname === '/storage/v1/object/sign/client-files') {
      const { paths } = JSON.parse(String(init?.body)) as { paths: string[] };
      return Response.json(
        paths.map((path) => ({
          error: null,
          path,
          signedURL: `/object/sign/client-files/${path}?t`,
        }))
      );
    }
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const calls = (pathname: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

const request = (path: string, method = 'GET') =>
  createApp().request(
    path,
    { method, headers: { Authorization: 'Bearer test-access-token' } },
    env
  );

beforeEach(() => {
  clientRow = { id: clientId, stage: 'client', archived_at: null };
  answers = [];
  files = allFiles;
  vi.stubGlobal('fetch', fetchMock);
  mockUpstream();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('GET /clients/{clientId}/earlier-instructions', () => {
  it('names per domain the copies added, those a client import kept, and how many paper trainings cite them', async () => {
    const response = await request(`/clients/${clientId}/earlier-instructions`);
    expect(response.status).toBe(200);
    const { domains } = earlierInstructionsResponseSchema.parse(await response.json());
    expect(
      domains.map((domain) => ({
        domain: domain.domain,
        state: domain.state,
        paperTrainingCount: domain.paperTrainingCount,
        files: domain.files.map((each) => [each.id, each.earlierInstructions?.validUntil]),
        imported: domain.imported && {
          confirmedOn: domain.imported.confirmedOn,
          files: domain.imported.files.map((each) => each.id),
        },
      }))
    ).toEqual([
      {
        domain: 'ssm',
        state: 'added',
        paperTrainingCount: 61,
        files: [[ids.addedSsm, '2026-11-12']],
        imported: null,
      },
      {
        domain: 'su',
        state: 'imported',
        paperTrainingCount: 0,
        files: [],
        imported: { confirmedOn: '2026-10-12', files: [ids.importedSu] },
      },
    ]);
    expect(domains[0]!.files[0]!.link.url).toContain(`${ids.addedSsm}.pdf`);
    const listed = new URL(String(calls('/rest/v1/client_files', 'GET')[0]![0]));
    expect(listed.searchParams.get('employee_id')).toBe('is.null');
    const counted = calls('/rest/v1/trainings', 'HEAD').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(counted.map((query) => [query.get('domain'), query.get('source')])).toEqual([
      ['eq.ssm', 'eq.paper'],
      ['eq.su', 'eq.paper'],
    ]);
  });

  it('reads an answer that the client has none, with who gave it, behind any copy', async () => {
    answers = [
      { domain: 'ssm', answered_at: '2026-11-13T08:00:00+00:00', answered_by: user.id },
      { domain: 'su', answered_at: '2026-11-13T08:00:00+00:00', answered_by: user.id },
    ];
    const { domains } = earlierInstructionsResponseSchema.parse(
      await (await request(`/clients/${clientId}/earlier-instructions`)).json()
    );
    expect(domains.map((domain) => domain.state)).toEqual(['added', 'imported']);
    expect(domains[0]!.unavailable).toEqual({
      answeredAt: '2026-11-13T08:00:00+00:00',
      answeredBy: { id: user.id, fullName: 'Andreea Ionescu' },
    });
  });

  it('asks for a domain with neither a copy nor an answer', async () => {
    files = allFiles.filter((each) => each.id === ids.decision);
    answers = [{ domain: 'su', answered_at: '2026-11-13T08:00:00+00:00', answered_by: null }];
    const { domains } = earlierInstructionsResponseSchema.parse(
      await (await request(`/clients/${clientId}/earlier-instructions`)).json()
    );
    expect(domains.map((domain) => domain.state)).toEqual(['missing', 'unavailable']);
    expect(domains[1]!.unavailable?.answeredBy).toBeNull();
  });
});

describe('PUT and DELETE /clients/{clientId}/earlier-instructions/{domain}/unavailable', () => {
  it('records the answer for that domain alone, in the caller’s name', async () => {
    const response = await request(
      `/clients/${clientId}/earlier-instructions/su/unavailable`,
      'PUT'
    );
    expect(response.status).toBe(204);
    const [answered] = calls('/rest/v1/earlier_instructions_unavailable', 'POST');
    expect(JSON.parse(String(answered![1]?.body))).toEqual({
      client_id: clientId,
      organization_id: organizationId,
      domain: 'su',
      answered_by: user.id,
    });
    expect(new URL(String(answered![0])).searchParams.get('on_conflict')).toBe('client_id,domain');
  });

  it('takes the answer back', async () => {
    const response = await request(
      `/clients/${clientId}/earlier-instructions/ssm/unavailable`,
      'DELETE'
    );
    expect(response.status).toBe(204);
    const [removed] = calls('/rest/v1/earlier_instructions_unavailable', 'DELETE');
    const query = new URL(String(removed![0])).searchParams;
    expect([query.get('client_id'), query.get('domain')]).toEqual([`eq.${clientId}`, 'eq.ssm']);
  });

  it('changes nothing for an archived client or a lead', async () => {
    clientRow = { id: clientId, stage: 'client', archived_at: '2026-11-01T00:00:00+00:00' };
    const archived = await request(
      `/clients/${clientId}/earlier-instructions/ssm/unavailable`,
      'PUT'
    );
    expect(archived.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await archived.json()).reason).toBe('client_archived');
    clientRow = { id: clientId, stage: 'lead', archived_at: null };
    expect(
      (await request(`/clients/${clientId}/earlier-instructions/ssm/unavailable`, 'DELETE')).status
    ).toBe(409);
    expect(calls('/rest/v1/earlier_instructions_unavailable', 'POST')).toHaveLength(0);
  });

  it('refuses a domain the app does not have', async () => {
    expect(
      (await request(`/clients/${clientId}/earlier-instructions/psi/unavailable`, 'PUT')).status
    ).toBe(400);
  });
});
