import {
  apiErrorResponseSchema,
  documentsBehindResponseSchema,
  documentsBehindSummarySchema,
  regenerationJobResponseSchema,
  setRegenerationResponseSchema,
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
const otherJobId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e50';
const staleJobId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e51';
const zebraId = 'c0000000-0000-4000-8000-000000000001';
const albaId = 'c0000000-0000-4000-8000-000000000002';
const decisionVersionId = 'a0000000-0000-4000-8000-000000000003';
const coverVersionId = 'a0000000-0000-4000-8000-000000000002';
const fireVersionId = 'a0000000-0000-4000-8000-000000000009';
const changeId = 'e0000000-0000-4000-8000-000000000001';

const behindRow = (overrides: Record<string, unknown>) => ({
  type_key: 'decision_training',
  template_title: 'Decizia privind instruirea',
  newest_version: 3,
  newest_version_id: decisionVersionId,
  newest_kind: 'legal',
  newest_note: 'Art. 2 preia H.G. 1425/2006 în forma în vigoare.',
  document_id: 'd0000000-0000-4000-8000-000000000001',
  client_id: zebraId,
  client_name: 'Zebra S.R.L.',
  revision_version: 1,
  revision_status: 'issued',
  revision_issue_date: '2026-10-14',
  edited_draft: false,
  behind_template: true,
  instruction_changes: [],
  ...overrides,
});
const behindRows = [
  behindRow({}),
  behindRow({
    document_id: 'd0000000-0000-4000-8000-000000000002',
    client_id: albaId,
    client_name: 'Alba S.R.L.',
    revision_version: 2,
    revision_status: 'draft',
    revision_issue_date: '2026-09-02',
    edited_draft: true,
  }),
  behindRow({
    type_key: 'fire_registers',
    template_title: 'Registrele SU',
    newest_version_id: fireVersionId,
    document_id: 'd0000000-0000-4000-8000-000000000009',
  }),
  behindRow({
    type_key: 'cover_decisions',
    template_title: 'Coperta deciziilor',
    newest_version: 2,
    newest_version_id: coverVersionId,
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
    {
      client_id: zebraId,
      status: 'queued',
      detail: null,
      missing: null,
      clients: { legal_name: 'Zebra S.R.L.' },
    },
    {
      client_id: albaId,
      status: 'done',
      detail: null,
      missing: null,
      clients: { legal_name: 'Alba S.R.L.' },
    },
  ],
};

type Handler = (init: RequestInit | undefined, url: URL) => Response;

// The view as PostgREST answers it: filtered by type, counted for a HEAD, and a page at a time
// as `offset` and `limit` ask.
function pageOf(
  rows: Record<string, unknown>[],
  init: RequestInit | undefined,
  url: URL
): Response {
  const filter = url.searchParams.get('type_key');
  const matching = rows.filter((row) => {
    const typeKey = String(row.type_key);
    return !filter
      ? true
      : filter.startsWith('eq.')
        ? typeKey === filter.slice(3)
        : filter.startsWith('not.') !== typeKey.startsWith('fire_');
  });
  if (init?.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: { 'Content-Range': `*/${matching.length}` },
    });
  }
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? matching.length);
  return Response.json(matching.slice(offset, offset + Math.min(limit, 1000)));
}

const manyRows = (count: number, overrides: Record<string, unknown> = {}) =>
  Array.from({ length: count }, (_, index) => {
    const hex = index.toString(16).padStart(12, '0');
    return behindRow({
      document_id: `d1000000-0000-4000-8000-${hex}`,
      client_id: `c1000000-0000-4000-8000-${hex}`,
      client_name: `Client ${index}`,
      ...overrides,
    });
  });

const runningRow = (
  id: string,
  typeKey: string,
  requestedBy: string | null,
  requestedAt = new Date().toISOString()
) => ({
  id,
  type_key: typeKey,
  requested_by: requestedBy,
  requested_at: requestedAt,
  total_count: 2,
  done_count: 1,
  skipped_count: 0,
  failed_count: 0,
});

