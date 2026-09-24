import {
  apiErrorResponseSchema,
  clientDocumentListResponseSchema,
  clientDocumentResponseSchema,
  documentDownloadResponseSchema,
  documentReadinessResponseSchema,
  generateDocumentsResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';

// The engine is tested in its own package, against the real templates. Here it prints the
// client and, for a decision, its number, and a file's text is its bytes read as text.
vi.mock('@ssm-usor/document-engine', () => ({
  TemplateError: class TemplateError extends Error {},
  documentText: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
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
  periodic_training_minutes: 120,
  administrative_training_interval_months: 6,
  administrative_training_not_applicable: false,
  worker_training_interval_months: 3,
  worker_training_not_applicable: false,
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
  docx_path: `${organizationId}/${clientId}/${documentId}/1.docx`,
  data_snapshot: { client: printedClient, decisionNumber: 3 },
  edited_at: null,
  issued_at: null,
  pdf_path: null,
  created_at: '2026-09-19T10:00:00+00:00',
  document_generations: { issue_date: '2026-01-19' },
};
const positionRow = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Sudor',
  staff_category: 'execution',
  work_zone: 'Atelier',
  activities: null,
  needs_protective_equipment: true,
  job_position_equipment: [
    {
      id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      risk: 'Lovituri',
      item: 'Cască',
      quantity: 1,
      duration_months: 24,
      allocation: 'personal_inventory',
      created_at: '2026-09-24T10:00:00+00:00',
    },
  ],
};
const documentRow = {
  id: documentId,
  client_id: clientId,
  type_key: 'decision_first_aid',
  title: 'Decizia privind responsabilii cu primul ajutor',
  decision_number: 3,
  document_group: 'documentation_set',
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
  | 'employees'
  | 'positions'
  | 'documents'
  | 'generatedDecision'
  | 'generations'
  | 'templates'
  | 'revisions'
  | 'issue'
  | 'file'
  | 'upload'
  | 'signedCopies';

const fetchMock = vi.fn<typeof fetch>();
const confirmedCopy = {
  revision_id: revisionId,
  source: 'owner',
  confirmed_at: '2026-09-21T11:00:00+00:00',
  uploaded_at: '2026-09-21T11:00:00+00:00',
};

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
      if (method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      // Files are read through the link just signed.
      if (url.pathname.startsWith('/storage/v1/object/sign/document-templates/')) {
        return new Response(new Uint8Array([1, 2, 3]));
      }
      return handlers.file?.(init, url) ?? new Response(new Uint8Array([1, 2, 3]));
    }
    if (url.pathname.startsWith('/storage/v1/object/documents')) {
      if (method === 'DELETE') return Response.json([]);
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
      case '/rest/v1/employees':
        return (
          handlers.employees?.(init, url) ??
          new Response(null, { headers: { 'content-range': '0-0/1' } })
        );
      case '/rest/v1/job_positions':
        return handlers.positions?.(init, url) ?? Response.json([positionRow]);
      case '/rest/v1/client_documents':
        if (method === 'HEAD') {
          return (
            handlers.generatedDecision?.() ??
            new Response(null, { headers: { 'content-range': '*/0' } })
          );
        }
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
      case '/rest/v1/document_signed_copies':
        return handlers.signedCopies?.(init, url) ?? new Response(null, { status: 201 });
      case '/rest/v1/rpc/issue_document_revision':
        return handlers.issue?.(init, url) ?? new Response(null, { status: 204 });
      case '/rest/v1/document_templates':
        return handlers.templates?.() ?? Response.json(templateRows);
      case '/rest/v1/document_revisions':
        return (
          handlers.revisions?.(init, url) ??
          (method === 'POST'
            ? Response.json({ id: revisionId })
            : method === 'DELETE' || method === 'PATCH'
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

const sentBody = (pathname: string, index = 0, method = 'POST') =>
  JSON.parse(String(calls(pathname, method)[index]![1]?.body)) as Record<string, unknown>;

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
      currentEmployeeCount: 1,
      workersRepresentativeClash: null,
      undecidedJobPositions: [],
    });
    const positions = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname === '/rest/v1/job_positions')!;
    expect(positions.searchParams.get('archived_at')).toBe('is.null');
    expect(positions.searchParams.get('order')).toBe('name.asc,id.asc');
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
      currentEmployeeCount: 1,
      workersRepresentativeClash: null,
      undecidedJobPositions: [],
    });
  });

  it('names the positions whose equipment is undecided, and needs at least one position', async () => {
    mockUpstream({
      positions: () =>
        Response.json([
          positionRow,
          {
            ...positionRow,
            id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
            name: 'Zidar',
            needs_protective_equipment: null,
            job_position_equipment: [],
          },
        ]),
    });
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(documentReadinessResponseSchema.parse(await response.json())).toMatchObject({
      ready: false,
      missing: ['positions.equipment'],
      undecidedJobPositions: [{ id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Zidar' }],
    });
    mockUpstream({ positions: () => Response.json([]) });
    const none = await request(`/clients/${clientId}/documents/readiness`);
    expect(documentReadinessResponseSchema.parse(await none.json()).missing).toEqual([
      'positions.any',
    ]);
  });

  it("names the workers' representative who has the legal representative's name", async () => {
    mockUpstream({
      persons: () =>
        Response.json([
          personRow,
          {
            full_name: 'Talos Florin',
            job_title: 'Vânzător',
            roles: ['workers_representative'],
            employees: { status: 'active', archived_at: null },
          },
        ]),
      employees: () => new Response(null, { headers: { 'content-range': '0-0/12' } }),
    });
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(documentReadinessResponseSchema.parse(await response.json())).toMatchObject({
      missing: ['responsible.workers_representative_is_legal_representative'],
      workersRepresentativeClash: {
        representativeName: 'Talos Florin',
        legalRepresentativeName: 'Florin TALOȘ',
      },
    });
  });

  it('allows a confirmed single category with no employees in the excluded category', async () => {
    mockUpstream({
      clients: () =>
        Response.json({
          ...clientRow,
          worker_training_interval_months: null,
          worker_training_not_applicable: true,
        }),
      employees: (_init, url) =>
        new Response(null, {
          headers: {
            'content-range':
              url?.searchParams.get('job_positions.staff_category') === 'eq.execution'
                ? '*/0'
                : '0-0/1',
          },
        }),
    });
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(documentReadinessResponseSchema.parse(await response.json())).toEqual({
      ready: true,
      missing: [],
      currentEmployeeCount: 1,
      workersRepresentativeClash: null,
      undecidedJobPositions: [],
    });
  });

  it('blocks an excluded category when an active employee holds it', async () => {
    mockUpstream({
      clients: () =>
        Response.json({
          ...clientRow,
          worker_training_interval_months: null,
          worker_training_not_applicable: true,
        }),
    });
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(documentReadinessResponseSchema.parse(await response.json())).toMatchObject({
      ready: false,
      missing: ['client.trainingSchedule'],
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
    expect(body.currentEmployeeCount).toBe(1);
    expect(body.notApplicable).toEqual(['decision_workers_representative']);
    // The documentation set only: the client's other documents have their own routes.
    expect(
      new URL(String(calls('/rest/v1/client_documents')[0]![0])).searchParams.get('document_group')
    ).toBe('eq.documentation_set');
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
      calls(
        '/storage/v1/object/sign/document-templates/built-in/decision_first_aid/new.docx',
        'POST'
      )
    ).toHaveLength(1);
    expect(calls('/storage/v1/object/documents/', 'POST')).toHaveLength(2);
  });

  it('leaves out decision 1.5 under 10 current employees', async () => {
    const workersRepresentativeTemplate = {
      type_key: 'decision_workers_representative',
      title: 'Decizia privind reprezentanții lucrătorilor',
      document_template_versions: [
        {
          id: 'v4',
          version: 1,
          storage_path: 'built-in/decision_workers_representative/one.docx',
        },
      ],
    };
    mockUpstream({
      templates: () => Response.json([workersRepresentativeTemplate, templateRows[1]]),
      documents: (init) =>
        init?.method === 'POST' ? Response.json({ id: documentId }) : Response.json([]),
    });
    expect((await generate()).status).toBe(201);
    expect(sentBody('/rest/v1/client_documents')).toMatchObject({ type_key: 'control_report' });
    expect(calls('/rest/v1/client_documents', 'POST')).toHaveLength(1);
    expect(
      calls(
        '/storage/v1/object/document-templates/built-in/decision_workers_representative/one.docx'
      )
    ).toHaveLength(0);
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

  it('generates for a client with only administrative personnel', async () => {
    let listed = 0;
    mockUpstream({
      clients: () =>
        Response.json({
          ...clientRow,
          worker_training_interval_months: null,
          worker_training_not_applicable: true,
        }),
      employees: (_init, url) =>
        new Response(null, {
          headers: {
            'content-range':
              url?.searchParams.get('job_positions.staff_category') === 'eq.execution'
                ? '*/0'
                : '0-0/1',
          },
        }),
      documents: (init) => {
        if (init?.method === 'POST') return Response.json({ id: documentId });
        listed += 1;
        return Response.json(listed === 1 ? [] : [documentRow]);
      },
      templates: () => Response.json([templateRows[0]]),
    });
    const response = await generate();
    expect(response.status).toBe(201);
    expect(generateDocumentsResponseSchema.parse(await response.json()).created).toHaveLength(1);
  });

  it('refuses generation after an employee moves into an excluded category', async () => {
    mockUpstream({
      clients: () =>
        Response.json({
          ...clientRow,
          worker_training_interval_months: null,
          worker_training_not_applicable: true,
        }),
    });
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
    expect(body.fileName).toBe('Copertă - Deciziile interne - rev. 1.docx');
    expect(body.expiresInSeconds).toBe(60);
    expect(body.url).toContain('https://example.supabase.co/storage/v1/object/sign/documents/');
    expect(body.url).toContain('download=');
  });

  it('links to the PDF of an issued revision, and says when there is none', async () => {
    const path = `${organizationId}/${clientId}/${documentId}/1`;
    const revision = (pdf_path: string | null) => () =>
      Response.json({
        docx_path: `${path}.docx`,
        pdf_path,
        revision: 1,
        client_documents: { title: 'Copertă – Deciziile interne' },
      });
    const url = `/documents/${documentId}/revisions/${revisionId}/download?format=pdf`;

    mockUpstream({ revisions: revision(`${path}.pdf`) });
    const response = await request(url);
    expect(response.status).toBe(200);
    expect(documentDownloadResponseSchema.parse(await response.json()).fileName).toBe(
      'Copertă - Deciziile interne - rev. 1.pdf'
    );
    expect(String(calls('/storage/v1/object/sign/documents/', 'POST')[0]![0])).toContain('1.pdf');

    mockUpstream({ revisions: revision(null) });
    expect((await request(url)).status).toBe(404);
    expect((await request(url.replace('pdf', 'odt'))).status).toBe(400);
  });

  it('answers 404 for a revision of another organization', async () => {
    mockUpstream({ revisions: () => Response.json(null) });
    const response = await request(`/documents/${documentId}/revisions/${revisionId}/download`);
    expect(response.status).toBe(404);
  });
});

const issuedRevision = {
  ...revisionRow,
  status: 'issued',
  issued_at: '2026-09-19T11:00:00+00:00',
};

describe('POST /documents/{documentId}/regenerate', () => {
  const regenerate = (body: unknown = {}) =>
    request(`/documents/${documentId}/regenerate`, 'POST', body);
  // The handlers read one document with maybeSingle, which takes an object.
  const oneDocument = (revisions: unknown[]) => () =>
    Response.json({ ...documentRow, document_revisions: revisions });

  it('overwrites the draft in place, keeping the date and the decision number', async () => {
    mockUpstream({ documents: oneDocument([revisionRow]) });
    const response = await regenerate();
    expect(response.status).toBe(200);
    expect(clientDocumentResponseSchema.parse(await response.json()).document.id).toBe(documentId);
    expect(sentBody('/rest/v1/document_generations')).toMatchObject({
      issue_date: '2026-01-19',
      first_decision_number: 3,
    });
    expect(calls('/rest/v1/document_revisions', 'POST')).toHaveLength(0);
    expect(sentBody('/rest/v1/document_revisions', 0, 'PATCH')).toEqual({
      template_version_id: 'v2',
      generation_id: generationId,
      data_snapshot: { client: printedClient, decisionNumber: 3 },
      edited_at: null,
      edited_by: null,
    });
    const [upload] = calls('/storage/v1/object/documents/', 'POST');
    expect(new URL(String(upload![0])).pathname).toContain(`${documentId}/1.docx`);
    expect(new Headers(upload![1]?.headers).get('x-upsert')).toBe('true');
  });

  it('starts revision 2 next to an issued revision, with a new date when given', async () => {
    mockUpstream({ documents: oneDocument([issuedRevision]) });
    const response = await regenerate({ issueDate: '2026-03-01' });
    expect(response.status).toBe(200);
    expect(sentBody('/rest/v1/document_generations')).toMatchObject({ issue_date: '2026-03-01' });
    expect(sentBody('/rest/v1/document_revisions')).toMatchObject({
      revision: 2,
      docx_path: `${organizationId}/${clientId}/${documentId}/2.docx`,
    });
    expect(calls('/rest/v1/document_revisions', 'PATCH')).toHaveLength(0);
  });

  it('asks for a date when the document was never generated', async () => {
    mockUpstream({
      documents: oneDocument([{ ...revisionRow, document_generations: null, data_snapshot: null }]),
    });
    const response = await regenerate();
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe('issueDate');
  });

  it('refuses while data is missing, and a type without a template', async () => {
    mockUpstream({ documents: oneDocument([revisionRow]), persons: () => Response.json([]) });
    const missing = await regenerate();
    expect(missing.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await missing.json()).reason).toBe('missing_document_data');

    mockUpstream({ documents: oneDocument([revisionRow]), templates: () => Response.json([]) });
    expect((await regenerate()).status).toBe(409);
  });

  it('refuses a decision 1.5 kept under 10 employees once nobody represents the workers', async () => {
    mockUpstream({
      documents: () =>
        Response.json({ ...documentRow, type_key: 'decision_workers_representative' }),
    });
    const response = await regenerate();
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'missing_document_data'
    );
  });

  it('leaves a document that is not of the documentation set to its own page', async () => {
    mockUpstream({
      documents: () =>
        Response.json({ ...documentRow, type_key: 'service_contract', document_group: 'other' }),
    });
    expect((await regenerate()).status).toBe(409);
    expect(calls('/rest/v1/document_templates')).toHaveLength(0);
  });

  it('answers 404 for a document of another organization', async () => {
    mockUpstream({ documents: () => Response.json(null) });
    expect((await regenerate()).status).toBe(404);
  });
});

describe('POST /documents/{documentId}/issue', () => {
  const issue = (body?: unknown) => request(`/documents/${documentId}/issue`, 'POST', body);

  it('issues the draft with the hash of its file', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
    });
    const response = await issue();
    expect(response.status).toBe(200);
    expect(sentBody('/rest/v1/rpc/issue_document_revision')).toEqual({
      p_revision_id: revisionId,
      // sha256 of the three bytes the storage mock serves.
      p_docx_sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    });
  });

  it('issues nothing for an archived client, before reading the file', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
      clients: () => Response.json({ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }),
    });
    const response = await issue();
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
    expect(calls('/storage/v1/object/sign/documents/', 'POST')).toHaveLength(0);
    expect(calls('/rest/v1/rpc/issue_document_revision')).toHaveLength(0);
  });

  // The converter is apps/pdf behind a service binding, switched on by the deployment.
  const pdfBytes = new TextEncoder().encode('%PDF-1.7 converted');
  const issueWith = (convertDocx: (docx: ArrayBuffer) => Promise<ArrayBuffer>) =>
    createApp().request(
      `/documents/${documentId}/issue`,
      { method: 'POST', headers: { Authorization: 'Bearer test-access-token' } },
      { ...env, PDF_CONVERSION: 'service', PDF: { convertDocx } }
    );

  it('makes the PDF first, stores it beside the Word file, and issues both', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
    });
    const convertDocx = vi.fn(async (docx: ArrayBuffer) => {
      void docx;
      return pdfBytes.slice().buffer;
    });
    expect((await issueWith(convertDocx)).status).toBe(200);

    expect(new Uint8Array(convertDocx.mock.calls[0]![0])).toEqual(new Uint8Array([1, 2, 3]));
    const [stored] = calls('/storage/v1/object/documents/', 'POST');
    expect(new URL(String(stored![0])).pathname).toContain(`${documentId}/1.pdf`);
    expect(new Headers(stored![1]?.headers).get('content-type')).toContain('application/pdf');
    const sent = sentBody('/rest/v1/rpc/issue_document_revision');
    expect(sent.p_pdf_path).toBe(`${organizationId}/${clientId}/${documentId}/1.pdf`);
    expect(sent.p_pdf_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sent.p_pdf_sha256).not.toBe(sent.p_docx_sha256);
  });

  it('issues nothing when the PDF cannot be made, and ignores the binding unless switched on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
    });
    const failing = await issueWith(async () => Promise.reject(new Error('pdf_conversion_failed')));
    expect(failing.status).toBe(503);
    expect(apiErrorResponseSchema.parse(await failing.json()).reason).toBe('pdf_unavailable');
    expect(calls('/rest/v1/rpc/issue_document_revision', 'POST')).toHaveLength(0);

    // `wrangler dev` has the binding too, with nothing behind it.
    const convertDocx = vi.fn();
    const local = await createApp().request(
      `/documents/${documentId}/issue`,
      { method: 'POST', headers: { Authorization: 'Bearer test-access-token' } },
      { ...env, PDF: { convertDocx } }
    );
    expect(local.status).toBe(200);
    expect(convertDocx).not.toHaveBeenCalled();
    expect(sentBody('/rest/v1/rpc/issue_document_revision').p_pdf_path).toBeUndefined();
  });

  it('asks before issuing a file that still has text to fill in', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
      file: () => new Response('Riscuri specifice: DE COMPLETAT'),
    });
    const refused = await issue();
    expect(refused.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await refused.json()).reason).toBe('unfilled_text');
    expect(calls('/rest/v1/rpc/issue_document_revision', 'POST')).toHaveLength(0);

    expect((await issue({ acceptUnfilled: false })).status).toBe(409);
    expect((await issue({ acceptUnfilled: true })).status).toBe(200);
    expect(calls('/rest/v1/rpc/issue_document_revision', 'POST')).toHaveLength(1);
    expect((await issue({ acceptUnfilled: 'yes' })).status).toBe(400);
  });

  it('refuses a document without a draft, and a draft someone else just issued', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [issuedRevision] }),
    });
    expect((await issue()).status).toBe(409);
    expect(calls('/rest/v1/rpc/issue_document_revision', 'POST')).toHaveLength(0);

    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
      issue: () =>
        Response.json(
          { code: 'DOC02', message: 'Only a draft can be issued.', details: null, hint: null },
          { status: 400 }
        ),
    });
    expect((await issue()).status).toBe(409);
  });
});

