import { textHash } from '@ssm-usor/contracts';
import { type InstructionsProposal, type RisksProposal, toProposal } from '@ssm-usor/import';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv, ImportMessage } from '../../lib/env';
import { creditsUpstream } from '../credits/upstream.fixture';

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
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const bakerId = 'c0000000-0000-4000-8000-000000000001';
const driverId = 'c0000000-0000-4000-8000-000000000002';
const tillModuleId = 'b1000000-0000-4000-8000-000000000001';
const ladderModuleId = 'b1000000-0000-4000-8000-000000000002';
const secretKey = 'sb_secret_test_key_imports';

const sent: ImportMessage[] = [];
const queue = {
  send: vi.fn(async (body: ImportMessage) => {
    sent.push(body);
  }),
  sendBatch: vi.fn(async () => {}),
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

const position = (name: string) => ({
  name,
  staffCategory: null,
  trainingIntervalMonths: null,
  workZone: null,
  activities: null,
  managementOnly: false,
  needsProtectiveEquipment: null,
  file: 'Dosar/Decizia 1.docx',
  quote: name,
  otherCompany: null,
});

const reading = {
  facts: [
    {
      field: 'client.legalName',
      value: 'BRUTĂRIA FICTIVĂ S.R.L.',
      file: 'Dosar/Decizia 1.docx',
      quote: 'BRUTĂRIA',
      otherCompany: null,
    },
  ],
  workplaces: [],
  workplaceFacts: [],
  jobPositionFacts: [],
  jobPositions: [position('Brutar'), position('Șofer')],
  responsiblePersons: [],
  fireEquipment: [],
  fireInstallations: [],
  substances: [],
  protectiveEquipment: [],
  employees: [],
  notes: [],
};

const clientProposal = toProposal(reading);
const [baker, driver] = clientProposal.jobPositions;

const driverRenamed = {
  fields: {},
  items: { [driver!.id]: { values: { name: 'Șofer de livrări' } } },
};

const body = (text: string) => ({ blocks: [{ kind: 'article' as const, paragraphs: [text] }] });

const instruction = (
  key: string,
  overrides: Partial<InstructionsProposal['instructions'][number]> = {}
): InstructionsProposal['instructions'][number] => ({
  key,
  file: 'Dosar/IPSSM.docx',
  number: 'XIII.I',
  writtenTitle: 'Instrucțiuni proprii privind utilizarea mașinii de tocat',
  title: 'Utilizarea mașinii de tocat',
  category: 'work_equipment',
  body: body('Mașina de tocat se pornește numai cu capacul montat.'),
  articleCount: 1,
  sourceNumbers: [4],
  location: { file: 'Dosar/IPSSM.docx', start: 0, end: 10, firstParagraph: 2, lastParagraph: 3 },
  status: 'new',
  match: null,
  choice: null,
  posts: ['position-1'],
  flags: [],
  sameAs: [],
  ...overrides,
});

const match = (moduleId: string, title: string, similarity = 1) => ({
  moduleId,
  title,
  similarity,
  decidedBy: similarity === 1 ? ('hash' as const) : ('overlap' as const),
  differences: [],
});

const proposal: InstructionsProposal = {
  domain: 'ssm',
  instructions: [
    instruction('instruction-1'),
    instruction('instruction-2', {
      title: 'Lucrul la casa de marcat',
      status: 'identical',
      match: match(tillModuleId, 'Lucrul la casa de marcat'),
      posts: ['position-1', 'position-2'],
    }),
    instruction('instruction-3', {
      title: 'Scări metalice (Brutăria Fictivă)',
      status: 'similar',
      match: match(ladderModuleId, 'Scări metalice', 0.7),
      choice: 'use_existing',
      posts: ['position-2'],
    }),
  ],
  unread: [
    {
      key: 'instruction-4',
      file: 'Dosar/IPSSM.docx',
      number: 'XIII.IV',
      title: 'Feliatorul',
      category: 'work_equipment',
      reason: 'start_not_found',
    },
  ],
  positions: [
    {
      key: 'position-1',
      post: 'BRUTAR',
      variant: '',
      clientPost: 'Brutar',
      citations: [],
      resolution: { kind: 'resolved', instructions: ['instruction-1', 'instruction-2'] },
      missing: [],
    },
    {
      key: 'position-2',
      post: 'SOFER',
      variant: '',
      clientPost: 'Șofer',
      citations: [],
      resolution: { kind: 'resolved', instructions: ['instruction-2', 'instruction-3'] },
      missing: [],
    },
    {
      key: 'position-3',
      post: 'PAZNIC',
      variant: '',
      clientPost: null,
      citations: [],
      resolution: { kind: 'undecided', reasons: [] },
      missing: [],
    },
  ],
};

function importRow(overrides: Record<string, unknown> = {}) {
  return {
    id: importId,
    kind: 'client',
    status: 'confirmed',
    client_id: clientId,
    into_existing_client: false,
    company_name: 'BRUTĂRIA FICTIVĂ S.R.L.',
    company_cui: '12345674',
    source_import_id: null,
    failure_reason: null,
    created_by: user.id,
    created_at: '2026-10-28T09:00:00+00:00',
    updated_at: '2026-10-28T09:00:00+00:00',
    started_at: '2026-10-28T09:01:00+00:00',
    ready_at: '2026-10-28T09:10:00+00:00',
    failed_at: null,
    confirmed_at: '2026-10-28T10:00:00+00:00',
    clients: { id: clientId, legal_name: 'BRUTĂRIA FICTIVĂ S.R.L.' },
    import_files: [{ count: 3 }],
    last_file: [],
    import_library_parts: [{ part: 'instructions_ssm', status: 'to_review' }],
    version: 2,
    proposal: { ...clientProposal, registeredCompany: null },
    changes: driverRenamed,
    proposal_dropped_at: null,
    read_characters: null,
    ...overrides,
  };
}

function partRow(overrides: Record<string, unknown> = {}) {
  return {
    part: 'instructions_ssm',
    status: 'to_review',
    attempt: 1,
    failure_reason: null,
    version: 3,
    proposal,
    changes: null,
    read_at: '2026-10-28T09:20:00+00:00',
    confirmed_at: null,
    input_tokens: 120000,
    cached_input_tokens: 0,
    output_tokens: 4000,
    cost_usd: '0.140000',
    ...overrides,
  };
}

type Call = { method: string; url: URL; body: unknown; admin: boolean };
type Handler = (call: Call) => Response | Promise<Response> | undefined;

const fetchMock = vi.fn<typeof fetch>();
let calls: Call[] = [];

function mockUpstream(handler: Handler = () => undefined) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const raw = init?.body;
    const call: Call = {
      method,
      url,
      body: typeof raw === 'string' && /^[[{]/.test(raw) ? JSON.parse(raw) : raw,
      admin: new Headers(init?.headers).get('Authorization') === `Bearer ${secretKey}`,
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
    switch (url.pathname) {
      case '/rest/v1/clients':
      case '/rest/v1/client_fire_safety':
        return Response.json(null);
      case '/rest/v1/job_positions':
        return Response.json([
          { id: bakerId, name: 'Brutar' },
          { id: driverId, name: 'Șofer de livrări' },
        ]);
      case '/rest/v1/client_workplaces':
      case '/rest/v1/employees':
      case '/rest/v1/client_responsible_persons':
      case '/rest/v1/fire_substances':
        return Response.json([]);
    }
    const credits = creditsUpstream(call);
    if (credits) return credits;
    throw new Error(`Unexpected upstream request: ${method} ${url}`);
  });
}

const request = (path: string, method = 'GET', payload?: unknown) =>
  createApp().request(
    path,
    {
      method,
      headers: {
        Authorization: 'Bearer user-token',
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    },
    env
  );

const callsTo = (pathname: string) => calls.filter((call) => call.url.pathname === pathname);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  calls = [];
  sent.length = 0;
  queue.send.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const parts = `/imports/${importId}/library-parts`;

describe('GET /imports/{importId}/library-parts', () => {
  it("shows each part with its proposal, the client's posts and its credits net of a refund", async () => {
    mockUpstream(({ url, admin }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') return Response.json([partRow()]);
      if (url.pathname === '/rest/v1/credit_entries' && admin) {
        return Response.json([
          { import_id: importId, kind: 'import_start', credits: -25, import_part: null },
          {
            import_id: importId,
            kind: 'library_part',
            credits: -25,
            import_part: 'instructions_ssm',
          },
          {
            import_id: importId,
            kind: 'library_part_refund',
            credits: 25,
            import_part: 'instructions_ssm',
          },
          {
            import_id: importId,
            kind: 'library_part',
            credits: -25,
            import_part: 'instructions_ssm',
          },
        ]);
      }
    });
    const response = await request(parts);

    expect(response.status).toBe(200);
    const answer = (await response.json()) as { parts: Record<string, unknown>[]; posts: unknown };
    expect(answer.posts).toEqual([
      { id: baker!.id, name: 'Brutar', jobPositionId: bakerId },
      { id: driver!.id, name: 'Șofer de livrări', jobPositionId: driverId },
    ]);
    expect(answer.parts).toHaveLength(1);
    expect(answer.parts[0]).toMatchObject({
      part: 'instructions_ssm',
      domain: 'ssm',
      status: 'to_review',
      version: 3,
      counts: { identical: 1, similar: 1, new: 1, unread: 1 },
      positionPosts: {
        'position-1': baker!.id,
        'position-2': driver!.id,
        'position-3': null,
      },
      expiresAt: '2026-11-11T10:00:00.000Z',
      credits: 25,
    });
    expect(answer.parts[0]!.proposal).toEqual(proposal);
  });

  it('answers no parts for an employee import', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/imports'
        ? Response.json(importRow({ kind: 'employees' }))
        : undefined
    );
    const response = await request(parts);

    expect(await response.json()).toEqual({ parts: [], posts: [] });
    expect(callsTo('/rest/v1/import_library_parts')).toEqual([]);
  });
});

