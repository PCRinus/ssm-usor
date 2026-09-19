import {
  apiErrorResponseSchema,
  clientDocumentListResponseSchema,
  documentDownloadResponseSchema,
  documentReadinessResponseSchema,
  generateDocumentsResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';

// The engine is tested in its own package, against the real templates. Here it prints the
// client and, for a decision, its number.
vi.mock('@ssm-usor/document-engine', () => ({
  TemplateError: class TemplateError extends Error {},
  renderTemplate: (_template: Uint8Array, data: Record<string, unknown>) => ({
    document: new Uint8Array([80, 75, 3, 4]),
    usedNames: ['client', ...('decisionNumber' in data ? ['decisionNumber'] : [])],
  }),
}));

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

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const membership = { user_id: user.id, organization_id: organizationId, role: 'owner' };
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const organizationRow = {
  legal_name: 'S.C. SAFETY S.R.L.',
  legal_representative_name: 'Maria POPESCU',
  legal_representative_role: 'Administrator',
};
const clientRow = {
  legal_name: 'S.C. PIPETECH S.R.L.',
  legal_representative_name: 'Florin TALOȘ',
  legal_representative_role: 'Administrator',
  periodic_training_hours: 2,
  administrative_training_interval_months: 6,
  worker_training_interval_months: 3,
  training_first_month: 2,
  training_day_from: 2,
  training_day_to: 7,
  archived_at: null,
};
const memberRow = {
  user_id: user.id,
  email: user.email,
  full_name: 'Maria POPESCU',
  professional_title: 'Evaluator de risc SSM',
  role: 'owner',
  joined_at: '2026-09-01T00:00:00+00:00',
};
const personRow = {
  full_name: 'Florin TALOȘ',
  job_title: 'Administrator',
  roles: ['workplace_manager', 'first_aid', 'risk_evaluation_team', 'imminent_danger'],
};

const documentId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const revisionId = '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d';
const generationId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const printedClient = {
  legalName: 'S.C. PIPETECH S.R.L.',
  representativeName: 'Florin TALOȘ',
  representativeRole: 'Administrator',
};
const revisionRow = {
  id: revisionId,
  revision: 1,
  status: 'draft',
  data_snapshot: { client: printedClient, decisionNumber: 3 },
  edited_at: null,
  issued_at: null,
  created_at: '2026-09-19T10:00:00+00:00',
  document_generations: { issue_date: '2026-01-19' },
};
const documentRow = {
  id: documentId,
  client_id: clientId,
  type_key: 'decision_first_aid',
  title: 'Decizia privind responsabilii cu primul ajutor',
  decision_number: 3,
  document_revisions: [revisionRow],
};
const templateRows = [
  {
    type_key: 'decision_first_aid',
    title: 'Decizia privind responsabilii cu primul ajutor',
    document_template_versions: [
      { id: 'v1', version: 1, storage_path: 'built-in/decision_first_aid/old.docx' },
      { id: 'v2', version: 2, storage_path: 'built-in/decision_first_aid/new.docx' },
    ],
  },
  {
    type_key: 'control_report',
    title: 'Referat de control',
    document_template_versions: [
      { id: 'v3', version: 1, storage_path: 'built-in/control_report/one.docx' },
    ],
  },
];

type Handler = (init?: RequestInit, url?: URL) => Response;
type Upstream =
  | 'organizations'
  | 'clients'
  | 'members'
  | 'persons'
  | 'documents'
  | 'generations'
  | 'templates'
  | 'revisions'
  | 'upload';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname.startsWith('/storage/v1/object/sign/documents/')) {
      return Response.json({ signedURL: `/object/sign/documents/x?token=t` });
    }
    if (url.pathname.startsWith('/storage/v1/object/document-templates/')) {
      return new Response(new Uint8Array([1, 2, 3]));
    }
    if (url.pathname.startsWith('/storage/v1/object/documents/')) {
      return handlers.upload?.(init, url) ?? Response.json({ Key: 'documents/x' });
    }
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json(user);
      case '/rest/v1/rpc/current_membership':
        return Response.json([membership]);
      case '/rest/v1/organizations':
        return handlers.organizations?.() ?? Response.json(organizationRow);
      case '/rest/v1/clients':
        return handlers.clients?.() ?? Response.json(clientRow);
      case '/rest/v1/rpc/organization_member_list':
        return handlers.members?.() ?? Response.json([memberRow]);
      case '/rest/v1/client_responsible_persons':
        return handlers.persons?.() ?? Response.json([personRow]);
      case '/rest/v1/client_documents':
        return (
          handlers.documents?.(init, url) ??
          (method === 'POST' ? Response.json({ id: documentId }) : Response.json([documentRow]))
        );
      case '/rest/v1/document_generations':
        return (
          handlers.generations?.(init, url) ??
          (method === 'POST'
            ? Response.json({ id: generationId })
            : Response.json({ issue_date: '2026-01-19', first_decision_number: 3 }))
        );
      case '/rest/v1/document_templates':
        return handlers.templates?.() ?? Response.json(templateRows);
      case '/rest/v1/document_revisions':
        return (
          handlers.revisions?.(init, url) ??
          (method === 'POST'
            ? Response.json({ id: revisionId })
            : method === 'DELETE'
              ? new Response(null, { status: 204 })
              : Response.json({
                  docx_path: `${organizationId}/${clientId}/${documentId}/1.docx`,
                  revision: 1,
                  client_documents: { title: 'Copertă – Deciziile interne' },
                }))
        );
      default:
        throw new Error(`Unexpected upstream request: ${method} ${url}`);
    }
  });
}

