import { apiErrorResponseSchema, serviceContractResponseSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';

// The engine is tested against the real template with the scripts. Here it prints whatever
// the data holds, which is what the snapshot then records.
vi.mock('@ssm-usor/document-engine', () => ({
  TemplateError: class TemplateError extends Error {},
  documentText: (bytes: Uint8Array) => new TextDecoder().decode(bytes),
  renderTemplate: (_template: Uint8Array, data: Record<string, unknown>) => ({
    document: new Uint8Array([80, 75, 3, 4]),
    usedNames: Object.keys(data),
  }),
}));

import type { MailService } from '@ssm-usor/contracts';

import type { ApiEnv } from '../../lib/env';
import { endDateOf, missingServiceContractData, type ServiceContractFacts } from './facts';

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

const clientRow: ServiceContractFacts['client'] = {
  legal_name: 'S.C. VELOCITA URBANA S.R.L.',
  cui: '41760933',
  vat_payer: false,
  caen_code: '5630',
  trade_register_number: 'J40/13726/2019',
  county_code: 'B',
  locality: 'București',
  address_line: 'Calea Victoriei 122A',
  legal_representative_name: 'Adnana POPA',
  legal_representative_role: 'Administrator',
  contact_phone: null,
  archived_at: null,
};
const organizationRow: ServiceContractFacts['organization'] = {
  legal_name: 'S.C. SAFETY S.R.L.',
  cui: '1590082',
  trade_register_number: 'J35/535/2022',
  county_code: 'TM',
  locality: 'Timișoara',
  address_line: 'Str. Lungă 5',
  legal_representative_name: 'Maria POPESCU',
  legal_representative_role: 'Administrator',
  phone: '0722 776 011',
  iban: 'RO49AAAA1B31007593840000',
  bank_name: 'Banca Transilvania',
  authorization_certificate_number: '17664',
  authorization_certificate_date: '2022-09-30',
  authorization_certificate_issuer: 'DMPS Timiș',
  vat_payer: false,
  fire_safety_technician_name: null,
  fire_safety_technician_certificate: null,
};
const contractRow = {
  contract_number: 51,
  contract_date: '2026-02-15',
  start_date: '2026-02-15',
  duration_months: 12,
  renews_automatically: true,
  covers_occupational_safety: true,
  covers_fire_safety: false,
};
const documentId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const revisionId = '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d';
const templateRow = {
  type_key: 'service_contract',
  title: 'Contract de prestări servicii',
  document_template_versions: [
    { id: 'v1', version: 1, storage_path: 'built-in/service_contract/a.docx' },
  ],
};
const draftRow = {
  id: revisionId,
  revision: 1,
  status: 'draft',
  docx_path: `${organizationId}/${clientId}/${documentId}/1.docx`,
  pdf_path: null,
  generation_id: null,
  data_snapshot: null as unknown,
  edited_at: null,
  issued_at: null,
  created_at: '2026-09-21T10:00:00+00:00',
  document_generations: null,
};
const documentRow = {
  id: documentId,
  client_id: clientId,
  type_key: 'service_contract',
  title: 'Contract de prestări servicii',
  decision_number: null,
  document_group: 'other',
  document_revisions: [draftRow],
};

const validBody = {
  contractNumber: 51,
  contractDate: '2026-02-15',
  startDate: '2026-02-15',
  durationMonths: 12,
};

type Handler = (init: RequestInit | undefined, url: URL) => Response;
type Upstream =
  | 'membership'
  | 'clients'
  | 'organizations'
  | 'contracts'
  | 'documents'
  | 'templates'
  | 'revisions'
  | 'upload'
  | 'sends'
  | 'profiles';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.startsWith('/storage/v1/object/document-templates/')) {
      return new Response(new Uint8Array([1, 2, 3]));
    }
    if (url.pathname.startsWith('/storage/v1/object/documents')) {
      return handlers.upload?.(init, url) ?? Response.json({ Key: 'documents/x' });
    }
    switch (url.pathname) {
      case '/rest/v1/service_contract_sends':
        return (
          handlers.sends?.(init, url) ??
          (init?.method === 'POST' ? new Response(null, { status: 201 }) : Response.json([]))
        );
      case '/rest/v1/profiles':
        return handlers.profiles?.(init, url) ?? Response.json([{ full_name: 'Olga Owner' }]);
      case '/rest/v1/document_templates':
        return handlers.templates?.(init, url) ?? Response.json([templateRow]);
      case '/rest/v1/document_revisions':
        return (
          handlers.revisions?.(init, url) ??
          (init?.method === 'POST'
            ? Response.json({ id: revisionId })
            : new Response(null, { status: 204 }))
        );
      case '/auth/v1/user':
        return Response.json(user);
      case '/rest/v1/rpc/current_membership':
        return handlers.membership?.(init, url) ?? Response.json([membership]);
      case '/rest/v1/clients':
        return handlers.clients?.(init, url) ?? Response.json([clientRow]);
      case '/rest/v1/organizations':
        return handlers.organizations?.(init, url) ?? Response.json(organizationRow);
      case '/rest/v1/service_contracts':
        return handlers.contracts?.(init, url) ?? Response.json([contractRow]);
      case '/rest/v1/client_documents':
        return handlers.documents?.(init, url) ?? Response.json([]);
      default:
        throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
    }
  });
}

