import { supplementaryTrainingProposalListResponseSchema } from '@ssm-usor/contracts';
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
  email: 'owner@example.com',
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
  role: 'owner',
};

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ssmRevisionId = 'd1d1d1d1-0000-4000-8000-000000000001';
const suRevisionId = 'd1d1d1d1-0000-4000-8000-000000000002';
const ssmDocumentId = 'c1c1c1c1-0000-4000-8000-000000000001';
const suDocumentId = 'c1c1c1c1-0000-4000-8000-000000000002';
const mason = '5d0f1a9e-2a6b-4c3d-8e7f-000000000001';
const fixer = '5d0f1a9e-2a6b-4c3d-8e7f-000000000002';
const siteManager = '5d0f1a9e-2a6b-4c3d-8e7f-000000000003';

const proposalRows = [
  {
    revision_id: suRevisionId,
    domain: 'su',
    document_id: suDocumentId,
    issued_at: '2026-11-12T10:00:00+00:00',
    document_revisions: { revision: 1, status: 'issued', document_generations: null },
    client_documents: { title: 'Instrucțiuni proprii în domeniul situațiilor de urgență' },
  },
  {
    revision_id: ssmRevisionId,
    domain: 'ssm',
    document_id: ssmDocumentId,
    issued_at: '2026-11-12T08:30:00+00:00',
    document_revisions: {
      revision: 2,
      status: 'issued',
      document_generations: { issue_date: '2026-11-10' },
    },
    client_documents: { title: 'Instrucțiuni proprii de securitate și sănătate în muncă' },
  },
];

const positionRows = [
  { id: siteManager, name: 'Șef de șantier', employees: [{ count: 1 }] },
  { id: fixer, name: 'Fierar betonist', employees: [{ count: 2 }] },
  { id: mason, name: 'Zidar', employees: [{ count: 4 }] },
  { id: '5d0f1a9e-2a6b-4c3d-8e7f-000000000004', name: 'Paznic', employees: [{ count: 0 }] },
];

const worker = (positionId: string, status = 'active') => ({
  employees: { job_position_id: positionId, status, archived_at: null },
});

type Handler = (init?: RequestInit, url?: URL) => Response | Promise<Response>;
type Upstream =
  'auth' | 'membership' | 'clients' | 'proposals' | 'revisions' | 'positions' | 'trainings';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>>) {
  const defaults: Record<Upstream, Handler> = {
    auth: () => Response.json(user),
    membership: () => Response.json([membership]),
    clients: () => Response.json([{ id: clientId }]),
    proposals: () => Response.json(proposalRows),
    revisions: () => Response.json([{ document_id: ssmDocumentId }]),
    positions: () => Response.json(positionRows),
    trainings: () => Response.json([]),
  };
  const paths: Record<string, Upstream> = {
    '/auth/v1/user': 'auth',
    '/rest/v1/rpc/current_membership': 'membership',
    '/rest/v1/clients': 'clients',
    '/rest/v1/supplementary_training_proposals': 'proposals',
    '/rest/v1/document_revisions': 'revisions',
    '/rest/v1/job_positions': 'positions',
    '/rest/v1/trainings': 'trainings',
  };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const upstream = paths[url.pathname];
    if (!upstream) throw new Error(`Unexpected upstream request: ${url}`);
    return (handlers[upstream] ?? defaults[upstream])(init, url);
  });
}

const calls = (pathname: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);

const request = (path: string, init: RequestInit = {}) =>
  createApp().request(
    path,
    {
      ...init,
      headers: { Authorization: 'Bearer test-access-token', ...(init.headers ?? {}) },
    },
    env
  );

