import {
  apiErrorResponseSchema,
  type InstructionBody,
  instructionModuleChoicesResponseSchema,
  instructionModuleListResponseSchema,
  instructionModuleResponseSchema,
  instructionModuleVersionResponseSchema,
  jobPositionResponseSchema,
  positionInstructionsResponseSchema,
  saveInstructionBodyResponseSchema,
  textHash,
} from '@ssm-usor/contracts';
import { documentText } from '@ssm-usor/document-engine';
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

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const membership = { user_id: user.id, organization_id: organizationId, role: 'specialist' };

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const welderId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const fitterId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const laddersId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const officesId = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
const weldingId = '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f';
const hotWorkId = '6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c';

const laddersBody: InstructionBody = {
  blocks: [
    { kind: 'heading', text: 'Înainte de începerea lucrului' },
    {
      kind: 'article',
      paragraphs: ['Înainte de urcare, lucrătorul verifică:', 'a) treptele;', 'b) tălpile.'],
    },
    { kind: 'article', paragraphs: ['Scara se sprijină pe o suprafață plană și stabilă.'] },
  ],
};
const laddersHash = await textHash(laddersBody);

const version = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  number: 2,
  text_hash: laddersHash,
  article_count: 2,
  created_at: '2026-09-26T10:00:00+00:00',
};

const ladders = {
  id: laddersId,
  title: 'Scări metalice',
  module_group: 'work_equipment',
  domain: 'ssm',
  archived_at: null as string | null,
  created_at: '2026-09-26T09:00:00+00:00',
  updated_at: '2026-09-26T10:00:00+00:00',
  instruction_module_versions: [version],
};
const offices = {
  ...ladders,
  id: officesId,
  title: 'Birouri',
  module_group: 'work_activity',
  instruction_module_versions: [{ ...version, number: 1 }],
};
const welding = { ...ladders, id: weldingId, title: 'Sudură oxiacetilenică' };
const hotWork = {
  ...ladders,
  id: hotWorkId,
  title: 'Lucrul cu foc deschis',
  module_group: 'hazardous_work',
  domain: 'su',
};
const library = [ladders, offices, welding, hotWork];

function listRow(module: typeof ladders, appliedCount = 0) {
  const {
    instruction_module_versions: [current],
    ...fields
  } = module;
  return {
    ...fields,
    version_id: current!.id,
    version_number: current!.number,
    version_text_hash: current!.text_hash,
    version_article_count: current!.article_count,
    version_created_at: current!.created_at,
    applied_count: appliedCount,
  };
}

const organization = {
  legal_name: 'PREVENT CONSULT S.R.L.',
  legal_representative_name: 'Andrei MUNTEANU',
  legal_representative_role: 'Administrator',
  fire_safety_technician_name: 'Mihai STANCU',
};

const welder = {
  id: welderId,
  client_id: clientId,
  name: 'Sudor',
  staff_category: 'execution',
  work_zone: 'Atelier',
  activities: null,
  training_interval_months: null,
  needs_protective_equipment: true,
  needs_instructions: true,
  needs_fire_instructions: null as boolean | null,
  created_at: '2026-09-20T10:00:00+00:00',
  updated_at: '2026-09-20T10:00:00+00:00',
};

const applied = (module: typeof ladders) => ({
  module_id: module.id,
  instruction_modules: {
    title: module.title,
    module_group: module.module_group,
    archived_at: module.archived_at,
  },
});

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;