const calls = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

const request = (method = 'GET', body?: unknown) =>
  createApp().request(
    `/clients/${clientId}/service-contract`,
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

describe('the end of a contract', () => {
  it.each([
    ['2024-02-15', 12, '2025-02-14'],
    ['2026-01-01', 12, '2026-12-31'],
    ['2026-01-31', 1, '2026-02-27'],
    ['2024-03-01', 24, '2026-02-28'],
  ])('%s for %i months ends on %s', (start, months, end) => {
    expect(endDateOf(start, months)).toBe(end);
  });
});

describe('what a contract is waiting for', () => {
  const facts = (overrides: Partial<ServiceContractFacts> = {}): ServiceContractFacts => ({
    client: clientRow,
    organization: organizationRow,
    contract: {
      contractNumber: 51,
      contractDate: '2026-02-15',
      startDate: '2026-02-15',
      durationMonths: 12,
      renewsAutomatically: true,
      coversOccupationalSafety: true,
      coversFireSafety: false,
      endDate: '2027-02-14',
    },
    ...overrides,
  });

  it('is nothing when everything is filled in', () => {
    expect(missingServiceContractData(facts())).toEqual([]);
  });

  it('names each place something is missing from', () => {
    expect(
      missingServiceContractData(
        facts({
          client: { ...clientRow, locality: null, legal_representative_role: null },
          organization: {
            ...organizationRow,
            bank_name: null,
            authorization_certificate_date: null,
          },
          contract: null,
        })
      )
    ).toEqual([
      'provider.bankAccount',
      'provider.authorizationCertificate',
      'client.address',
      'client.representativeRole',
      'contract.details',
    ]);
  });

  it('asks for the fire-safety technician only when fire safety is sold', () => {
    const selling = facts();
    selling.contract = { ...selling.contract!, coversFireSafety: true };
    expect(missingServiceContractData(selling)).toEqual(['provider.fireSafetyTechnician']);
  });
});

describe('GET /clients/{clientId}/service-contract', () => {
  it('returns the contract with its end, what is missing, and no suggestion', async () => {
    mockUpstream({});
    const response = await request();
    expect(response.status).toBe(200);
    expect(serviceContractResponseSchema.parse(await response.json())).toEqual({
      contract: {
        contractNumber: 51,
        contractDate: '2026-02-15',
        startDate: '2026-02-15',
        durationMonths: 12,
        renewsAutomatically: true,
        coversOccupationalSafety: true,
        coversFireSafety: false,
        endDate: '2027-02-14',
      },
      suggestedNumber: null,
      clientRepresentative: { name: 'Adnana POPA', role: 'Administrator' },
      readiness: { ready: true, missing: [] },
      document: null,
      lastSend: null,
      draftOutdated: false,
    });
    const [documents] = calls('/rest/v1/client_documents')[0]!;
    expect(new URL(String(documents)).searchParams.get('type_key')).toBe('eq.service_contract');
  });

  it.each([
    [[{ contract_number: 51 }], 52],
    [[], 1],
  ])(
    'suggests the next number of the year, or 1 in a year without one: %#',
    async (lastOfYear, expected) => {
      mockUpstream({
        contracts: (_init, url) =>
          url.searchParams.has('client_id')
            ? Response.json([])
            : url.searchParams.has('order')
              ? Response.json(lastOfYear)
              : Response.json([{ id: 'x' }]),
      });
      const body = serviceContractResponseSchema.parse(await (await request()).json());
      expect(body.contract).toBeNull();
      expect(body.suggestedNumber).toBe(expected);
      expect(body.readiness.missing).toEqual(['contract.details']);
    }
  );

  it('suggests nothing for the first contract of the organization', async () => {
    mockUpstream({ contracts: () => Response.json([]) });
    const body = serviceContractResponseSchema.parse(await (await request()).json());
    expect(body.suggestedNumber).toBeNull();
  });

  it('answers 404 for a client that is not there, and 403 for a specialist', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await request()).status).toBe(404);
    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await request()).status).toBe(403);
  });
});