describe('POST /documents/{documentId}/draft', () => {
  const start = () => request(`/documents/${documentId}/draft`, 'POST');
  const issued = { ...issuedRevision, generation_id: generationId };
  const editedAt = '2026-09-19T10:30:00+00:00';
  const revisions: Handler = (init) =>
    init?.method === 'POST'
      ? Response.json({ id: revisionId })
      : init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ template_version_id: 'v2', edited_at: editedAt, edited_by: user.id });
  const issuedDocument = () => Response.json({ ...documentRow, document_revisions: [issued] });

  it('copies the issued file into revision 2, with where it came from', async () => {
    const file = new Uint8Array([80, 75, 3, 4, 9, 9]);
    mockUpstream({ documents: issuedDocument, revisions, file: () => new Response(file) });
    const response = await start();
    expect(response.status).toBe(200);
    clientDocumentResponseSchema.parse(await response.json());

    expect(sentBody('/rest/v1/document_revisions')).toMatchObject({
      revision: 2,
      docx_path: `${organizationId}/${clientId}/${documentId}/2.docx`,
      template_version_id: 'v2',
      generation_id: generationId,
      data_snapshot: issued.data_snapshot,
      edited_at: editedAt,
      edited_by: user.id,
    });
    const [read] = calls('/storage/v1/object/sign/documents/', 'POST');
    expect(String(read![0])).toContain(issued.docx_path);
    const [written] = calls('/storage/v1/object/documents/', 'POST');
    expect(String(written![0])).toContain('/2.docx');
    expect(new Uint8Array(await new Response(written![1]?.body).arrayBuffer())).toEqual(file);
    expect(calls('/rest/v1/document_generations', 'POST')).toHaveLength(0);
  });

  it('refuses a document that has a draft, and one with nothing issued', async () => {
    mockUpstream({
      documents: () =>
        Response.json({
          ...documentRow,
          document_revisions: [issued, { ...revisionRow, revision: 2 }],
        }),
    });
    const taken = await start();
    expect(taken.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await taken.json()).reason).toBe('draft_exists');

    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [] }),
    });
    expect((await start()).status).toBe(409);
    expect(calls('/rest/v1/document_revisions', 'POST')).toHaveLength(0);
  });

  it('starts nothing for an archived client, before reading the file', async () => {
    mockUpstream({
      documents: issuedDocument,
      clients: () => Response.json({ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }),
    });
    expect((await start()).status).toBe(409);
    expect(calls('/storage/v1/object/sign/documents/', 'POST')).toHaveLength(0);
    expect(calls('/rest/v1/document_revisions', 'POST')).toHaveLength(0);
  });

  it('removes the revision again when the file cannot be stored', async () => {
    mockUpstream({
      documents: issuedDocument,
      revisions,
      upload: () => Response.json({ message: 'down' }, { status: 500 }),
    });
    expect((await start()).status).toBeGreaterThanOrEqual(500);
    expect(calls('/rest/v1/document_revisions', 'DELETE')).toHaveLength(1);
  });
});