const isGet = (init: RequestInit | undefined) => (init?.method ?? 'GET') === 'GET';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(
  handlers: {
    modules?: Handler;
    list?: Handler;
    versions?: Handler;
    positions?: Handler;
    applied?: Handler;
    create?: Handler;
  } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    if (url.pathname === '/rest/v1/organizations') return Response.json(organization);
    if (url.pathname === '/rest/v1/rpc/create_instruction_module') {
      return handlers.create?.(init, url) ?? Response.json(weldingId);
    }
    if (url.pathname === '/rest/v1/instruction_modules') {
      const custom = handlers.modules?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return Response.json({ id: weldingId }, { status: 201 });
      if (init?.method === 'PATCH') return Response.json([{ id: laddersId }]);
      const wanted = url.searchParams.get('id')!.slice(4, -1).split(',');
      return Response.json(library.filter((module) => wanted.includes(module.id)));
    }
    if (url.pathname === '/rest/v1/instruction_module_list') {
      const custom = handlers.list?.(init, url);
      if (custom) return custom;
      if (url.searchParams.get('id')) return Response.json([listRow(ladders, 2)]);
      return Response.json([listRow(offices), listRow(ladders, 2)], {
        headers: { 'Content-Range': '0-1/2' },
      });
    }
    if (url.pathname === '/rest/v1/instruction_module_versions') {
      const custom = handlers.versions?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return new Response(null, { status: 201 });
      if (url.searchParams.get('select')?.includes('body')) {
        return Response.json([{ ...version, body: laddersBody }]);
      }
      return Response.json([{ number: 2, text_hash: laddersHash }]);
    }
    if (url.pathname === '/rest/v1/job_position_instructions') {
      const custom = handlers.applied?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return new Response(null, { status: 201 });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json([applied(ladders)]);
    }
    if (url.pathname === '/rest/v1/job_positions') {
      const custom = handlers.positions?.(init, url);
      if (custom) return custom;
      const select = url.searchParams.get('select') ?? '';
      if (select.includes('employees(count)')) {
        return Response.json([
          {
            id: welderId,
            employees: [{ count: 3 }],
            job_position_equipment: [{ count: 2 }],
            instructions: [{ count: 1 }],
            fire_instructions: [{ count: 0 }],
          },
        ]);
      }
      if (init?.method === 'PATCH') return Response.json(welder);
      if (select === 'needs_instructions,needs_fire_instructions') {
        return Response.json({ needs_instructions: true, needs_fire_instructions: null });
      }
      return Response.json([
        {
          id: welderId,
          needs_protective_equipment: true,
          needs_instructions: true,
          needs_fire_instructions: null,
        },
      ]);
    }
    throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
  });
}