const proposalsPath = `/clients/${clientId}/supplementary-training-proposals`;

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /clients/{clientId}/supplementary-training-proposals', () => {
  it('lists every post with current workers, most workers first, occupational safety first', async () => {
    mockUpstream({});
    const response = await request(proposalsPath);
    expect(response.status).toBe(200);
    const posts = [
      { jobPositionId: mason, name: 'Zidar', workerCount: 4, recordedOn: null },
      { jobPositionId: fixer, name: 'Fierar betonist', workerCount: 2, recordedOn: null },
      { jobPositionId: siteManager, name: 'Șef de șantier', workerCount: 1, recordedOn: null },
    ];
    expect(supplementaryTrainingProposalListResponseSchema.parse(await response.json())).toEqual({
      items: [
        {
          revisionId: ssmRevisionId,
          domain: 'ssm',
          documentTitle: 'Instrucțiuni proprii de securitate și sănătate în muncă',
          revision: 2,
          firstIssue: false,
          documentDate: '2026-11-10',
          issuedAt: '2026-11-12T08:30:00+00:00',
          posts,
        },
        {
          revisionId: suRevisionId,
          domain: 'su',
          documentTitle: 'Instrucțiuni proprii în domeniul situațiilor de urgență',
          revision: 1,
          firstIssue: true,
          documentDate: '2026-11-12',
          issuedAt: '2026-11-12T10:00:00+00:00',
          posts,
        },
      ],
    });
    const proposals = new URL(String(calls('/rest/v1/supplementary_training_proposals')[0]![0]))
      .searchParams;
    expect(proposals.get('client_id')).toBe(`eq.${clientId}`);
    expect(proposals.get('dismissed_at')).toBe('is.null');
    expect(proposals.get('document_revisions.status')).toBe('eq.issued');
    const positions = new URL(String(calls('/rest/v1/job_positions')[0]![0])).searchParams;
    expect(positions.get('employees.status')).toBe('eq.active');
    expect(positions.get('employees.archived_at')).toBe('is.null');
    const trainings = new URL(String(calls('/rest/v1/trainings')[0]![0])).searchParams;
    expect(trainings.get('phase')).toBe('eq.supplementary');
    expect(trainings.get('supplementary_reason')).toBe('eq.rules_changed');
    expect(trainings.get('created_at')).toBe('gte.2026-11-12T08:30:00+00:00');
  });

  it('marks a post done by a training of its domain recorded since the issue', async () => {
    mockUpstream({
      trainings: () =>
        Response.json([
          {
            domain: 'ssm',
            created_at: '2026-11-12T09:00:00+00:00',
            training_records: [worker(mason), worker(fixer, 'terminated')],
          },
          {
            domain: 'su',
            created_at: '2026-11-12T22:30:00+00:00',
            training_records: [worker(siteManager)],
          },
        ]),
    });
    const { items } = supplementaryTrainingProposalListResponseSchema.parse(
      await (await request(proposalsPath)).json()
    );
    expect(
      items.map(({ domain, posts }) => [domain, posts.map((post) => post.recordedOn)])
    ).toEqual([
      ['ssm', ['2026-11-12', null, null]],
      ['su', [null, null, '2026-11-13']],
    ]);
  });

  it('leaves out a proposal once every post has had the training', async () => {
    mockUpstream({
      proposals: () => Response.json([proposalRows[1]]),
      trainings: () =>
        Response.json([
          {
            domain: 'ssm',
            created_at: '2026-11-13T09:00:00+00:00',
            training_records: [worker(mason), worker(fixer), worker(siteManager)],
          },
        ]),
    });
    const response = await request(proposalsPath);
    expect(await response.json()).toEqual({ items: [] });
  });

  it('reads nothing more without an open proposal', async () => {
    mockUpstream({ proposals: () => Response.json([]) });
    const response = await request(proposalsPath);
    expect(await response.json()).toEqual({ items: [] });
    expect(calls('/rest/v1/job_positions')).toHaveLength(0);
  });

  it('answers 404 when the client is not visible to the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    const response = await request(proposalsPath);
    expect(response.status).toBe(404);
  });
});

describe('POST /clients/{clientId}/supplementary-training-proposals/{revisionId}/dismiss', () => {
  const dismissPath = `${proposalsPath}/${ssmRevisionId}/dismiss`;

  it('closes the open proposal of the revision, recording who did', async () => {
    mockUpstream({ proposals: () => Response.json([{ revision_id: ssmRevisionId }]) });
    const response = await request(dismissPath, { method: 'POST' });
    expect(response.status).toBe(204);
    const [input, init] = calls('/rest/v1/supplementary_training_proposals')[0]!;
    const search = new URL(String(input)).searchParams;
    expect(init?.method).toBe('PATCH');
    expect(search.get('client_id')).toBe(`eq.${clientId}`);
    expect(search.get('revision_id')).toBe(`eq.${ssmRevisionId}`);
    expect(search.get('dismissed_at')).toBe('is.null');
    expect(JSON.parse(String(init?.body))).toMatchObject({ dismissed_by: user.id });
  });

  it('answers 404 when nothing open was closed', async () => {
    mockUpstream({ proposals: () => Response.json([]) });
    const response = await request(dismissPath, { method: 'POST' });
    expect(response.status).toBe(404);
  });

  it('passes on the refusal of the database for an archived client', async () => {
    mockUpstream({
      proposals: () =>
        Response.json(
          { code: 'CLA01', message: 'An archived client is not changed.' },
          { status: 400 }
        ),
    });
    const response = await request(dismissPath, { method: 'POST' });
    expect(response.status).toBe(409);
  });
});