// The database keeps only the jobs of the last hour, as the API asks.
const recent = (rows: ReturnType<typeof runningRow>[]) => (_init: unknown, url: URL) => {
  const after = url.searchParams.get('requested_at')?.replace(/^gt\./, '');
  return Response.json(rows.filter((row) => !after || row.requested_at > after));
};
const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(
  handlers: Partial<
    Record<'behind' | 'jobs' | 'start' | 'deleteJob' | 'legalChanges' | 'running', Handler>
  > = {}
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
        return pageOf(behindRows, init, url);
      }
      case '/rest/v1/template_version_legal_changes':
        return (
          handlers.legalChanges?.(init, url) ??
          Response.json([
            {
              template_version_id: decisionVersionId,
              legal_changes: { id: changeId, legal_acts: { name: 'H.G. 1425/2006' } },
            },
          ])
        );
      case '/rest/v1/rpc/start_regeneration_job':
        return handlers.start?.(init, url) ?? Response.json(jobRow);
      case '/rest/v1/regeneration_jobs':
        if (method === 'DELETE') {
          return handlers.deleteJob?.(init, url) ?? new Response(null, { status: 204 });
        }
        return (
          handlers.jobs?.(init, url) ??
          (url.searchParams.has('finished_at')
            ? (handlers.running?.(init, url) ??
              recent([runningRow(jobId, 'decision_training', user.id)])(init, url))
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
        set: 'occupational_safety',
        newestVersion: { version: 2, kind: 'correction', note: null },
        legalChanges: [],
        runningJobId: null,
        clients: [
          {
            documentId: 'd0000000-0000-4000-8000-000000000003',
            clientId: zebraId,
            clientName: 'Zebra S.R.L.',
            version: 1,
            editedDraft: false,
            behindTemplate: true,
            instructionChanges: [],
            status: 'issued',
            issueDate: '2026-10-14',
          },
        ],
      },
      {
        typeKey: 'decision_training',
        title: 'Decizia privind instruirea',
        set: 'occupational_safety',
        newestVersion: {
          version: 3,
          kind: 'legal',
          note: 'Art. 2 preia H.G. 1425/2006 în forma în vigoare.',
        },
        legalChanges: [{ id: changeId, actName: 'H.G. 1425/2006' }],
        runningJobId: jobId,
        clients: [
          {
            documentId: 'd0000000-0000-4000-8000-000000000002',
            clientId: albaId,
            clientName: 'Alba S.R.L.',
            version: 2,
            editedDraft: true,
            behindTemplate: true,
            instructionChanges: [],
            status: 'draft',
            issueDate: '2026-09-02',
          },
          {
            documentId: 'd0000000-0000-4000-8000-000000000001',
            clientId: zebraId,
            clientName: 'Zebra S.R.L.',
            version: 1,
            editedDraft: false,
            behindTemplate: true,
            instructionChanges: [],
            status: 'issued',
            issueDate: '2026-10-14',
          },
        ],
      },
      {
        typeKey: 'fire_registers',
        title: 'Registrele SU',
        set: 'fire_safety',
        newestVersion: {
          version: 3,
          kind: 'legal',
          note: 'Art. 2 preia H.G. 1425/2006 în forma în vigoare.',
        },
        legalChanges: [],
        runningJobId: null,
        clients: [
          {
            documentId: 'd0000000-0000-4000-8000-000000000009',
            clientId: zebraId,
            clientName: 'Zebra S.R.L.',
            version: 1,
            editedDraft: false,
            behindTemplate: true,
            instructionChanges: [],
            status: 'issued',
            issueDate: '2026-10-14',
          },
        ],
      },
    ]);
    const [read] = calls('/rest/v1/documents_behind');
    expect(new URL(String(read![0])).searchParams.get('organization_id')).toBe(
      `eq.${organizationId}`
    );
    expect(authorization(read!)).toBe('Bearer test-access-token');
    const [changes] = calls('/rest/v1/template_version_legal_changes');
    expect(new URL(String(changes![0])).searchParams.get('template_version_id')).toBe(
      `in.(${decisionVersionId},${fireVersionId},${coverVersionId})`
    );
    expect(authorization(changes!)).toBe('Bearer test-access-token');
  });

  it('names what moved in the instructions of a client behind on them, leaving out a change it does not know', async () => {
    mockUpstream({
      behind: () =>
        Response.json([
          behindRow({
            type_key: 'training_themes',
            template_title: 'Tematica și programul de instruire',
            newest_version: 2,
            newest_version_id: coverVersionId,
            newest_kind: 'layout',
            newest_note: null,
            revision_version: 2,
            revision_status: 'draft',
            revision_issue_date: '2026-10-01',
            behind_template: false,
            instruction_changes: [
              {
                code: 'module_version',
                title: 'Lucrul la înălțime',
                newestVersionAt: '2026-10-12T09:30:00+00:00',
              },
              { code: 'module_removed', title: 'Scări metalice', newestVersionAt: null },
              { code: 'module_moved', title: 'Sudură', newestVersionAt: null },
            ],
          }),
        ]),
      jobs: () => Response.json([]),
    });
    const response = await request('/documents/behind');
    expect(response.status).toBe(200);
    expect(documentsBehindResponseSchema.parse(await response.json()).items).toEqual([
      {
        typeKey: 'training_themes',
        title: 'Tematica și programul de instruire',
        set: 'occupational_safety',
        newestVersion: { version: 2, kind: 'layout', note: null },
        legalChanges: [],
        runningJobId: null,
        clients: [
          {
            documentId: 'd0000000-0000-4000-8000-000000000001',
            clientId: zebraId,
            clientName: 'Zebra S.R.L.',
            version: 2,
            editedDraft: false,
            behindTemplate: false,
            instructionChanges: [
              {
                code: 'module_version',
                title: 'Lucrul la înălțime',
                newestVersionAt: '2026-10-12T09:30:00+00:00',
              },
              { code: 'module_removed', title: 'Scări metalice', newestVersionAt: null },
            ],
            status: 'draft',
            issueDate: '2026-10-01',
          },
        ],
      },
    ]);
  });

  it('lists every client behind, page by page, past the rows one request answers', async () => {
    mockUpstream({
      behind: (init, url) => pageOf(manyRows(1001), init, url),
      running: () => Response.json([]),
      legalChanges: () => Response.json([]),
    });
    const response = await request('/documents/behind');
    const [type] = documentsBehindResponseSchema.parse(await response.json()).items;
    expect(type!.clients).toHaveLength(1001);
    const pages = calls('/rest/v1/documents_behind').map((call) => new URL(String(call[0])));
    expect(pages.map((url) => url.searchParams.get('offset'))).toEqual(['0', '1000']);
    expect(pages.every((url) => url.searchParams.get('order') === 'document_id.asc')).toBe(true);
  });

  it('is empty when nothing is behind', async () => {
    mockUpstream({
      behind: () => Response.json([]),
      running: () => Response.json([]),
    });
    const response = await request('/documents/behind');
    expect(documentsBehindResponseSchema.parse(await response.json())).toEqual({ items: [] });
    expect(calls('/rest/v1/template_version_legal_changes')).toHaveLength(0);
  });
});