const calls = (pathname: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

const sent = (pathname: string, method: string, index = 0) =>
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

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const officeBody: InstructionBody = {
  blocks: [
    { kind: 'heading', text: 'Domeniul de aplicare' },
    { kind: 'article', paragraphs: ['Instrucțiunea se aplică personalului din birouri.'] },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const listQuery = (index = 0) =>
  new URL(String(calls('/rest/v1/instruction_module_list', 'GET')[index]![0])).searchParams;

describe('GET /instruction-modules', () => {
  it('lists a page of the library by title with the current version and where each is applied', async () => {
    mockUpstream();
    const response = await request('/instruction-modules');
    expect(response.status).toBe(200);
    const listed = instructionModuleListResponseSchema.parse(await response.json());
    expect(
      listed.items.map((item) => [
        item.title,
        item.group,
        item.version.number,
        item.version.articleCount,
        item.appliedCount,
      ])
    ).toEqual([
      ['Birouri', 'work_activity', 1, 2, 0],
      ['Scări metalice', 'work_equipment', 2, 2, 2],
    ]);
    expect(listed).toMatchObject({ page: 1, pageSize: 25, total: 2 });
    const query = listQuery();
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('domain')).toBeNull();
    expect(query.get('order')).toBe('title.asc,id.asc');
    expect(query.get('offset')).toBe('0');
    expect(query.get('limit')).toBe('25');
  });

  it('lists only the archived ones when asked', async () => {
    mockUpstream();
    await request('/instruction-modules?status=archived');
    expect(listQuery().get('archived_at')).toBe('not.is.null');
  });

  it('lists the modules of one domain when asked', async () => {
    mockUpstream();
    await request('/instruction-modules?domain=su');
    expect(listQuery().get('domain')).toBe('eq.su');
    expect((await request('/instruction-modules?domain=other')).status).toBe(400);
  });

  it.each([
    ['group', 'asc', 'module_group.asc,title.asc,id.asc'],
    ['version', 'desc', 'version_created_at.desc,id.asc'],
    ['appliedCount', 'asc', 'applied_count.asc,id.asc'],
    ['title', 'desc', 'title.desc,id.asc'],
  ])('sorts by %s %s in the database', async (sort, order, expected) => {
    mockUpstream();
    const response = await request(`/instruction-modules?sort=${sort}&order=${order}`);
    expect(response.status).toBe(200);
    expect(listQuery().get('order')).toBe(expected);
  });

  it('asks the database for the page wanted', async () => {
    mockUpstream({
      list: () => Response.json([listRow(welding)], { headers: { 'Content-Range': '10-10/11' } }),
    });
    const listed = instructionModuleListResponseSchema.parse(
      await (await request('/instruction-modules?page=3&pageSize=5')).json()
    );
    expect(listed).toMatchObject({ page: 3, pageSize: 5, total: 11 });
    expect(listQuery().get('offset')).toBe('10');
    expect(listQuery().get('limit')).toBe('5');
  });

  it('answers a page past the end with no modules and the real total', async () => {
    mockUpstream({
      list: (_init, url) =>
        url.searchParams.get('offset') === '25'
          ? Response.json(
              { code: 'PGRST103', message: 'Requested range not satisfiable' },
              { status: 416 }
            )
          : Response.json([listRow(ladders)], { headers: { 'Content-Range': '0-0/3' } }),
    });
    const response = await request('/instruction-modules?page=2');
    expect(response.status).toBe(200);
    expect(instructionModuleListResponseSchema.parse(await response.json())).toEqual({
      items: [],
      page: 2,
      pageSize: 25,
      total: 3,
    });
  });

  it('refuses an unknown sort key or a page too large', async () => {
    mockUpstream();
    expect((await request('/instruction-modules?sort=updatedAt')).status).toBe(400);
    expect((await request('/instruction-modules?pageSize=101')).status).toBe(400);
    expect(calls('/rest/v1/instruction_module_list', 'GET')).toHaveLength(0);
  });
});

describe('GET /instruction-modules/choices', () => {
  it('lists every module in use, unpaged, by domain, category and title', async () => {
    mockUpstream({
      list: () =>
        Response.json(
          [ladders, hotWork].map(({ id, title, module_group, domain }) => ({
            id,
            title,
            module_group,
            domain,
          }))
        ),
    });
    const response = await request('/instruction-modules/choices');
    expect(response.status).toBe(200);
    expect(instructionModuleChoicesResponseSchema.parse(await response.json()).items).toEqual([
      { id: laddersId, title: 'Scări metalice', group: 'work_equipment', domain: 'ssm' },
      { id: hotWorkId, title: 'Lucrul cu foc deschis', group: 'hazardous_work', domain: 'su' },
    ]);
    const query = listQuery();
    expect(query.get('archived_at')).toBe('is.null');
    expect(query.get('order')).toBe('domain.asc,module_group.asc,title.asc,id.asc');
    expect(query.get('limit')).toBeNull();
    expect(query.get('domain')).toBeNull();
  });

  it('lists the modules of one domain when asked', async () => {
    mockUpstream({ list: () => Response.json([]) });
    await request('/instruction-modules/choices?domain=su');
    expect(listQuery().get('domain')).toBe('eq.su');
  });
});

describe('POST /instruction-modules', () => {
  it('creates a module with its body as version 1, in one transaction', async () => {
    mockUpstream({
      list: () => Response.json([listRow(welding)]),
    });
    const response = await request('/instruction-modules', 'POST', {
      title: 'Sudură oxiacetilenică',
      group: 'work_equipment',
      body: laddersBody,
    });
    expect(response.status).toBe(201);
    const created = instructionModuleResponseSchema.parse(await response.json());
    expect(created.module.title).toBe('Sudură oxiacetilenică');
    expect(created.body).toEqual(laddersBody);
    expect(sent('/rest/v1/rpc/create_instruction_module', 'POST')).toEqual({
      p_title: 'Sudură oxiacetilenică',
      p_group: 'work_equipment',
      p_domain: 'ssm',
      p_body: laddersBody,
      p_text_hash: laddersHash,
    });
    expect(calls('/rest/v1/instruction_modules', 'POST')).toHaveLength(0);
    expect(calls('/rest/v1/instruction_module_versions', 'POST')).toHaveLength(0);
  });

  it('creates a fire-safety module with a fire-safety category', async () => {
    mockUpstream({
      list: () => Response.json([listRow(hotWork)]),
    });
    const response = await request('/instruction-modules', 'POST', {
      title: 'Lucrul cu foc deschis',
      group: 'hazardous_work',
      domain: 'su',
      body: laddersBody,
    });
    expect(response.status).toBe(201);
    expect(instructionModuleResponseSchema.parse(await response.json()).module.domain).toBe('su');
    expect(sent('/rest/v1/rpc/create_instruction_module', 'POST')).toMatchObject({
      p_domain: 'su',
      p_group: 'hazardous_work',
    });
  });

  it('refuses a category of the other domain', async () => {
    mockUpstream();
    const response = await request('/instruction-modules', 'POST', {
      title: 'Lucrul cu foc deschis',
      group: 'work_activity',
      domain: 'su',
      body: laddersBody,
    });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instruction_module_category_domain'
    );
    expect(calls('/rest/v1/rpc/create_instruction_module', 'POST')).toHaveLength(0);
  });

  it('refuses a body without an article, or with a character the database cannot hold', async () => {
    mockUpstream();
    for (const body of [
      { blocks: [{ kind: 'heading', text: 'Domeniul de aplicare' }] },
      { blocks: [{ kind: 'article', paragraphs: ['Scara\u0000 se verifică.'] }] },
      { blocks: [{ kind: 'article', paragraphs: ['Scara \ud800se verifică.'] }] },
    ]) {
      const response = await request('/instruction-modules', 'POST', {
        title: 'Birouri noi',
        group: 'work_activity',
        body,
      });
      expect(response.status).toBe(400);
    }
    expect(calls('/rest/v1/rpc/create_instruction_module', 'POST')).toHaveLength(0);
  });

  it('refuses a title the library already has', async () => {
    mockUpstream({
      create: () => Response.json({ code: '23505', message: 'duplicate' }, { status: 409 }),
    });
    const response = await request('/instruction-modules', 'POST', {
      title: 'Birouri',
      group: 'work_activity',
      body: officeBody,
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instruction_module_title_taken'
    );
  });
});

describe('GET /instruction-modules/{moduleId}', () => {
  it('reads the module with its current body', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}`);
    expect(response.status).toBe(200);
    const read = instructionModuleResponseSchema.parse(await response.json());
    expect(read.module.version).toEqual({
      id: version.id,
      number: 2,
      textHash: laddersHash,
      articleCount: 2,
      createdAt: '2026-09-26T10:00:00+00:00',
    });
    expect(read.body).toEqual(laddersBody);
    const versionRead = new URL(
      String(calls('/rest/v1/instruction_module_versions', 'GET')[0]![0])
    );
    expect(versionRead.searchParams.get('id')).toBe(`eq.${version.id}`);
  });
});

describe('PATCH /instruction-modules/{moduleId}', () => {
  it('archives a module nobody applies', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}`, 'PATCH', {
      archived: true,
    });
    expect(response.status).toBe(200);
    const patched = sent('/rest/v1/instruction_modules', 'PATCH');
    expect(typeof patched.archived_at).toBe('string');
  });

  it('refuses to archive a module a position applies', async () => {
    mockUpstream({
      modules: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ code: 'INS04', message: 'applied' }, { status: 409 })
          : undefined,
    });
    const response = await request(`/instruction-modules/${laddersId}`, 'PATCH', {
      archived: true,
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instruction_module_applied'
    );
  });

  it('moves a module nobody applies to the other domain with a category of it', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}`, 'PATCH', {
      domain: 'su',
      group: 'installation_equipment',
    });
    expect(response.status).toBe(200);
    expect(sent('/rest/v1/instruction_modules', 'PATCH')).toEqual({
      domain: 'su',
      module_group: 'installation_equipment',
    });
  });

  it('refuses a move that keeps a category of the other domain', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}`, 'PATCH', {
      domain: 'su',
    });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instruction_module_category_domain'
    );
    expect(calls('/rest/v1/instruction_modules', 'PATCH')).toHaveLength(0);
  });

  it('refuses to move a module a position applies to the other domain, and says why', async () => {
    mockUpstream({
      modules: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ code: 'INS07', message: 'applied' }, { status: 409 })
          : undefined,
    });
    const response = await request(`/instruction-modules/${laddersId}`, 'PATCH', {
      domain: 'su',
      group: 'installation_equipment',
    });
    expect(response.status).toBe(409);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.reason).toBe('instruction_module_domain_applied');
    expect(error.message).toMatch(/applies this module/);
  });

  it('answers 404 for a module of another organization', async () => {
    mockUpstream({
      modules: (init) => (init?.method === 'PATCH' ? Response.json([]) : undefined),
    });
    const response = await request(`/instruction-modules/${laddersId}`, 'PATCH', {
      title: 'Scări',
    });
    expect(response.status).toBe(404);
  });
});