describe('PUT /imports/{importId}/library-parts/{part}/changes', () => {
  it('saves through the database function, as the member', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/import_library_parts') return Response.json(partRow());
      if (url.pathname === '/rest/v1/rpc/save_import_library_part_changes') return Response.json(4);
    });
    const changes = {
      instructions: {
        'instruction-1': { title: 'Mașina de tocat carne', posts: [driver!.id] },
        'instruction-3': { choice: 'add_new' },
      },
    };
    const response = await request(`${parts}/instructions_ssm/changes`, 'PUT', {
      version: 3,
      changes,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 4 });
    const rpc = callsTo('/rest/v1/rpc/save_import_library_part_changes')[0]!;
    expect(rpc.admin).toBe(false);
    expect(rpc.body).toEqual({
      p_import_id: importId,
      p_part: 'instructions_ssm',
      p_expected_version: 3,
      p_changes: changes,
    });
  });

  it('refuses an instruction the proposal does not have, and a category of the other domain', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/import_library_parts' ? Response.json(partRow()) : undefined
    );
    const response = await request(`${parts}/instructions_ssm/changes`, 'PUT', {
      version: 3,
      changes: {
        instructions: {
          'instruction-9': { included: false },
          'instruction-1': { category: 'hazardous_work' },
        },
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      issues: [
        { path: 'changes.instructions.instruction-9', message: 'unknown' },
        { path: 'changes.instructions.instruction-1.category', message: 'other_domain' },
      ],
    });
  });

  it('refuses a body that is not one', async () => {
    mockUpstream();
    const response = await request(`${parts}/instructions_ssm/changes`, 'PUT', {
      version: 3,
      changes: { instructions: { 'instruction-1': { body: { blocks: [] } } } },
    });

    expect(response.status).toBe(400);
  });
});