describe('GET /documents/behind/summary', () => {
  it('counts the documents behind per set and lists the jobs of the last hour, with who started them and how far they got', async () => {
    mockUpstream({
      running: recent([
        runningRow(jobId, 'decision_training', user.id),
        runningRow(otherJobId, 'fire_registers', null),
        runningRow(staleJobId, 'cover_decisions', user.id, '2026-01-01T00:00:00.000Z'),
      ]),
    });
    const response = await request('/documents/behind/summary');
    expect(response.status).toBe(200);
    const counts = { total: 2, done: 1, skipped: 0, failed: 0 };
    expect(documentsBehindSummarySchema.parse(await response.json())).toEqual({
      counts: { occupational_safety: 3, fire_safety: 1 },
      running: [
        {
          id: jobId,
          typeKey: 'decision_training',
          set: 'occupational_safety',
          requestedBy: user.id,
          ...counts,
        },
        {
          id: otherJobId,
          typeKey: 'fire_registers',
          set: 'fire_safety',
          requestedBy: null,
          ...counts,
        },
      ],
    });
    const heads = calls('/rest/v1/documents_behind', 'HEAD');
    expect(
      heads.map((call) => new URL(String(call[0])).searchParams.get('type_key')).sort()
    ).toEqual(['like.fire\\_%', 'not.like.fire\\_%']);
    for (const call of heads) {
      expect(new URL(String(call[0])).searchParams.get('organization_id')).toBe(
        `eq.${organizationId}`
      );
    }
  });

  it('counts past the rows one request answers', async () => {
    mockUpstream({
      behind: (init, url) =>
        pageOf([...manyRows(1500), ...manyRows(3, { type_key: 'fire_registers' })], init, url),
      running: () => Response.json([]),
    });
    const response = await request('/documents/behind/summary');
    expect(documentsBehindSummarySchema.parse(await response.json()).counts).toEqual({
      occupational_safety: 1500,
      fire_safety: 3,
    });
  });
});