describe('PUT /instruction-modules/{moduleId}/body', () => {
  it('stores a changed text as the next version', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}/body`, 'PUT', officeBody);
    expect(response.status).toBe(200);
    expect(saveInstructionBodyResponseSchema.parse(await response.json()).changed).toBe(true);
    expect(sent('/rest/v1/instruction_module_versions', 'POST')).toMatchObject({
      module_id: laddersId,
      number: 3,
      body: officeBody,
      text_hash: await textHash(officeBody),
    });
  });

  it('stores nothing when only the whitespace moved, and answers the current version', async () => {
    mockUpstream();
    const respaced: InstructionBody = {
      blocks: laddersBody.blocks.map((block) =>
        block.kind === 'heading'
          ? { ...block, text: block.text.replace(/ /g, '\t ') }
          : { ...block, paragraphs: block.paragraphs.map((text) => text.replace(/ /g, '  ')) }
      ),
    };
    const response = await request(`/instruction-modules/${laddersId}/body`, 'PUT', respaced);
    expect(response.status).toBe(200);
    const saved = saveInstructionBodyResponseSchema.parse(await response.json());
    expect(saved.changed).toBe(false);
    expect(saved.module.version.number).toBe(2);
    expect(saved.body).toEqual(laddersBody);
    expect(calls('/rest/v1/instruction_module_versions', 'POST')).toHaveLength(0);
  });

  it('stores a text that only puts back diacritics, changes case or turns a symbol, spaced', async () => {
    mockUpstream({
      versions: (init, url) =>
        isGet(init) && !url.searchParams.get('id')
          ? Response.json([{ number: 2, body: withoutDiacritics }])
          : undefined,
    });
    const withoutDiacritics: InstructionBody = {
      blocks: [{ kind: 'article', paragraphs: ['Tensiunea > 50 V pune in pericol sanatatea.'] }],
    };
    const corrected: InstructionBody = {
      blocks: [
        { kind: 'article', paragraphs: ['Tensiunea  < 50 V nu pune în pericol SĂNĂTATEA.'] },
      ],
    };
    const response = await request(`/instruction-modules/${laddersId}/body`, 'PUT', corrected);
    expect(response.status).toBe(200);
    expect(saveInstructionBodyResponseSchema.parse(await response.json()).changed).toBe(true);
    expect(sent('/rest/v1/instruction_module_versions', 'POST')).toMatchObject({
      number: 3,
      body: {
        blocks: [
          { kind: 'article', paragraphs: ['Tensiunea < 50 V nu pune în pericol SĂNĂTATEA.'] },
        ],
      },
    });
  });

  it('answers the current version when the same text landed first', async () => {
    mockUpstream({
      versions: (init) =>
        init?.method === 'POST'
          ? Response.json({ code: 'INS08', message: 'unchanged' }, { status: 400 })
          : undefined,
    });
    const response = await request(`/instruction-modules/${laddersId}/body`, 'PUT', officeBody);
    expect(response.status).toBe(200);
    expect(saveInstructionBodyResponseSchema.parse(await response.json()).changed).toBe(false);
  });

  it('refuses a body that is not one', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}/body`, 'PUT', {
      blocks: [{ kind: 'article', paragraphs: ['Rândul unu\nrândul doi'] }],
    });
    expect(response.status).toBe(400);
    expect(calls('/rest/v1/instruction_module_versions', 'POST')).toHaveLength(0);
  });

  it('refuses a text on an archived module', async () => {
    mockUpstream({
      list: () =>
        Response.json([listRow({ ...ladders, archived_at: '2026-09-26T11:00:00+00:00' })]),
    });
    const response = await request(`/instruction-modules/${laddersId}/body`, 'PUT', officeBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instruction_module_archived'
    );
  });
});