describe('the copy received through the return link', () => {
  const receivedCopy = {
    revision_id: revisionId,
    source: 'client',
    confirmed_at: null,
    uploaded_at: '2026-09-22T09:00:00+00:00',
  };
  const confirm = () => request(`/documents/${documentId}/signed-copy/confirm`, 'POST');

  it('is reported as received, not signed, until an owner confirms it', async () => {
    let confirmed = false;
    mockUpstream({
      documents: (_init, url) => {
        const document = {
          ...documentRow,
          document_revisions: [
            {
              ...issuedRevision,
              document_signed_copies: confirmed
                ? { ...receivedCopy, confirmed_at: '2026-09-23T09:00:00+00:00' }
                : receivedCopy,
            },
          ],
        };
        // The list, or the one document read before confirming.
        return Response.json(url?.searchParams.has('id') ? document : [document]);
      },
      signedCopies: (init) => {
        expect(init?.method).toBe('PATCH');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          confirmed_at: expect.any(String),
          confirmed_by: user.id,
        });
        confirmed = true;
        return new Response(null, { status: 204 });
      },
    });
    const listed = await request(`/clients/${clientId}/documents`);
    const before = clientDocumentListResponseSchema.parse(await listed.json());
    expect(before.items[0]!.issued).toMatchObject({
      hasSignedCopy: false,
      receivedCopy: { uploadedAt: '2026-09-22T09:00:00+00:00' },
    });

    const response = await confirm();
    expect(response.status).toBe(200);
    const { document } = clientDocumentResponseSchema.parse(await response.json());
    expect(document.issued).toMatchObject({ hasSignedCopy: true, receivedCopy: null });
  });

  it('cannot be confirmed twice, nor where nothing was received', async () => {
    mockUpstream({
      documents: () =>
        Response.json({
          ...documentRow,
          document_revisions: [{ ...issuedRevision, document_signed_copies: confirmedCopy }],
        }),
    });
    const response = await confirm();
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('no_received_copy');
    expect(calls('/rest/v1/document_signed_copies', 'PATCH')).toHaveLength(0);
  });
});