describe('POST /imports/{importId}/library-parts/{part}/confirm', () => {
  it('refuses before the client is confirmed', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') {
        return Response.json(importRow({ status: 'ready', confirmed_at: null }));
      }
      if (url.pathname === '/rest/v1/import_library_parts') return Response.json(partRow());
    });
    const response = await request(`${parts}/instructions_ssm/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_client_unconfirmed' });
    expect(callsTo('/rest/v1/rpc/apply_instruction_import')).toEqual([]);
  });

  it("creates the new ones, takes the library's as they are, on the client's posts, as the member", async () => {
    const changes = {
      instructions: {
        'instruction-1': {
          title: 'Mașina de tocat carne',
          body: body('Mașina se pornește numai cu capacul montat și închis.'),
        },
        'instruction-3': { posts: [baker!.id, driverId] },
      },
    };
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') {
        return Response.json(partRow({ changes }));
      }
      if (url.pathname === '/rest/v1/instruction_modules') {
        return Response.json([{ title: 'Lucrul la casa de marcat' }, { title: 'Scări metalice' }]);
      }
      if (url.pathname === '/rest/v1/rpc/apply_instruction_import') {
        return Response.json({
          created: ['d0000000-0000-4000-8000-000000000001'],
          used: [tillModuleId, ladderModuleId, tillModuleId],
          links: 4,
        });
      }
    });
    const response = await request(`${parts}/instructions_ssm/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      createdModuleIds: ['d0000000-0000-4000-8000-000000000001'],
      usedModuleIds: [tillModuleId, ladderModuleId],
      links: 4,
    });
    const rpc = callsTo('/rest/v1/rpc/apply_instruction_import')[0]!;
    expect(rpc.admin).toBe(false);
    expect(rpc.body).toEqual({
      p_import_id: importId,
      p_part: 'instructions_ssm',
      p_expected_version: 3,
      p_payload: {
        create: [
          {
            title: 'Mașina de tocat carne',
            category: 'work_equipment',
            body: changes.instructions['instruction-1'].body,
            text_hash: await textHash(changes.instructions['instruction-1'].body),
            job_position_ids: [bakerId],
          },
        ],
        use: [
          { module_id: tillModuleId, job_position_ids: [bakerId, driverId] },
          { module_id: ladderModuleId, job_position_ids: [bakerId, driverId] },
        ],
      },
    });
    const quality = callsTo('/rest/v1/import_library_parts').find(
      (call) => call.method === 'PATCH'
    )!;
    expect(quality.admin).toBe(true);
    expect(quality.url.searchParams.get('status')).toBe('eq.confirmed');
    expect(quality.body).toEqual({
      quality: { instructions: { changed: 2, unticked: 0, kept: 1 } },
    });
    expect(sent).toEqual([{ type: 'ended', importId, part: 'instructions_ssm' }]);
  });

  it("logs only the code when the part's quality is not kept, never the row it quotes", async () => {
    mockUpstream(({ url, method }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') {
        if (method === 'PATCH') {
          return Response.json(
            {
              code: '23514',
              message: 'Failing row contains (Mașina de tocat carne)',
              details: null,
              hint: null,
            },
            { status: 400 }
          );
        }
        return Response.json(partRow());
      }
      if (url.pathname === '/rest/v1/instruction_modules') return Response.json([]);
      if (url.pathname === '/rest/v1/rpc/apply_instruction_import') {
        return Response.json({ created: [], used: [], links: 0 });
      }
    });
    const response = await request(`${parts}/instructions_ssm/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(200);
    const logged = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(logged).toContain('was not kept: 23514');
    expect(logged).not.toContain('Mașina de tocat carne');
  });

  it('names the instruction whose title a module of the library has, and confirms nothing', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') return Response.json(partRow());
      if (url.pathname === '/rest/v1/instruction_modules') {
        return Response.json([{ title: 'utilizarea mașinii de tocat ' }]);
      }
    });
    const response = await request(`${parts}/instructions_ssm/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: 'instruction_title_taken',
      issues: [{ path: 'instructions.instruction-1.title', message: 'taken' }],
    });
    expect(callsTo('/rest/v1/rpc/apply_instruction_import')).toEqual([]);
  });

  it('checks the titles of only the instructions it adds, not one left out', async () => {
    const changes = {
      instructions: {
        'instruction-3': {
          choice: 'add_new',
          title: 'Utilizarea mașinii de tocat',
          included: false,
        },
      },
    };
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') {
        return Response.json(partRow({ changes }));
      }
      if (url.pathname === '/rest/v1/instruction_modules') {
        return Response.json([{ title: 'Lucrul la casa de marcat' }]);
      }
      if (url.pathname === '/rest/v1/rpc/apply_instruction_import') {
        return Response.json({
          created: ['d0000000-0000-4000-8000-000000000001'],
          used: [],
          links: 1,
        });
      }
    });
    const response = await request(`${parts}/instructions_ssm/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(200);
    const rpc = callsTo('/rest/v1/rpc/apply_instruction_import')[0]!;
    expect(
      (rpc.body as { p_payload: { create: { title: string }[] } }).p_payload.create.map(
        (item) => item.title
      )
    ).toEqual(['Utilizarea mașinii de tocat']);
  });

  it('answers a part past its 14 days as expired', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') return Response.json(partRow());
      if (url.pathname === '/rest/v1/instruction_modules') return Response.json([]);
      if (url.pathname === '/rest/v1/rpc/apply_instruction_import') {
        return Response.json(
          { code: 'ILP04', message: 'The library part expired.', details: null, hint: null },
          { status: 400 }
        );
      }
    });
    const response = await request(`${parts}/instructions_ssm/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_part_expired' });
  });
});