describe('GET /instruction-modules/{moduleId}/versions/{versionId}', () => {
  it('reads a version a document annexed with its body', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}/versions/${version.id}`);
    expect(response.status).toBe(200);
    const read = instructionModuleVersionResponseSchema.parse(await response.json());
    expect(read.version.number).toBe(2);
    expect(read.body).toEqual(laddersBody);
    const versionRead = new URL(
      String(calls('/rest/v1/instruction_module_versions', 'GET')[0]![0])
    );
    expect(versionRead.searchParams.get('module_id')).toBe(`eq.${laddersId}`);
  });

  it('answers 404 for a version of another module', async () => {
    mockUpstream({ versions: () => Response.json([]) });
    const response = await request(`/instruction-modules/${laddersId}/versions/${version.id}`);
    expect(response.status).toBe(404);
  });
});

describe('GET /instruction-modules/{moduleId}/download', () => {
  it('renders the current version as the annex it prints, named after the module', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}/download`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(docxType);
    expect(response.headers.get('Content-Disposition')).toContain(
      "filename*=UTF-8''Sc%C4%83ri%20metalice.docx"
    );
    const text = documentText(new Uint8Array(await response.arrayBuffer()));
    expect(text).toContain('ANEXA 1');
    expect(text).toContain('I.P.S.S.M. Scări metalice');
    expect(text).toContain('versiunea din 26.09.2026');
    expect(text).toContain('PREVENT CONSULT S.R.L.');
    expect(text).toContain('Numele clientului');
    expect(text).toMatch(/Art\. 2\.\s*Scara se sprijină/);
  });

  it('renders an earlier version with its number in the name', async () => {
    mockUpstream();
    const response = await request(
      `/instruction-modules/${laddersId}/download?versionId=${version.id}`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('versiunea%202.docx');
  });
});