describe('the signed copy of an issued revision', () => {
  const pdf = new Uint8Array([...new TextEncoder().encode('%PDF-1.7 signed'), 1, 2, 3]);
  const attach = (body: Uint8Array = pdf) =>
    createApp().request(
      `/documents/${documentId}/signed-copy`,
      {
        method: 'PUT',
        headers: { Authorization: 'Bearer test-access-token', 'Content-Type': 'application/pdf' },
        body: new Uint8Array(body),
      },
      env
    );
  const issuedDocument = () =>
    Response.json({ ...documentRow, document_revisions: [issuedRevision] });
  const signedPath = `${organizationId}/${clientId}/${documentId}/1.signed.pdf`;

  it('records the copy with its hash beside the issued revision, then stores the file', async () => {
    mockUpstream({ documents: issuedDocument });
    const response = await attach();
    expect(response.status).toBe(200);
    clientDocumentResponseSchema.parse(await response.json());

    const [input, init] = calls('/rest/v1/document_signed_copies', 'POST')[0]!;
    expect(new URL(String(input)).searchParams.get('on_conflict')).toBe('revision_id');
    const row = JSON.parse(String(init?.body));
    expect(row).toMatchObject({
      revision_id: revisionId,
      organization_id: organizationId,
      document_id: documentId,
      storage_path: signedPath,
      uploaded_by: user.id,
    });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    const [written] = calls('/storage/v1/object/documents/', 'POST');
    expect(String(written![0])).toContain('/1.signed.pdf');
    // The row is written before the file: the policies let a file in only where a row says.
    const order = fetchMock.mock.calls.map(([call]) => new URL(String(call)).pathname);
    expect(order.indexOf('/rest/v1/document_signed_copies')).toBeLessThan(
      order.findIndex((path) => path.endsWith('/1.signed.pdf'))
    );
  });

  it('says that a revision has one, and links to it under a name that says what it is', async () => {
    mockUpstream({
      documents: () =>
        Response.json([
          {
            ...documentRow,
            document_revisions: [{ ...issuedRevision, document_signed_copies: confirmedCopy }],
          },
        ]),
      revisions: () =>
        Response.json({
          docx_path: issuedRevision.docx_path,
          pdf_path: null,
          revision: 1,
          client_documents: { title: 'Contract de prestări servicii' },
          document_signed_copies: { storage_path: signedPath },
        }),
    });
    const list = clientDocumentListResponseSchema.parse(
      await (await request(`/clients/${clientId}/documents`)).json()
    );
    expect(list.items[0]!.issued?.hasSignedCopy).toBe(true);

    const link = documentDownloadResponseSchema.parse(
      await (
        await request(`/documents/${documentId}/revisions/${revisionId}/download?format=signed`)
      ).json()
    );
    expect(link.fileName).toBe('Contract de prestări servicii - rev. 1 - semnat.pdf');
  });

  it('answers 404 for the signed copy of a revision that has none', async () => {
    mockUpstream({});
    const response = await request(
      `/documents/${documentId}/revisions/${revisionId}/download?format=signed`
    );
    expect(response.status).toBe(404);
  });

  it('takes the first copy back when its file cannot be stored, and keeps an earlier one', async () => {
    mockUpstream({
      documents: issuedDocument,
      upload: () => Response.json({ message: 'down' }, { status: 500 }),
    });
    expect((await attach()).status).toBeGreaterThanOrEqual(500);
    expect(calls('/rest/v1/document_signed_copies', 'DELETE')).toHaveLength(1);

    fetchMock.mockClear();
    mockUpstream({
      documents: () =>
        Response.json({
          ...documentRow,
          document_revisions: [{ ...issuedRevision, document_signed_copies: confirmedCopy }],
        }),
      upload: () => Response.json({ message: 'down' }, { status: 500 }),
    });
    expect((await attach()).status).toBeGreaterThanOrEqual(500);
    expect(calls('/rest/v1/document_signed_copies', 'DELETE')).toHaveLength(0);
  });

  it('refuses what is not a PDF, a document with nothing issued, and an archived client', async () => {
    mockUpstream({ documents: issuedDocument });
    expect((await attach(new Uint8Array([80, 75, 3, 4]))).status).toBe(400);

    mockUpstream({});
    const draftOnly = await attach();
    expect(draftOnly.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await draftOnly.json()).reason).toBe('not_issued');

    mockUpstream({
      documents: issuedDocument,
      clients: () => Response.json({ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }),
    });
    expect((await attach()).status).toBe(409);
    expect(calls('/rest/v1/document_signed_copies', 'POST')).toHaveLength(0);
  });

  it('removes the file, then the row, and refuses when there is none', async () => {
    mockUpstream({
      documents: () =>
        Response.json({
          ...documentRow,
          document_revisions: [{ ...issuedRevision, document_signed_copies: confirmedCopy }],
        }),
    });
    expect((await request(`/documents/${documentId}/signed-copy`, 'DELETE')).status).toBe(204);
    const [file] = calls('/storage/v1/object/documents', 'DELETE');
    expect(JSON.parse(String(file![1]?.body))).toEqual({ prefixes: [signedPath] });
    expect(calls('/rest/v1/document_signed_copies', 'DELETE')).toHaveLength(1);

    mockUpstream({ documents: issuedDocument });
    expect((await request(`/documents/${documentId}/signed-copy`, 'DELETE')).status).toBe(409);
  });
});