describe('POST /imports/{importId}/library-parts/{part}/retry', () => {
  it('reads a failed part again under its next attempt', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/rpc/retry_import_library_part') return Response.json(2);
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') {
        return Response.json(partRow({ status: 'reading', attempt: 2, proposal: null }));
      }
    });
    const response = await request(`${parts}/instructions_ssm/retry`, 'POST');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      part: { status: 'reading', attempt: 2, proposal: null, counts: null },
    });
    expect(callsTo('/rest/v1/rpc/retry_import_library_part')[0]!.admin).toBe(false);
    expect(sent).toEqual([
      { type: 'read-instructions', importId, part: 'instructions_ssm', attempt: 2 },
    ]);
  });

  it('answers a part that has not failed', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/rpc/retry_import_library_part'
        ? Response.json(
            { code: 'ILP06', message: 'Only a failed part.', details: null, hint: null },
            { status: 400 }
          )
        : undefined
    );
    const response = await request(`${parts}/instructions_su/retry`, 'POST');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_part_not_failed' });
    expect(sent).toEqual([]);
  });

  it('sends nothing for a part past its 14 days', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/rpc/retry_import_library_part'
        ? Response.json(
            { code: 'ILP04', message: 'The library part expired.', details: null, hint: null },
            { status: 400 }
          )
        : undefined
    );
    const response = await request(`${parts}/instructions_su/retry`, 'POST');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'import_part_expired' });
    expect(sent).toEqual([]);
  });
});

