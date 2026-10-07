import {
  apiErrorResponseSchema,
  documentsBehindResponseSchema,
  regenerationJobResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv, RegenerationMessage } from '../../lib/env';

const secretKey = 'sb_secret_test_key_regeneration';
const sent: RegenerationMessage[] = [];
const queue = {
  sendBatch: vi.fn(async (messages: Iterable<{ body: RegenerationMessage }>) => {
    for (const message of messages) sent.push(message.body);
  }),
};

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: secretKey,
  CORS_ORIGINS: 'http://localhost:5173',
  REGENERATION_QUEUE: queue,
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
const jobId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const zebraId = 'c0000000-0000-4000-8000-000000000001';
const albaId = 'c0000000-0000-4000-8000-000000000002';

const behindRow = (overrides: Record<string, unknown>) => ({
  type_key: 'decision_training',
  template_title: 'Decizia privind instruirea',
  newest_version: 3,
  newest_kind: 'legal',
  newest_note: 'Art. 2 preia H.G. 1425/2006 în forma în vigoare.',
  document_id: 'd0000000-0000-4000-8000-000000000001',
  client_id: zebraId,
  client_name: 'Zebra S.R.L.',
  revision_version: 1,
  edited_draft: false,
  ...overrides,
});
const behindRows = [
  behindRow({}),
  behindRow({
    document_id: 'd0000000-0000-4000-8000-000000000002',
    client_id: albaId,
    client_name: 'Alba S.R.L.',
    revision_version: 2,
    edited_draft: true,
  }),
  behindRow({
    type_key: 'cover_decisions',
    template_title: 'Coperta deciziilor',
    newest_version: 2,
    newest_kind: 'correction',
    newest_note: null,
    document_id: 'd0000000-0000-4000-8000-000000000003',
  }),
];
const jobRow = {
  id: jobId,
  type_key: 'decision_training',
  requested_at: '2026-10-07T10:00:00+00:00',
  finished_at: null,
  total_count: 2,
  done_count: 1,
  skipped_count: 0,
  failed_count: 0,
  regeneration_job_items: [
    { client_id: zebraId, status: 'queued', detail: null, clients: { legal_name: 'Zebra S.R.L.' } },
    { client_id: albaId, status: 'done', detail: null, clients: { legal_name: 'Alba S.R.L.' } },
  ],
};

type Handler = (init: RequestInit | undefined, url: URL) => Response;
const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(
  handlers: Partial<Record<'behind' | 'jobs' | 'start' | 'deleteJob', Handler>> = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json(user);
      case '/rest/v1/rpc/current_membership':
        return Response.json([membership]);
      case '/rest/v1/documents_behind': {
        if (handlers.behind) return handlers.behind(init, url);
        const typeKey = url.searchParams.get('type_key')?.replace(/^eq\./, '');
        return Response.json(behindRows.filter((row) => !typeKey || row.type_key === typeKey));
      }
      case '/rest/v1/rpc/start_regeneration_job':
        return handlers.start?.(init, url) ?? Response.json(jobRow);
      case '/rest/v1/regeneration_jobs':
        if (method === 'DELETE') {
          return handlers.deleteJob?.(init, url) ?? new Response(null, { status: 204 });
        }
        return (
          handlers.jobs?.(init, url) ??
          (url.searchParams.has('finished_at')
            ? Response.json([{ id: jobId, type_key: 'decision_training' }])
            : Response.json(jobRow))
        );
      default:
        throw new Error(`Unexpected upstream request: ${method} ${url}`);
    }
  });
}

const calls = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

const authorization = (call: Parameters<typeof fetch>) =>
  new Headers(call[1]?.headers).get('Authorization');

const request = (path: string, method = 'GET', body?: unknown, bindings = env) =>
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
    bindings
  );

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  queue.sendBatch.mockClear();
  sent.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /documents/behind', () => {
  it('lists the clients behind by document type, in the order of the pack', async () => {
    mockUpstream();
    const response = await request('/documents/behind');
    expect(response.status).toBe(200);
    expect(documentsBehindResponseSchema.parse(await response.json()).items).toEqual([
      {
        typeKey: 'cover_decisions',
        title: 'Coperta deciziilor',
        newestVersion: { version: 2, kind: 'correction', note: null },
        runningJobId: null,
        clients: [
          {
            documentId: 'd0000000-0000-4000-8000-000000000003',
            clientId: zebraId,
            clientName: 'Zebra S.R.L.',
            version: 1,
            editedDraft: false,
          },
        ],
      },
      {
        typeKey: 'decision_training',
        title: 'Decizia privind instruirea',
        newestVersion: {
          version: 3,
          kind: 'legal',
          note: 'Art. 2 preia H.G. 1425/2006 în forma în vigoare.',
        },
        runningJobId: jobId,
        clients: [
          {
            documentId: 'd0000000-0000-4000-8000-000000000002',
            clientId: albaId,
            clientName: 'Alba S.R.L.',
            version: 2,
            editedDraft: true,
          },
          {
            documentId: 'd0000000-0000-4000-8000-000000000001',
            clientId: zebraId,
            clientName: 'Zebra S.R.L.',
            version: 1,
            editedDraft: false,
          },
        ],
      },
    ]);
    const [read] = calls('/rest/v1/documents_behind');
    expect(new URL(String(read![0])).searchParams.get('organization_id')).toBe(
      `eq.${organizationId}`
    );
    expect(authorization(read!)).toBe('Bearer test-access-token');
  });

  it('is empty when nothing is behind', async () => {
    mockUpstream({
      behind: () => Response.json([]),
      jobs: () => Response.json([]),
    });
    const response = await request('/documents/behind');
    expect(documentsBehindResponseSchema.parse(await response.json())).toEqual({ items: [] });
  });
});