describe('DELETE /documents/{documentId}/draft', () => {
  const remove = () => request(`/documents/${documentId}/draft`, 'DELETE');

  it('keeps the draft of an archived client, file and row', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
      clients: () => Response.json({ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }),
    });
    expect((await remove()).status).toBe(409);
    expect(calls('/storage/v1/object/documents', 'DELETE')).toHaveLength(0);
    expect(calls('/rest/v1/document_revisions', 'DELETE')).toHaveLength(0);
  });

  it('removes the file, then the row', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
    });
    const response = await remove();
    expect(response.status).toBe(204);
    const [file] = calls('/storage/v1/object/documents', 'DELETE');
    expect(JSON.parse(String(file![1]?.body))).toEqual({ prefixes: [revisionRow.docx_path] });
    const [row] = calls('/rest/v1/document_revisions', 'DELETE');
    expect(new URL(String(row![0])).searchParams.get('id')).toBe(`eq.${revisionId}`);
  });

  it('refuses when there is no draft, so an issued revision is never touched', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [issuedRevision] }),
    });
    expect((await remove()).status).toBe(409);
    expect(calls('/storage/v1/object/documents', 'DELETE')).toHaveLength(0);
    expect(calls('/rest/v1/document_revisions', 'DELETE')).toHaveLength(0);
  });
});