const calls = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname.startsWith(pathname) && (init?.method ?? 'GET') === method
  );

const sentBody = (pathname: string, index = 0) =>
  JSON.parse(String(calls(pathname, 'POST')[index]![1]?.body)) as Record<string, unknown>;

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

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /clients/{clientId}/documents/readiness', () => {
  it('is ready when nothing is missing', async () => {
    mockUpstream();
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(response.status).toBe(200);
    expect(documentReadinessResponseSchema.parse(await response.json())).toEqual({
      ready: true,
      missing: [],
    });
    const persons = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname === '/rest/v1/client_responsible_persons')!;
    expect(persons.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(persons.searchParams.get('archived_at')).toBe('is.null');
  });

  it('lists what is missing, from each place it is filled in', async () => {
    mockUpstream({
      organizations: () => Response.json({ ...organizationRow, legal_name: null }),
      clients: () => Response.json({ ...clientRow, training_first_month: null }),
      members: () => Response.json([{ ...memberRow, professional_title: null }]),
      persons: () => Response.json([{ ...personRow, roles: ['first_aid'] }]),
    });
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(documentReadinessResponseSchema.parse(await response.json())).toEqual({
      ready: false,
      missing: [
        'provider.legalName',
        'specialist.professionalTitle',
        'client.trainingSchedule',
        'responsible.workplace_manager',
        'responsible.risk_evaluation_team',
        'responsible.imminent_danger',
      ],
    });
  });

  it('answers 404 for a client of another organization', async () => {
    mockUpstream({ clients: () => Response.json(null) });
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });
});

describe('GET /clients/{clientId}/documents', () => {
  it('lists the documents with their current revisions and the last generation', async () => {
    mockUpstream();
    const response = await request(`/clients/${clientId}/documents`);
    expect(response.status).toBe(200);
    const body = clientDocumentListResponseSchema.parse(await response.json());
    expect(body.lastGeneration).toEqual({ issueDate: '2026-01-19', firstDecisionNumber: 3 });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      typeKey: 'decision_first_aid',
      decisionNumber: 3,
      issued: null,
      draft: { id: revisionId, status: 'draft', issueDate: '2026-01-19', dataChanged: false },
    });
  });

  it('marks a draft whose printed data has changed since', async () => {
    mockUpstream({
      clients: () => Response.json({ ...clientRow, legal_representative_name: 'Alt NUME' }),
    });
    const body = clientDocumentListResponseSchema.parse(
      await (await request(`/clients/${clientId}/documents`)).json()
    );
    expect(body.items[0]!.draft!.dataChanged).toBe(true);
  });

  it('ignores data the document did not print, and the key order of jsonb', async () => {
    mockUpstream({
      persons: () => Response.json([personRow, { ...personRow, full_name: 'Ioana PETRE' }]),
      documents: () =>
        Response.json([
          {
            ...documentRow,
            document_revisions: [
              {
                ...revisionRow,
                data_snapshot: {
                  decisionNumber: 3,
                  client: {
                    representativeRole: 'Administrator',
                    representativeName: 'Florin TALOȘ',
                    legalName: 'S.C. PIPETECH S.R.L.',
                  },
                },
              },
            ],
          },
        ]),
    });
    const body = clientDocumentListResponseSchema.parse(
      await (await request(`/clients/${clientId}/documents`)).json()
    );
    expect(body.items[0]!.draft!.dataChanged).toBe(false);
  });

  it('puts the documents in the order of the pack', async () => {
    mockUpstream({
      documents: () =>
        Response.json([
          { ...documentRow, id: crypto.randomUUID(), type_key: 'control_regulation' },
          { ...documentRow, id: crypto.randomUUID(), type_key: 'cover_decisions' },
          documentRow,
        ]),
    });
    const body = clientDocumentListResponseSchema.parse(
      await (await request(`/clients/${clientId}/documents`)).json()
    );
    expect(body.items.map((item) => item.typeKey)).toEqual([
      'cover_decisions',
      'decision_first_aid',
      'control_regulation',
    ]);
  });
});