describe('POST /instruction-modules/preview', () => {
  it('renders a body not saved yet as the annex it would print', async () => {
    mockUpstream();
    const response = await request('/instruction-modules/preview', 'POST', {
      title: 'Lucrul cu foc deschis',
      domain: 'su',
      body: officeBody,
    });
    expect(response.status).toBe(200);
    const text = documentText(new Uint8Array(await response.arrayBuffer()));
    expect(text).toContain('I.P.S.U. Lucrul cu foc deschis');
    expect(text).toContain('Mihai STANCU');
    expect(text).toMatch(/Art\. 1\.\s*Instrucțiunea se aplică personalului din birouri\./);
    expect(calls('/rest/v1/instruction_module_versions', 'POST')).toHaveLength(0);
  });

  it('refuses a body that is not one', async () => {
    mockUpstream();
    const response = await request('/instruction-modules/preview', 'POST', {
      title: 'Birouri',
      body: { blocks: [] },
    });
    expect(response.status).toBe(400);
  });
});

const instructionsPath = `/clients/${clientId}/job-positions/${welderId}/instructions`;

describe('GET …/instructions', () => {
  it('lists the applied modules with the decision', async () => {
    mockUpstream();
    const response = await request(instructionsPath);
    expect(response.status).toBe(200);
    const body = positionInstructionsResponseSchema.parse(await response.json());
    expect(body.domain).toBe('ssm');
    expect(body.items.map((item) => item.title)).toEqual(['Scări metalice']);
    expect(body.needsInstructions).toBe(true);
    const listed = calls('/rest/v1/job_position_instructions', 'GET')[0]![0];
    expect(new URL(String(listed)).searchParams.get('domain')).toBe('eq.ssm');
  });

  it("lists the fire-safety modules with the position's fire-safety decision", async () => {
    mockUpstream({ applied: (init) => (isGet(init) ? Response.json([]) : undefined) });
    const response = await request(`${instructionsPath}?domain=su`);
    const body = positionInstructionsResponseSchema.parse(await response.json());
    expect([body.domain, body.items, body.needsInstructions]).toEqual(['su', [], null]);
    const listed = calls('/rest/v1/job_position_instructions', 'GET')[0]![0];
    expect(new URL(String(listed)).searchParams.get('domain')).toBe('eq.su');
  });

  it('answers 404 for a position of another client', async () => {
    mockUpstream({ positions: (init) => (isGet(init) ? Response.json([]) : undefined) });
    expect(
      (await request(`/clients/${clientId}/job-positions/${fitterId}/instructions`)).status
    ).toBe(404);
  });
});