describe('PUT /clients/{clientId}/service-contract', () => {
  it('updates the contract that is there, leaving the client alone', async () => {
    mockUpstream({
      contracts: (init) =>
        init?.method === 'PATCH' ? Response.json([{ id: 'x' }]) : Response.json([contractRow]),
    });
    const response = await request('PUT', validBody);
    expect(response.status).toBe(200);
    expect(calls('/rest/v1/clients', 'PATCH')).toHaveLength(0);
    expect(calls('/rest/v1/service_contracts', 'POST')).toHaveLength(0);
    const [url, init] = calls('/rest/v1/service_contracts', 'PATCH')[0]!;
    expect(new URL(String(url)).searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      contract_number: 51,
      contract_date: '2026-02-15',
      start_date: '2026-02-15',
      duration_months: 12,
      renews_automatically: true,
      covers_occupational_safety: true,
      covers_fire_safety: false,
      updated_by: user.id,
    });
  });

  it('creates the first one in the organization of the caller, and writes who signs on the client', async () => {
    mockUpstream({
      contracts: (init) =>
        init?.method === 'PATCH'
          ? Response.json([])
          : init?.method === 'POST'
            ? Response.json({ id: 'x' }, { status: 201 })
            : Response.json([contractRow]),
    });
    const response = await request('PUT', {
      ...validBody,
      coversFireSafety: true,
      clientRepresentativeName: ' Adnana POPA ',
      clientRepresentativeRole: 'Administrator',
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(String(calls('/rest/v1/clients', 'PATCH')[0]![1]?.body))).toEqual({
      legal_representative_name: 'Adnana POPA',
      legal_representative_role: 'Administrator',
    });
    expect(
      JSON.parse(String(calls('/rest/v1/service_contracts', 'POST')[0]![1]?.body))
    ).toMatchObject({
      organization_id: organizationId,
      client_id: clientId,
      covers_fire_safety: true,
      created_by: user.id,
    });
  });

  it('says so when the number is taken that year', async () => {
    mockUpstream({
      contracts: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ code: '23505', message: 'duplicate' }, { status: 409 })
          : Response.json([contractRow]),
    });
    const response = await request('PUT', validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'contract_number_taken'
    );
  });

  it('passes on the refusal for an archived client', async () => {
    mockUpstream({
      contracts: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ code: 'CLA01', message: 'archived' }, { status: 400 })
          : Response.json([contractRow]),
    });
    const response = await request('PUT', validBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });

  it.each([
    [{ ...validBody, contractNumber: 0 }, 'contractNumber'],
    [{ ...validBody, startDate: '15.02.2026' }, 'startDate'],
    [{ ...validBody, durationMonths: 121 }, 'durationMonths'],
    [{ ...validBody, coversOccupationalSafety: false }, 'coversOccupationalSafety'],
  ])('refuses %j before touching the database', async (body, path) => {
    mockUpstream({});
    const response = await request('PUT', body);
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(path);
    expect(calls('/rest/v1/service_contracts', 'PATCH')).toHaveLength(0);
  });

  it('writes nothing for a client that is not there, or for a specialist', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await request('PUT', validBody)).status).toBe(404);
    expect(calls('/rest/v1/service_contracts', 'PATCH')).toHaveLength(0);

    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await request('PUT', validBody)).status).toBe(403);
  });
});