describe('PUT /documents/{documentId}/draft/file', () => {
  const docx = new Uint8Array([
    0x50,
    0x4b,
    0x03,
    0x04,
    ...new TextEncoder().encode('…word/document.xml…'),
  ]);
  const save = (body: Uint8Array) =>
    createApp().request(
      `/documents/${documentId}/draft/file`,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer test-access-token',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        // A copy with a plain ArrayBuffer behind it, which is what a request body is typed to take.
        body: new Uint8Array(body),
      },
      env
    );
  const withDraft = () => Response.json({ ...documentRow, document_revisions: [revisionRow] });

  it('writes the bytes over the draft and marks it as edited by the caller', async () => {
    mockUpstream({ documents: withDraft });
    const response = await save(docx);
    expect(response.status).toBe(200);
    expect(clientDocumentResponseSchema.parse(await response.json()).document.id).toBe(documentId);

    const [upload] = calls('/storage/v1/object/documents/', 'POST');
    expect(new URL(String(upload![0])).pathname).toContain(`${documentId}/1.docx`);
    expect(new Headers(upload![1]?.headers).get('x-upsert')).toBe('true');
    const patch = sentBody('/rest/v1/document_revisions', 0, 'PATCH');
    expect(patch.edited_by).toBe(user.id);
    expect(Date.parse(String(patch.edited_at))).not.toBeNaN();
    expect(Object.keys(patch).sort()).toEqual(['edited_at', 'edited_by']);
  });

  it('writes nothing over the draft of an archived client', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [revisionRow] }),
      clients: () => Response.json({ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }),
    });
    expect((await save(docx)).status).toBe(409);
    expect(calls('/storage/v1/object/documents')).toHaveLength(0);
    expect(calls('/rest/v1/document_revisions', 'PATCH')).toHaveLength(0);
  });

  it('refuses what is not a Word document, before touching anything', async () => {
    mockUpstream({ documents: withDraft });
    for (const body of [
      new Uint8Array(),
      new TextEncoder().encode('%PDF-1.7 word/document.xml'),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
    ]) {
      expect((await save(body)).status).toBe(400);
    }
    expect(calls('/storage/v1/object/documents/', 'POST')).toHaveLength(0);
    expect(calls('/rest/v1/document_revisions', 'PATCH')).toHaveLength(0);
  });

  it('refuses a document without a draft, so an issued file is never written', async () => {
    mockUpstream({
      documents: () => Response.json({ ...documentRow, document_revisions: [issuedRevision] }),
    });
    expect((await save(docx)).status).toBe(409);
    expect(calls('/storage/v1/object/documents/', 'POST')).toHaveLength(0);
  });
});