describe('PUT …/instructions', () => {
  it('adds what is new and removes what was left out', async () => {
    mockUpstream();
    const response = await request(instructionsPath, 'PUT', { moduleIds: [officesId] });
    expect(response.status).toBe(200);
    expect(sent('/rest/v1/job_position_instructions', 'POST')).toEqual([
      {
        organization_id: organizationId,
        client_id: clientId,
        job_position_id: welderId,
        module_id: officesId,
        domain: 'ssm',
        created_by: user.id,
      },
    ]);
    const removed = new URL(String(calls('/rest/v1/job_position_instructions', 'DELETE')[0]![0]));
    expect(removed.searchParams.get('module_id')).toBe(`in.(${laddersId})`);
    expect(removed.searchParams.get('domain')).toBe('eq.ssm');
  });

  it('applies fire-safety modules as the fire-safety decision, leaving the other alone', async () => {
    mockUpstream({
      applied: (init) => (isGet(init) ? Response.json([]) : undefined),
      positions: (init, url) =>
        url.searchParams.get('select') === 'needs_instructions,needs_fire_instructions'
          ? Response.json({ needs_instructions: true, needs_fire_instructions: true })
          : undefined,
    });
    const response = await request(instructionsPath, 'PUT', {
      domain: 'su',
      moduleIds: [hotWorkId],
    });
    expect(response.status).toBe(200);
    const body = positionInstructionsResponseSchema.parse(await response.json());
    expect([body.domain, body.needsInstructions]).toEqual(['su', true]);
    expect(sent('/rest/v1/job_position_instructions', 'POST')).toEqual([
      expect.objectContaining({ module_id: hotWorkId, domain: 'su' }),
    ]);
    expect(calls('/rest/v1/job_position_instructions', 'DELETE')).toHaveLength(0);
  });

  it('refuses a module of the other domain by its title', async () => {
    mockUpstream({ applied: (init) => (isGet(init) ? Response.json([]) : undefined) });
    const response = await request(instructionsPath, 'PUT', {
      domain: 'su',
      moduleIds: [hotWorkId, laddersId],
    });
    expect(response.status).toBe(400);
    const error = apiErrorResponseSchema.parse(await response.json());
    expect(error.reason).toBe('instruction_module_other_domain');
    expect(error.message).toContain('"Scări metalice"');
    expect(error.message).not.toContain('Lucrul cu foc deschis');
    expect(calls('/rest/v1/job_position_instructions', 'POST')).toHaveLength(0);
  });

  it('refuses a module that is not in the library', async () => {
    mockUpstream();
    const response = await request(instructionsPath, 'PUT', {
      moduleIds: ['0e0e0e0e-0000-4000-8000-000000000001'],
    });
    expect(response.status).toBe(400);
    expect(calls('/rest/v1/job_position_instructions', 'POST')).toHaveLength(0);
  });

  it('refuses an archived module', async () => {
    mockUpstream({
      applied: (init) =>
        init?.method === 'POST'
          ? Response.json({ code: 'INS03', message: 'archived' }, { status: 409 })
          : undefined,
    });
    const response = await request(instructionsPath, 'PUT', { moduleIds: [laddersId, officesId] });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instruction_module_archived'
    );
  });
});