describe('POST /clients/{clientId}/service-contract/generate', () => {
  const generate = () =>
    createApp().request(
      `/clients/${clientId}/service-contract/generate`,
      { method: 'POST', headers: { Authorization: 'Bearer test-access-token' } },
      env
    );
  // A list of a client's documents by type is an array; one document by id is an object.
  const documents =
    (existing: unknown[], byId: unknown = documentRow): Handler =>
    (init, url) =>
      init?.method === 'POST'
        ? Response.json({ id: documentId }, { status: 201 })
        : url.searchParams.has('id')
          ? Response.json(byId)
          : Response.json(existing);

  it('creates the contract as a document of the owners, with its first draft', async () => {
    mockUpstream({ documents: documents([], { ...documentRow, document_revisions: [] }) });
    const response = await generate();
    expect(response.status).toBe(200);
    const body = serviceContractResponseSchema.parse(await response.json());
    expect(body.document).toBeNull();

    expect(JSON.parse(String(calls('/rest/v1/client_documents', 'POST')[0]![1]?.body))).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      type_key: 'service_contract',
      title: 'Contract de prestări servicii',
      document_group: 'other',
      owners_only: true,
      created_by: user.id,
    });
    const revision = JSON.parse(String(calls('/rest/v1/document_revisions', 'POST')[0]![1]?.body));
    expect(revision).toMatchObject({
      revision: 1,
      template_version_id: 'v1',
      generation_id: null,
      docx_path: `${organizationId}/${clientId}/${documentId}/1.docx`,
    });
    expect(Object.keys(revision.data_snapshot).sort()).toEqual([
      'branding',
      'client',
      'contract',
      'provider',
    ]);
    expect(revision.data_snapshot.contract.number).toBe(51);
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).includes('/storage/v1/object/documents/') && init?.method === 'POST'
      )
    ).toHaveLength(1);
  });

  it('overwrites the draft that is there, as not edited', async () => {
    mockUpstream({ documents: documents([documentRow]) });
    expect((await generate()).status).toBe(200);
    expect(calls('/rest/v1/client_documents', 'POST')).toHaveLength(0);
    expect(calls('/rest/v1/document_revisions', 'POST')).toHaveLength(0);
    expect(
      JSON.parse(String(calls('/rest/v1/document_revisions', 'PATCH')[0]![1]?.body))
    ).toMatchObject({ template_version_id: 'v1', edited_at: null, edited_by: null });
  });

  it('says what is missing, and generates nothing', async () => {
    mockUpstream({
      organizations: () => Response.json({ ...organizationRow, iban: null }),
      documents: documents([]),
    });
    const response = await generate();
    expect(response.status).toBe(409);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.reason).toBe('missing_contract_data');
    expect(error.message).toContain('provider.bankAccount');
    expect(calls('/rest/v1/document_templates')).toHaveLength(0);
  });

  it('refuses an archived client, a missing template, and a specialist', async () => {
    mockUpstream({
      clients: () => Response.json([{ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }]),
    });
    const archived = await generate();
    expect(apiErrorResponseSchema.parse(await archived.json()).reason).toBe('client_archived');

    mockUpstream({ templates: () => Response.json([]), documents: documents([]) });
    const untemplated = await generate();
    expect(untemplated.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await untemplated.json()).reason).toBe('template_missing');

    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await generate()).status).toBe(403);
  });

  it('tells a draft that would now print something else from one that would not', async () => {
    const printed = (number: number) => ({
      ...documentRow,
      document_revisions: [{ ...draftRow, data_snapshot: { contract: { number } } }],
    });
    const request = () =>
      createApp().request(
        `/clients/${clientId}/service-contract`,
        { headers: { Authorization: 'Bearer test-access-token' } },
        env
      );
    mockUpstream({ documents: () => Response.json([printed(51)]) });
    const same = serviceContractResponseSchema.parse(await (await request()).json());
    // The snapshot of the test holds only the number, and the rest of `contract` differs.
    expect(same.draftOutdated).toBe(true);

    mockUpstream({ documents: () => Response.json([{ ...documentRow }]) });
    const uploaded = serviceContractResponseSchema.parse(await (await request()).json());
    expect(uploaded.document?.draft?.revision).toBe(1);
    expect(uploaded.draftOutdated).toBe(false);
  });
});