describe('POST /documents/behind/regenerate', () => {
  it('opens a job with the secret key and queues one message per client behind, leaving out a draft edited by hand', async () => {
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
      p_client_ids: [zebraId],
    });
    expect(sent).toEqual([{ jobId, clientId: zebraId }]);
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

  it('refuses a type whose every client behind has a draft edited by hand', async () => {
    mockUpstream({
      behind: () => Response.json([behindRow({ client_id: albaId, edited_draft: true })]),
    });
    const response = await request('/documents/behind/regenerate', 'POST', {
      typeKey: 'decision_training',
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('nothing_behind');
    expect(calls('/rest/v1/rpc/start_regeneration_job', 'POST')).toHaveLength(0);
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
      'Documentul se regenerează deja pentru toți clienții. Așteaptă să se termine.'
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

describe('POST /documents/behind/regenerate-all', () => {
  const startedIds = [
    '7f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e41',
    '7f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e42',
  ];
  const startInOrder = () => {
    let next = 0;
    return () => Response.json({ ...jobRow, id: startedIds[next++] });
  };
  const regenerateAll = (set: string, bindings = env) =>
    request('/documents/behind/regenerate-all', 'POST', { set }, bindings);

  it('starts a job per type of the set with a client to regenerate, keeping the one under way', async () => {
    mockUpstream({ start: startInOrder() });
    const response = await regenerateAll('occupational_safety');
    expect(response.status).toBe(201);
    expect(setRegenerationResponseSchema.parse(await response.json())).toEqual({
      jobs: [
        {
          id: jobId,
          typeKey: 'decision_training',
          set: 'occupational_safety',
          requestedBy: user.id,
          total: 2,
          done: 1,
          skipped: 0,
          failed: 0,
        },
        {
          id: startedIds[0],
          typeKey: 'cover_decisions',
          set: 'occupational_safety',
          requestedBy: user.id,
          total: 1,
          done: 0,
          skipped: 0,
          failed: 0,
        },
      ],
      notStarted: [],
    });
    const [behind] = calls('/rest/v1/documents_behind');
    expect(new URL(String(behind![0])).searchParams.get('type_key')).toBe('not.like.fire\\_%');
    expect(authorization(behind!)).toBe('Bearer test-access-token');
    const starts = calls('/rest/v1/rpc/start_regeneration_job', 'POST');
    expect(starts.map((call) => JSON.parse(String(call[1]?.body)))).toEqual([
      {
        p_organization_id: organizationId,
        p_type_key: 'cover_decisions',
        p_requested_by: user.id,
        p_client_ids: [zebraId],
      },
    ]);
    expect(authorization(starts[0]!)).toBe(`Bearer ${secretKey}`);
    expect(sent).toEqual([{ jobId: startedIds[0], clientId: zebraId }]);
  });

  it('starts every type in the order of the pack, leaving out the drafts edited by hand', async () => {
    mockUpstream({ start: startInOrder(), running: () => Response.json([]) });
    const response = await regenerateAll('occupational_safety');
    expect(response.status).toBe(201);
    expect(
      setRegenerationResponseSchema.parse(await response.json()).jobs.map((job) => job.typeKey)
    ).toEqual(['cover_decisions', 'decision_training']);
    expect(sent).toEqual([
      { jobId: startedIds[0], clientId: zebraId },
      { jobId: startedIds[1], clientId: zebraId },
    ]);
  });

  it('reads only the fire-safety types for the SU set', async () => {
    mockUpstream({ start: startInOrder(), running: () => Response.json([]) });
    const response = await regenerateAll('fire_safety');
    expect(response.status).toBe(201);
    expect(
      setRegenerationResponseSchema.parse(await response.json()).jobs.map((job) => job.typeKey)
    ).toEqual(['fire_registers']);
  });

  it('regenerates every client of the set, past the rows one request answers', async () => {
    mockUpstream({
      start: startInOrder(),
      running: () => Response.json([]),
      behind: (init, url) => pageOf(manyRows(1200), init, url),
    });
    const response = await regenerateAll('occupational_safety');
    expect(response.status).toBe(201);
    const [start] = calls('/rest/v1/rpc/start_regeneration_job', 'POST');
    expect(JSON.parse(String(start![1]?.body)).p_client_ids).toHaveLength(1200);
    expect(sent).toHaveLength(1200);
    expect(calls('/rest/v1/documents_behind')).toHaveLength(2);
  });

  it('starts a type again whose job has been unfinished for over an hour', async () => {
    mockUpstream({
      start: startInOrder(),
      running: recent([
        runningRow(staleJobId, 'decision_training', user.id, '2026-01-01T00:00:00.000Z'),
      ]),
    });
    const response = await regenerateAll('occupational_safety');
    expect(response.status).toBe(201);
    expect(
      setRegenerationResponseSchema.parse(await response.json()).jobs.map((job) => job.typeKey)
    ).toEqual(['cover_decisions', 'decision_training']);
    const [running] = calls('/rest/v1/regeneration_jobs');
    expect(new URL(String(running![0])).searchParams.get('requested_at')?.startsWith('gt.')).toBe(
      true
    );
  });

  it('answers the jobs that started when the queue fails on a later type', async () => {
    mockUpstream({ start: startInOrder(), running: () => Response.json([]) });
    queue.sendBatch.mockImplementationOnce(async (messages) => {
      for (const message of messages) sent.push(message.body);
    });
    queue.sendBatch.mockRejectedValueOnce(new Error('queue unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await regenerateAll('occupational_safety');
    expect(response.status).toBe(201);
    const body = setRegenerationResponseSchema.parse(await response.json());
    expect(body.jobs.map((job) => job.id)).toEqual([startedIds[0]]);
    expect(body.notStarted).toEqual(['decision_training']);
    const [removed] = calls('/rest/v1/regeneration_jobs', 'DELETE');
    expect(new URL(String(removed![0])).searchParams.get('id')).toBe(`eq.${startedIds[1]}`);
  });

  it('is 503 when the queue fails before any job started', async () => {
    mockUpstream({ start: startInOrder(), running: () => Response.json([]) });
    queue.sendBatch.mockRejectedValueOnce(new Error('queue unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await regenerateAll('occupational_safety')).status).toBe(503);
  });

  it('refuses a set where only drafts edited by hand are behind', async () => {
    mockUpstream({
      behind: () => Response.json([behindRow({ client_id: albaId, edited_draft: true })]),
    });
    const response = await regenerateAll('occupational_safety');
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('nothing_behind');
    expect(calls('/rest/v1/rpc/start_regeneration_job', 'POST')).toHaveLength(0);
  });

  it('refuses when every type that could start is already regenerating', async () => {
    mockUpstream({ start: startInOrder(), behind: () => Response.json([behindRows[0]]) });
    const response = await regenerateAll('occupational_safety');
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('regeneration_running');
    expect(queue.sendBatch).not.toHaveBeenCalled();
  });

  it('starts nothing where no queue is bound', async () => {
    mockUpstream();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await regenerateAll('occupational_safety', {
      ...env,
      REGENERATION_QUEUE: undefined,
    });
    expect(response.status).toBe(503);
    expect(calls('/rest/v1/documents_behind')).toHaveLength(0);
  });

  it('takes only a known set', async () => {
    mockUpstream();
    expect((await regenerateAll('psi')).status).toBe(400);
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
        { clientId: albaId, clientName: 'Alba S.R.L.', status: 'done', detail: null, missing: [] },
        {
          clientId: zebraId,
          clientName: 'Zebra S.R.L.',
          status: 'queued',
          detail: null,
          missing: [],
        },
      ],
    });
  });

  it('names what a client failed for, leaving out a code it no longer knows', async () => {
    mockUpstream({
      jobs: () =>
        Response.json({
          ...jobRow,
          regeneration_job_items: [
            {
              client_id: albaId,
              status: 'failed',
              detail: 'Lipsesc date.',
              missing: ['client.trainingSchedule', 'client.retired_code', 'responsible.first_aid'],
              clients: { legal_name: 'Alba S.R.L.' },
            },
          ],
        }),
    });
    const response = await request(`/documents/regeneration-jobs/${jobId}`);
    expect(regenerationJobResponseSchema.parse(await response.json()).job.items).toEqual([
      {
        clientId: albaId,
        clientName: 'Alba S.R.L.',
        status: 'failed',
        detail: 'Lipsesc date.',
        missing: ['client.trainingSchedule', 'responsible.first_aid'],
      },
    ]);
  });

  it('is 404 for a job the caller cannot read', async () => {
    mockUpstream({ jobs: () => Response.json([]) });
    const response = await request(`/documents/regeneration-jobs/${jobId}`);
    expect(response.status).toBe(404);
  });
});