describe('POST /documents/behind/regenerate', () => {
  it('opens a job with the secret key and queues one message per client behind', async () => {
    mockUpstream();
    const response = await request('/documents/behind/regenerate', 'POST', {
      typeKey: 'decision_training',
    });
    expect(response.status).toBe(201);
    const { job } = regenerationJobResponseSchema.parse(await response.json());
    expect(job).toMatchObject({ id: jobId, typeKey: 'decision_training', total: 2, done: 1 });
    expect(job.items.map((item) => item.clientName)).toEqual(['Alba S.R.L.', 'Zebra S.R.L.']);

    const [behind] = calls('/rest/v1/documents_behind');
    expect(new URL(String(behind![0])).searchParams.get('type_key')).toBe('eq.decision_training');
    expect(authorization(behind!)).toBe('Bearer test-access-token');
    const [start] = calls('/rest/v1/rpc/start_regeneration_job', 'POST');
    expect(authorization(start!)).toBe(`Bearer ${secretKey}`);
    expect(JSON.parse(String(start![1]?.body))).toEqual({
      p_organization_id: organizationId,
      p_type_key: 'decision_training',
      p_requested_by: user.id,
      p_client_ids: [zebraId, albaId],
    });
    expect(sent).toEqual([
      { jobId, clientId: zebraId },
      { jobId, clientId: albaId },
    ]);
    const [read] = calls('/rest/v1/regeneration_jobs');
    expect(authorization(read!)).toBe('Bearer test-access-token');
  });

  it('refuses a type nobody is behind on', async () => {
    mockUpstream({ behind: () => Response.json([]) });
    const response = await request('/documents/behind/regenerate', 'POST', {
      typeKey: 'decision_first_aid',
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('nothing_behind');
    expect(calls('/rest/v1/rpc/start_regeneration_job', 'POST')).toHaveLength(0);
    expect(queue.sendBatch).not.toHaveBeenCalled();
  });

  it('refuses a second job while one of the same type runs', async () => {
    mockUpstream({
      start: () => Response.json({ code: '23505', message: 'duplicate key' }, { status: 409 }),
    });
    const response = await request('/documents/behind/regenerate', 'POST', {
      typeKey: 'decision_training',
    });
    expect(response.status).toBe(409);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.reason).toBe('regeneration_running');
    expect(body.message).toBe(
      'Documentul se regenerează deja pentru toți clienții. Așteptați să se termine.'
    );
    expect(queue.sendBatch).not.toHaveBeenCalled();
  });

  it('takes the job back when its clients cannot be queued', async () => {
    mockUpstream();
    queue.sendBatch.mockRejectedValueOnce(new Error('queue unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request('/documents/behind/regenerate', 'POST', {
      typeKey: 'decision_training',
    });
    expect(response.status).toBe(503);
    const [removed] = calls('/rest/v1/regeneration_jobs', 'DELETE');
    expect(new URL(String(removed![0])).searchParams.get('id')).toBe(`eq.${jobId}`);
    expect(authorization(removed!)).toBe(`Bearer ${secretKey}`);
  });

  it('starts nothing where no queue is bound', async () => {
    mockUpstream();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await request(
      '/documents/behind/regenerate',
      'POST',
      { typeKey: 'decision_training' },
      { ...env, REGENERATION_QUEUE: undefined }
    );
    expect(response.status).toBe(503);
    expect(calls('/rest/v1/rpc/start_regeneration_job', 'POST')).toHaveLength(0);
  });

  it('takes only a built-in document type', async () => {
    mockUpstream();
    const response = await request('/documents/behind/regenerate', 'POST', {
      typeKey: 'service_contract',
    });
    expect(response.status).toBe(400);
    expect(calls('/rest/v1/documents_behind')).toHaveLength(0);
  });
});

describe('GET /documents/regeneration-jobs/{jobId}', () => {
  it('returns the counts and every client, by name', async () => {
    mockUpstream();
    const response = await request(`/documents/regeneration-jobs/${jobId}`);
    expect(response.status).toBe(200);
    expect(regenerationJobResponseSchema.parse(await response.json()).job).toEqual({
      id: jobId,
      typeKey: 'decision_training',
      requestedAt: '2026-10-07T10:00:00+00:00',
      finishedAt: null,
      total: 2,
      done: 1,
      skipped: 0,
      failed: 0,
      items: [
        { clientId: albaId, clientName: 'Alba S.R.L.', status: 'done', detail: null },
        { clientId: zebraId, clientName: 'Zebra S.R.L.', status: 'queued', detail: null },
      ],
    });
  });

  it('is 404 for a job the caller cannot read', async () => {
    mockUpstream({ jobs: () => Response.json([]) });
    const response = await request(`/documents/regeneration-jobs/${jobId}`);
    expect(response.status).toBe(404);
  });
});