describe('POST /clients/{clientId}/documents/generate', () => {
  const generate = (body: unknown = { issueDate: '2026-01-19', firstDecisionNumber: 3 }) =>
    request(`/clients/${clientId}/documents/generate`, 'POST', body);

  it('creates what the client lacks from the newest template versions', async () => {
    let listed = 0;
    mockUpstream({
      documents: (init) => {
        if (init?.method === 'POST') return Response.json({ id: documentId });
        listed += 1;
        // Nothing before, the new document after.
        return Response.json(listed === 1 ? [] : [documentRow]);
      },
    });
    const response = await generate();
    expect(response.status).toBe(201);
    const body = generateDocumentsResponseSchema.parse(await response.json());
    expect(body.skipped).toEqual([]);
    expect(body.created.map((item) => item.typeKey)).toEqual(['decision_first_aid']);

    expect(sentBody('/rest/v1/document_generations')).toMatchObject({
      organization_id: organizationId,
      client_id: clientId,
      issue_date: '2026-01-19',
      first_decision_number: 3,
      created_by: user.id,
    });
    // Training is 3, the evaluation team 4, first aid 5; the report form has no number.
    const documents = [0, 1].map((index) => sentBody('/rest/v1/client_documents', index));
    expect(documents).toContainEqual(
      expect.objectContaining({ type_key: 'decision_first_aid', decision_number: 5 })
    );
    expect(documents).toContainEqual(
      expect.objectContaining({ type_key: 'control_report', decision_number: null })
    );
    const revisions = [0, 1].map((index) => sentBody('/rest/v1/document_revisions', index));
    expect(revisions).toContainEqual(
      expect.objectContaining({
        template_version_id: 'v2',
        generation_id: generationId,
        revision: 1,
        docx_path: `${organizationId}/${clientId}/${documentId}/1.docx`,
        data_snapshot: { client: printedClient, decisionNumber: 5 },
      })
    );
    expect(
      calls('/storage/v1/object/document-templates/built-in/decision_first_aid/new.docx')
    ).toHaveLength(1);
    expect(calls('/storage/v1/object/documents/', 'POST')).toHaveLength(2);
  });

  it('leaves the documents the client already has', async () => {
    mockUpstream({ templates: () => Response.json([templateRows[0]]) });
    const response = await generate();
    expect(response.status).toBe(201);
    expect(generateDocumentsResponseSchema.parse(await response.json())).toEqual({
      created: [],
      skipped: ['decision_first_aid'],
    });
    expect(calls('/rest/v1/document_generations', 'POST')).toHaveLength(0);
  });

  it('refuses while data is missing, with a reason the app can act on', async () => {
    mockUpstream({ persons: () => Response.json([]) });
    const response = await generate();
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'missing_document_data'
    );
    expect(calls('/rest/v1/document_generations', 'POST')).toHaveLength(0);
  });

  it('refuses an archived client', async () => {
    mockUpstream({
      clients: () => Response.json({ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }),
    });
    expect((await generate()).status).toBe(409);
  });

  it('says so when no template is registered', async () => {
    mockUpstream({ templates: () => Response.json([]) });
    expect((await generate()).status).toBe(503);
  });

  it('takes the revision back when its file cannot be stored', async () => {
    mockUpstream({
      documents: (init) =>
        init?.method === 'POST' ? Response.json({ id: documentId }) : Response.json([]),
      templates: () => Response.json([templateRows[1]]),
      upload: () => Response.json({ statusCode: '500', message: 'down' }, { status: 500 }),
    });
    const response = await generate();
    expect(response.status).toBe(503);
    expect(calls('/rest/v1/document_revisions', 'DELETE')).toHaveLength(1);
  });

  it('validates the date and the first number', async () => {
    mockUpstream();
    expect((await generate({ issueDate: '19.01.2026' })).status).toBe(400);
    expect((await generate({ issueDate: '2026-01-19', firstDecisionNumber: 9997 })).status).toBe(
      400
    );
  });
});

describe('GET /documents/{documentId}/revisions/{revisionId}/download', () => {
  it('signs a link that downloads under the name of the document', async () => {
    mockUpstream();
    const response = await request(`/documents/${documentId}/revisions/${revisionId}/download`);
    expect(response.status).toBe(200);
    const body = documentDownloadResponseSchema.parse(await response.json());
    expect(body.fileName).toBe('Copertă - Deciziile interne (rev. 1).docx');
    expect(body.expiresInSeconds).toBe(60);
    expect(body.url).toContain('https://example.supabase.co/storage/v1/object/sign/documents/');
    expect(body.url).toContain('download=');
  });

  it('answers 404 for a revision of another organization', async () => {
    mockUpstream({ revisions: () => Response.json(null) });
    const response = await request(`/documents/${documentId}/revisions/${revisionId}/download`);
    expect(response.status).toBe(404);
  });
});