describe('POST …/instructions/copy', () => {
  it("adds the other position's modules it does not have yet", async () => {
    mockUpstream({
      applied: (init, url) =>
        isGet(init) && url.searchParams.get('job_position_id') === `eq.${fitterId}`
          ? Response.json([applied(ladders), applied(offices)])
          : undefined,
    });
    const response = await request(`${instructionsPath}/copy`, 'POST', {
      fromJobPositionId: fitterId,
    });
    expect(response.status).toBe(200);
    expect(sent('/rest/v1/job_position_instructions', 'POST')).toEqual([
      expect.objectContaining({ module_id: officesId }),
    ]);
  });

  it('refuses copying from the position itself', async () => {
    mockUpstream();
    const response = await request(`${instructionsPath}/copy`, 'POST', {
      fromJobPositionId: welderId,
    });
    expect(response.status).toBe(400);
  });
});

describe('PATCH …/instructions-decision', () => {
  it('marks the position as needing none and returns it with its counts', async () => {
    mockUpstream({
      positions: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ ...welder, needs_instructions: false })
          : undefined,
    });
    const response = await request(
      `/clients/${clientId}/job-positions/${welderId}/instructions-decision`,
      'PATCH',
      { needsInstructions: false }
    );
    expect(response.status).toBe(200);
    const { jobPosition } = jobPositionResponseSchema.parse(await response.json());
    expect([jobPosition.needsInstructions, jobPosition.instructionCount]).toEqual([false, 1]);
    expect(sent('/rest/v1/job_positions', 'PATCH')).toEqual({ needs_instructions: false });
  });

  it('marks the position as needing no fire-safety module apart', async () => {
    mockUpstream({
      positions: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ ...welder, needs_fire_instructions: false })
          : undefined,
    });
    const response = await request(
      `/clients/${clientId}/job-positions/${welderId}/instructions-decision`,
      'PATCH',
      { domain: 'su', needsInstructions: false }
    );
    expect(response.status).toBe(200);
    const { jobPosition } = jobPositionResponseSchema.parse(await response.json());
    expect([jobPosition.needsInstructions, jobPosition.needsFireInstructions]).toEqual([
      true,
      false,
    ]);
    expect(sent('/rest/v1/job_positions', 'PATCH')).toEqual({ needs_fire_instructions: false });
  });

  it('refuses "needs instructions" in words', async () => {
    mockUpstream();
    const response = await request(
      `/clients/${clientId}/job-positions/${welderId}/instructions-decision`,
      'PATCH',
      { needsInstructions: true }
    );
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instructions_decided_by_modules'
    );
  });

  it('refuses "needs none" while modules are applied', async () => {
    mockUpstream({
      positions: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ code: 'INS01', message: 'applied' }, { status: 409 })
          : undefined,
    });
    const response = await request(
      `/clients/${clientId}/job-positions/${welderId}/instructions-decision`,
      'PATCH',
      { needsInstructions: false }
    );
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('instructions_applied');
  });
});