describe('POST /clients/{clientId}/service-contract/send', () => {
  const sendServiceContract = vi.fn<MailService['sendServiceContract']>();
  const mail = { sendServiceContract } as unknown as MailService;
  const issuedRow = {
    ...draftRow,
    status: 'issued',
    issued_at: '2026-09-21T11:00:00+00:00',
    pdf_path: `${organizationId}/${clientId}/${documentId}/1.pdf`,
  };
  const issuedDocument = { ...documentRow, document_revisions: [issuedRow] };
  const send = (body: unknown = { to: 'andrei@client.example', note: ' Cum am vorbit. ' }) =>
    createApp().request(
      `/clients/${clientId}/service-contract/send`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-access-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      { ...env, MAIL: mail }
    );
  const pdfPath: Handler = (init) =>
    init?.method === 'POST'
      ? Response.json({ id: revisionId })
      : Response.json({ pdf_path: issuedRow.pdf_path });

  beforeEach(() => {
    sendServiceContract.mockReset();
    sendServiceContract.mockResolvedValue({ id: 'msg_1' });
  });

  it('emails the PDF of the issued revision in the name of the owner, then records the send', async () => {
    mockUpstream({
      documents: () => Response.json([issuedDocument]),
      revisions: pdfPath,
      upload: () => new Response(new Uint8Array([37, 80, 68, 70])),
      sends: (init) =>
        init?.method === 'POST'
          ? new Response(null, { status: 201 })
          : Response.json([
              {
                sent_to: 'andrei@client.example',
                sent_at: '2026-09-21T12:00:00+00:00',
                document_revisions: { revision: 1 },
              },
            ]),
    });
    const response = await send();
    expect(response.status).toBe(200);
    const body = serviceContractResponseSchema.parse(await response.json());
    expect(body.lastSend).toEqual({
      sentTo: 'andrei@client.example',
      sentAt: '2026-09-21T12:00:00+00:00',
      revision: 1,
    });

    expect(sendServiceContract).toHaveBeenCalledWith({
      to: 'andrei@client.example',
      senderEmail: user.email,
      senderName: 'Olga Owner',
      organizationName: 'S.C. SAFETY S.R.L.',
      clientName: 'S.C. VELOCITA URBANA S.R.L.',
      contractNumber: 51,
      contractDate: '2026-02-15',
      note: 'Cum am vorbit.',
      attachment: { fileName: 'Contract nr. 51 din 15.02.2026.pdf', contentBase64: 'JVBERg==' },
    });
    expect(
      JSON.parse(String(calls('/rest/v1/service_contract_sends', 'POST')[0]![1]?.body))
    ).toEqual({
      organization_id: organizationId,
      document_id: documentId,
      revision_id: revisionId,
      sent_to: 'andrei@client.example',
      note: 'Cum am vorbit.',
      provider_message_id: 'msg_1',
      sent_by: user.id,
    });
  });

  it('records nothing when the email could not be handed over', async () => {
    sendServiceContract.mockRejectedValue(new Error('Resend rejected the email (422)'));
    mockUpstream({
      documents: () => Response.json([issuedDocument]),
      revisions: pdfPath,
      upload: () => new Response(new Uint8Array([37, 80, 68, 70])),
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await send()).status).toBe(503);
    expect(calls('/rest/v1/service_contract_sends', 'POST')).toHaveLength(0);
  });

  it.each([
    ['a draft', [documentRow], undefined, 'contract_not_issued'],
    ['no contract', [], undefined, 'contract_not_issued'],
    [
      'an issued contract without a PDF',
      [issuedDocument],
      { pdf_path: null },
      'contract_pdf_missing',
    ],
  ])('sends nothing for %s', async (_name, documents, revision, reason) => {
    mockUpstream({
      documents: () => Response.json(documents),
      revisions: () => Response.json(revision ?? {}),
    });
    const response = await send();
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(reason);
    expect(sendServiceContract).not.toHaveBeenCalled();
  });

  it('refuses an address that is not one, an archived client, and a specialist', async () => {
    mockUpstream({});
    expect((await send({ to: 'andrei' })).status).toBe(400);

    mockUpstream({
      clients: () => Response.json([{ ...clientRow, archived_at: '2026-09-01T00:00:00+00:00' }]),
    });
    expect((await send()).status).toBe(409);

    mockUpstream({ membership: () => Response.json([{ ...membership, role: 'specialist' }]) });
    expect((await send()).status).toBe(403);
    expect(sendServiceContract).not.toHaveBeenCalled();
  });

  it('is unavailable where no mail service is bound', async () => {
    mockUpstream({});
    const response = await createApp().request(
      `/clients/${clientId}/service-contract/send`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-access-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'andrei@client.example' }),
      },
      env
    );
    expect(response.status).toBe(503);
  });
});