describe('POST /clients/{clientId}/documents/{typeKey}/upload', () => {
  const docx = new Uint8Array([
    0x50,
    0x4b,
    0x03,
    0x04,
    ...new TextEncoder().encode('…word/document.xml…'),
  ]);
  const upload = (typeKey: string, body: Uint8Array = docx) =>
    createApp().request(
      `/clients/${clientId}/documents/${typeKey}/upload`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-access-token',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        body: new Uint8Array(body),
      },
      env
    );
  // The list of a client's documents is an array; one document, read again, is an object.
  const documents =
    (rows: unknown[]): Handler =>
    (init, url) =>
      init?.method === 'POST'
        ? Response.json({ id: documentId })
        : url?.searchParams.has('id')
          ? Response.json(rows[0] ?? { ...documentRow, type_key: 'risk_assessment' })
          : Response.json(rows);

  it('creates a document the app cannot generate, as revision 1 in draft', async () => {
    mockUpstream({ documents: documents([]) });
    const response = await upload('risk_assessment');
    expect(response.status).toBe(200);

    expect(sentBody('/rest/v1/client_documents')).toMatchObject({
      client_id: clientId,
      type_key: 'risk_assessment',
      title: 'Evaluarea riscurilor de accidentare și îmbolnăvire profesională',
    });
    const revision = sentBody('/rest/v1/document_revisions');
    expect(revision).toMatchObject({
      revision: 1,
      generation_id: null,
      docx_path: `${organizationId}/${clientId}/${documentId}/1.docx`,
      edited_by: user.id,
    });
    expect(revision.template_version_id).toBeUndefined();
    expect(calls('/storage/v1/object/documents/', 'POST')).toHaveLength(1);
  });

  it("replaces the draft's file of a document that has one", async () => {
    mockUpstream({ documents: documents([documentRow]) });
    expect((await upload('decision_first_aid')).status).toBe(200);
    expect(calls('/rest/v1/document_revisions', 'POST')).toHaveLength(0);
    expect(sentBody('/rest/v1/document_revisions', 0, 'PATCH').edited_by).toBe(user.id);
    const [file] = calls('/storage/v1/object/documents/', 'POST');
    expect(new Headers(file![1]?.headers).get('x-upsert')).toBe('true');
  });

  it('starts the next draft beside an issued revision, keeping its date', async () => {
    const issued = { ...issuedRevision, generation_id: generationId };
    mockUpstream({ documents: documents([{ ...documentRow, document_revisions: [issued] }]) });
    expect((await upload('decision_first_aid')).status).toBe(200);
    expect(calls('/rest/v1/client_documents', 'POST')).toHaveLength(0);
    expect(sentBody('/rest/v1/document_revisions')).toMatchObject({
      revision: 2,
      generation_id: generationId,
      docx_path: `${organizationId}/${clientId}/${documentId}/2.docx`,
    });
  });

  it('removes the revision again when the file cannot be stored', async () => {
    mockUpstream({
      documents: documents([]),
      upload: () => Response.json({ message: 'down' }, { status: 500 }),
    });
    expect((await upload('risk_assessment')).status).toBeGreaterThanOrEqual(500);
    expect(calls('/rest/v1/document_revisions', 'DELETE')).toHaveLength(1);
  });

  it('refuses a generated type that does not exist yet, other files, and unknown types', async () => {
    mockUpstream({ documents: documents([]) });
    const early = await upload('decision_first_aid');
    expect(early.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await early.json()).reason).toBe('not_generated_yet');
    expect((await upload('risk_assessment', new Uint8Array([1, 2, 3]))).status).toBe(400);
    expect((await upload('anything_else')).status).toBe(400);
    expect(calls('/storage/v1/object/documents/', 'POST')).toHaveLength(0);
  });

  it('refuses an archived client', async () => {
    mockUpstream({
      documents: documents([]),
      clients: () => Response.json({ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }),
    });
    expect((await upload('risk_assessment')).status).toBe(409);
  });
});