describe('the risk evaluations part', () => {
  const libraryEntryId = 'e1000000-0000-4000-8000-000000000001';
  const libraryFactorId = 'e2000000-0000-4000-8000-000000000001';
  const createdEntryId = 'e1000000-0000-4000-8000-000000000002';
  const evaluationId = 'e3000000-0000-4000-8000-000000000001';

  type Sheet = RisksProposal['sheets'][number];
  type Factor = Sheet['factors'][number];

  const factor = (key: string, overrides: Partial<Factor> = {}): Factor => ({
    key,
    row: 'R2',
    source: { file: 'Dosar/Evaluare.docx', start: 0, end: 10 },
    component: 'means_of_production',
    writtenComponent: 'MIJLOACE DE PRODUCŢIE',
    group: 'Factori de risc mecanic',
    description: 'Prinderea degetelor în malaxorul de aluat pornit.',
    code: 'F1',
    consequence: 'ITM / 45-180 zile',
    gravityClass: 3,
    probabilityClass: 3,
    printedLevel: 3,
    measures: [{ kind: 'technical', description: 'Protecția de la gura malaxorului.' }],
    measuresFrom: 'plan',
    actions: 'Revizuirea instrucțiunii.',
    deadline: 'Periodic',
    responsiblePerson: 'Administrator',
    observations: null,
    flags: [],
    included: true,
    level: 3,
    ...overrides,
  });

  const sheet = (key: string, overrides: Partial<Sheet> = {}): Sheet => ({
    key,
    file: 'Dosar/Evaluare.docx',
    heading: `SUBCAPITOLUL ${key}`,
    kind: 'job_position',
    name: 'BRUTAR',
    rows: { first: 'R2', last: 'R3' },
    meansOfProduction: 'Cuptor electric și malaxor de aluat.',
    workEnvironment: null,
    exposure: '8h / schimb',
    flags: [],
    posts: [{ name: 'Brutar', existingFactors: 0, choice: null }],
    undecided: false,
    existing: null,
    libraryName: 'Brutar (Brutăria Fictivă)',
    status: 'new',
    match: null,
    choice: 'add',
    sameAs: [],
    copyOf: null,
    factors: [],
    ...overrides,
  });

  const risks: RisksProposal = {
    sheets: [
      sheet('sheet-1', {
        factors: [
          factor('sheet-1.1', { responsiblePerson: 'Ion POPESCU' }),
          factor('sheet-1.2', {
            description: 'Ridicarea sacilor de făină de 50 kg.',
            component: 'work_task',
            probabilityClass: null,
            included: false,
            level: null,
          }),
        ],
      }),
      sheet('sheet-2', {
        name: 'ȘOFER',
        posts: [{ name: 'Șofer', existingFactors: 0, choice: null }],
        libraryName: 'Șofer',
        status: 'identical',
        choice: 'use_existing',
        match: {
          evaluationId: libraryEntryId,
          name: 'Șofer',
          share: 1,
          pairs: [
            {
              factor: 'sheet-2.1',
              libraryFactor: libraryFactorId,
              similarity: 1,
              otherClasses: false,
              otherMeasures: false,
            },
          ],
          onlyInPack: [],
          onlyInLibrary: [],
        },
        factors: [factor('sheet-2.1', { description: 'Accident rutier la livrare.' })],
      }),
      sheet('sheet-3', {
        kind: 'sensitive_groups',
        name: 'GRUPURI SENSIBILE',
        posts: [],
        existing: { factors: 0, choice: null },
        libraryName: 'Grupuri sensibile',
        choice: 'skip',
        factors: [factor('sheet-3.1')],
      }),
    ],
    unplacedRows: [],
    unmatchedPlanRows: [
      {
        row: 'R41',
        file: 'Dosar/Plan.docx',
        text: '| 3 |  | Zgomot de la hota de evacuare | Izolarea hotei. | Anual | Administrator |',
        post: 'BRUTAR',
        risk: 'Zgomot de la hota de evacuare',
        sheet: 'sheet-1',
        factor: factor('plan-R41', {
          row: 'R41',
          component: null,
          writtenComponent: '',
          group: '',
          description: 'Zgomot de la hota de evacuare',
          code: null,
          consequence: '',
          gravityClass: null,
          probabilityClass: null,
          printedLevel: null,
          included: false,
          level: null,
        }),
      },
    ],
    unmatchedMeasureRows: [],
  };

  const riskRow = (overrides: Record<string, unknown> = {}) =>
    partRow({ part: 'risk_evaluations', proposal: risks, ...overrides });

  const confirmUpstream =
    (
      part: Record<string, unknown>,
      extra: (call: Call) => Response | undefined = () => undefined
    ): Handler =>
    (call) => {
      const { url, admin } = call;
      const custom = extra(call);
      if (custom) return custom;
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') return Response.json(part);
      if (url.pathname === '/rest/v1/risk_evaluations') {
        return Response.json([
          {
            kind: 'job_position',
            job_position_id: bakerId,
            name: null,
            risk_factors: [{ count: 3 }],
          },
        ]);
      }
      if (url.pathname === '/rest/v1/organizations' && admin) {
        return Response.json({
          name: 'Serviciul Extern',
          legal_name: 'SERVICIUL EXTERN S.R.L.',
          cui: '76543210',
          legal_representative_name: null,
          risk_evaluator_name: 'Elena Marinescu',
          fire_safety_technician_name: null,
        });
      }
      if (url.pathname === '/rest/v1/organization_members' && admin) {
        return Response.json([{ user_id: user.id }]);
      }
      if (url.pathname === '/rest/v1/evaluation_profiles') {
        return Response.json([{ name: 'Șofer' }]);
      }
      if (url.pathname === '/rest/v1/evaluation_profile_factors') {
        return Response.json([
          { id: libraryFactorId, evaluation_profiles: { id: libraryEntryId } },
        ]);
      }
    };

  it('shows the part with its sheets, their posts, the counts of sheets and the library’s names', async () => {
    mockUpstream(({ url, admin }) => {
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') {
        return Response.json([
          partRow(),
          riskRow({
            changes: { sheets: { 'sheet-1': { library: 'skip', libraryName: 'Brutar' } } },
          }),
        ]);
      }
      if (url.pathname === '/rest/v1/evaluation_profiles') {
        return Response.json([
          { id: libraryEntryId, name: 'Șofer', archived_at: null },
          { id: bakerId, name: 'Brutar', archived_at: '2026-10-01T10:00:00+00:00' },
        ]);
      }
      if (url.pathname === '/rest/v1/risk_evaluations') {
        return Response.json([
          {
            kind: 'job_position',
            job_position_id: bakerId,
            name: null,
            risk_factors: [{ count: 3 }],
          },
          {
            kind: 'sensitive_groups',
            job_position_id: null,
            name: null,
            risk_factors: [{ count: 2 }],
          },
        ]);
      }
      if (url.pathname === '/rest/v1/credit_entries' && admin) {
        return Response.json([
          { import_id: importId, kind: 'import_start', credits: -25, import_part: null },
          {
            import_id: importId,
            kind: 'library_part',
            credits: -15,
            import_part: 'risk_evaluations',
          },
        ]);
      }
    });
    const response = await request(parts);

    expect(response.status).toBe(200);
    const answer = (await response.json()) as { parts: Record<string, unknown>[] };
    expect(answer.parts[1]).toMatchObject({
      part: 'risk_evaluations',
      status: 'to_review',
      counts: { identical: 1, similar: 0, new: 2, unread: 0 },
      postReferences: { Brutar: baker!.id, Șofer: driver!.id },
      existingFactors: { jobPositions: { [bakerId]: 3, [driverId]: 0 }, sheets: { 'sheet-3': 2 } },
      credits: 15,
      changes: { sheets: { 'sheet-1': { libraryName: 'Brutar' } } },
      libraryNames: [
        { id: libraryEntryId, name: 'Șofer', archived: false },
        { id: bakerId, name: 'Brutar', archived: true },
      ],
    });
    expect(answer.parts[1]).not.toHaveProperty('domain');
    expect(answer.parts[1]!.proposal).toEqual(risks);
  });

  it('saves the review of the sheets', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/import_library_parts') return Response.json(riskRow());
      if (url.pathname === '/rest/v1/rpc/save_import_library_part_changes') return Response.json(4);
    });
    const changes = {
      sheets: {
        'sheet-1': {
          libraryName: 'Brutar de noapte',
          factors: { 'sheet-1.2': { probabilityClass: 4, included: true } },
        },
      },
    };
    const response = await request(`${parts}/risk_evaluations/changes`, 'PUT', {
      version: 3,
      changes,
    });

    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/rpc/save_import_library_part_changes')[0]!.body).toEqual({
      p_import_id: importId,
      p_part: 'risk_evaluations',
      p_expected_version: 3,
      p_changes: changes,
    });
  });

  it('saves a plan row added to the sheet it was placed on, and refuses it on another', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/import_library_parts') return Response.json(riskRow());
      if (url.pathname === '/rest/v1/rpc/save_import_library_part_changes') return Response.json(4);
    });
    const added = { gravityClass: 2, probabilityClass: 3, included: true };
    const placed = await request(`${parts}/risk_evaluations/changes`, 'PUT', {
      version: 3,
      changes: { sheets: { 'sheet-1': { factors: { 'plan-R41': added } } } },
    });
    const elsewhere = await request(`${parts}/risk_evaluations/changes`, 'PUT', {
      version: 3,
      changes: { sheets: { 'sheet-2': { factors: { 'plan-R41': added } } } },
    });

    expect(placed.status).toBe(200);
    expect(elsewhere.status).toBe(400);
    expect(await elsewhere.json()).toMatchObject({
      issues: [{ path: 'changes.sheets.sheet-2.factors.plan-R41', message: 'unknown' }],
    });
    expect(callsTo('/rest/v1/rpc/save_import_library_part_changes')).toHaveLength(1);
  });

  it('refuses a sheet or a factor the proposal does not have, and another part’s changes', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/import_library_parts' ? Response.json(riskRow()) : undefined
    );
    const unknown = await request(`${parts}/risk_evaluations/changes`, 'PUT', {
      version: 3,
      changes: {
        sheets: {
          'sheet-9': { library: 'use_existing' },
          'sheet-1': { library: 'use_existing', factors: { 'sheet-1.9': { included: false } } },
        },
      },
    });
    const instructions = await request(`${parts}/risk_evaluations/changes`, 'PUT', {
      version: 3,
      changes: { instructions: { 'instruction-1': { included: false } } },
    });
    const empty = await request(`${parts}/risk_evaluations/changes`, 'PUT', {
      version: 3,
      changes: {},
    });

    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({
      issues: [
        { path: 'changes.sheets.sheet-9', message: 'unknown' },
        { path: 'changes.sheets.sheet-1.factors.sheet-1.9', message: 'unknown' },
        { path: 'changes.sheets.sheet-1.library', message: 'no_choice' },
      ],
    });
    expect(instructions.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(callsTo('/rest/v1/rpc/save_import_library_part_changes')).toEqual([]);
  });

  it('refuses to leave a sheet out of the library, or to choose for one not similar to an entry', async () => {
    mockUpstream(({ url }) =>
      url.pathname === '/rest/v1/import_library_parts' ? Response.json(riskRow()) : undefined
    );
    const save = (sheets: Record<string, unknown>) =>
      request(`${parts}/risk_evaluations/changes`, 'PUT', { version: 3, changes: { sheets } });
    const retired = await Promise.all(
      ['add', 'skip'].map((library) => save({ 'sheet-1': { library } }))
    );
    const notSimilar = await save({
      'sheet-1': { library: 'add_new' },
      'sheet-3': { library: 'add_new' },
    });

    expect(retired.map((response) => response.status)).toEqual([400, 400]);
    expect(notSimilar.status).toBe(400);
    expect(await notSimilar.json()).toMatchObject({
      issues: [
        { path: 'changes.sheets.sheet-1.library', message: 'no_choice' },
        { path: 'changes.sheets.sheet-3.library', message: 'no_choice' },
      ],
    });
    expect(callsTo('/rest/v1/rpc/save_import_library_part_changes')).toEqual([]);
  });

  it('confirms the library entries and the client’s sheets in one call, as the member', async () => {
    const changes = {
      sheets: {
        'sheet-1': {
          postChoices: { [baker!.id]: 'append' },
          factors: { 'sheet-1.2': { probabilityClass: 4, included: true } },
        },
        'sheet-3': { existingChoice: 'replace' },
      },
    };
    mockUpstream(
      confirmUpstream(riskRow({ changes }), ({ url }) =>
        url.pathname === '/rest/v1/rpc/apply_risk_import'
          ? Response.json({ created: [createdEntryId], evaluations: [evaluationId], factors: 5 })
          : undefined
      )
    );
    const response = await request(`${parts}/risk_evaluations/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      createdProfileIds: [createdEntryId],
      evaluationIds: [evaluationId],
      factors: 5,
    });
    const rpc = callsTo('/rest/v1/rpc/apply_risk_import')[0]!;
    expect(rpc.admin).toBe(false);
    const { p_payload: payload, ...rest } = rpc.body as {
      p_payload: {
        entries: { key: string; name: string; factors: Record<string, unknown>[] }[];
        evaluations: Record<string, unknown>[];
      };
    };
    expect(rest).toEqual({
      p_import_id: importId,
      p_part: 'risk_evaluations',
      p_expected_version: 3,
    });
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]).toMatchObject({ key: 'sheet-1', name: 'Brutar (Brutăria Fictivă)' });
    expect(
      payload.entries[0]!.factors.map((each) => [
        each.key,
        each.probability_class,
        each.responsible_person,
      ])
    ).toEqual([
      ['sheet-1.1', 3, null],
      ['sheet-1.2', 4, 'Administrator'],
    ]);
    expect(
      payload.evaluations.map((each) => [
        each.sheet,
        each.kind,
        each.job_position_id,
        each.mode,
        (each.factors as { source: unknown }[]).map((item) => item.source),
      ])
    ).toEqual([
      [
        'sheet-1',
        'job_position',
        bakerId,
        'append',
        [
          { entry: 'sheet-1', factor: 'sheet-1.1' },
          { entry: 'sheet-1', factor: 'sheet-1.2' },
        ],
      ],
      ['sheet-2', 'job_position', driverId, 'append', [{ profile_factor_id: libraryFactorId }]],
      ['sheet-3', 'sensitive_groups', null, 'replace', [null]],
    ]);
    const quality = callsTo('/rest/v1/import_library_parts').find(
      (call) => call.method === 'PATCH'
    )!;
    expect(quality.admin).toBe(true);
    expect(quality.body).toEqual({
      quality: {
        sheets: { changed: 2, unticked: 0, kept: expect.any(Number) },
        factors: { changed: 1, unticked: 0, kept: expect.any(Number) },
      },
    });
    expect(sent).toEqual([{ type: 'ended', importId, part: 'risk_evaluations' }]);
  });

  it('writes the factors without their link when the entry they match was archived since', async () => {
    mockUpstream(
      confirmUpstream(riskRow(), ({ url }) => {
        if (url.pathname === '/rest/v1/evaluation_profile_factors') return Response.json([]);
        return url.pathname === '/rest/v1/rpc/apply_risk_import'
          ? Response.json({ created: [], evaluations: [evaluationId], factors: 2 })
          : undefined;
      })
    );
    const response = await request(`${parts}/risk_evaluations/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(200);
    const lookup = callsTo('/rest/v1/evaluation_profile_factors')[0]!;
    expect(lookup.url.searchParams.get('evaluation_profiles.archived_at')).toBe('is.null');
    expect(lookup.url.searchParams.get('evaluation_profiles.organization_id')).toBe(
      `eq.${organizationId}`
    );
    const rpc = callsTo('/rest/v1/rpc/apply_risk_import')[0]!;
    const evaluations = (
      rpc.body as {
        p_payload: { evaluations: { sheet: string; factors: { source: unknown }[] }[] };
      }
    ).p_payload.evaluations;
    expect(evaluations.find((each) => each.sheet === 'sheet-2')!.factors).toEqual([
      expect.objectContaining({ source: null }),
    ]);
  });

  it('leaves a post that already has factors as it is, unless the member chose', async () => {
    mockUpstream(
      confirmUpstream(riskRow(), ({ url }) =>
        url.pathname === '/rest/v1/rpc/apply_risk_import'
          ? Response.json({ created: [createdEntryId], evaluations: [], factors: 0 })
          : undefined
      )
    );
    const response = await request(`${parts}/risk_evaluations/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(200);
    const rpc = callsTo('/rest/v1/rpc/apply_risk_import')[0]!;
    const sheets = (
      rpc.body as { p_payload: { evaluations: { sheet: string }[] } }
    ).p_payload.evaluations.map((each) => each.sheet);
    expect(sheets).toEqual(['sheet-2', 'sheet-3']);
  });

  it('names an unticked factor ticked without its class, and confirms nothing', async () => {
    const changes = { sheets: { 'sheet-1': { factors: { 'sheet-1.2': { included: true } } } } };
    mockUpstream(confirmUpstream(riskRow({ changes })));
    const response = await request(`${parts}/risk_evaluations/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      reason: 'import_incomplete',
      issues: [{ path: 'sheets.sheet-1.factors.sheet-1.2', message: 'incomplete' }],
    });
    expect(callsTo('/rest/v1/rpc/apply_risk_import')).toEqual([]);
  });

  it('names the sheet whose name an entry of the library has, archived ones included', async () => {
    const changes = { sheets: { 'sheet-1': { libraryName: 'șofer ' } } };
    mockUpstream(confirmUpstream(riskRow({ changes })));
    const response = await request(`${parts}/risk_evaluations/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: 'evaluation_profile_name_taken',
      issues: [{ path: 'sheets.sheet-1.libraryName', message: 'taken' }],
    });
    expect(callsTo('/rest/v1/rpc/apply_risk_import')).toEqual([]);
  });

  it('answers a name taken since as taken', async () => {
    mockUpstream(
      confirmUpstream(riskRow(), ({ url }) =>
        url.pathname === '/rest/v1/rpc/apply_risk_import'
          ? Response.json(
              {
                code: 'ILP05',
                message: 'The library already has an evaluation named Brutar.',
                details: null,
                hint: null,
              },
              { status: 400 }
            )
          : undefined
      )
    );
    const response = await request(`${parts}/risk_evaluations/confirm`, 'POST', { version: 3 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'evaluation_profile_name_taken' });
  });

  it('reads a failed part again with a message of its own', async () => {
    mockUpstream(({ url }) => {
      if (url.pathname === '/rest/v1/rpc/retry_import_library_part') return Response.json(2);
      if (url.pathname === '/rest/v1/imports') return Response.json(importRow());
      if (url.pathname === '/rest/v1/import_library_parts') {
        return Response.json(riskRow({ status: 'reading', attempt: 2, proposal: null }));
      }
    });
    const response = await request(`${parts}/risk_evaluations/retry`, 'POST');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      part: { part: 'risk_evaluations', status: 'reading', attempt: 2, proposal: null },
    });
    expect(sent).toEqual([{ type: 'read-risks', importId, attempt: 2 }]);
  });
});
