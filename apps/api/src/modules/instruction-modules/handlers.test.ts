import {
  apiErrorResponseSchema,
  instructionModuleFileLinkResponseSchema,
  instructionModuleListResponseSchema,
  instructionModuleResponseSchema,
  jobPositionResponseSchema,
  positionInstructionsResponseSchema,
} from '@ssm-usor/contracts';
import { instructionModuleSkeleton } from '@ssm-usor/document-engine';
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

const version = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  number: 2,
  sha256: 'a'.repeat(64),
  size_bytes: 4321,
  article_count: 12,
  created_at: '2026-09-26T10:00:00+00:00',
};

const ladders = {
  id: laddersId,
  title: 'Scări metalice',
  module_group: 'work_equipment',
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
    versions?: Handler;
    positions?: Handler;
    applied?: Handler;
    storage?: Handler;
  } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    if (url.pathname === '/rest/v1/instruction_modules') {
      const custom = handlers.modules?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return Response.json({ id: weldingId }, { status: 201 });
      if (init?.method === 'PATCH') return Response.json([{ id: laddersId }]);
      return Response.json(url.searchParams.get('id') ? [ladders] : [offices, ladders]);
    }
    if (url.pathname === '/rest/v1/instruction_module_versions') {
      const custom = handlers.versions?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return new Response(null, { status: 201 });
      return Response.json([{ number: 2 }]);
    }
    if (url.pathname === '/rest/v1/job_position_instructions') {
      const custom = handlers.applied?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return new Response(null, { status: 201 });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.searchParams.get('select')?.includes('job_positions!inner')) {
        return Response.json([{ module_id: laddersId }, { module_id: laddersId }]);
      }
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
            job_position_instructions: [{ count: 1 }],
          },
        ]);
      }
      if (init?.method === 'PATCH') return Response.json(welder);
      if (select === 'needs_instructions') return Response.json({ needs_instructions: true });
      return Response.json([
        { id: welderId, needs_protective_equipment: true, needs_instructions: true },
      ]);
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/instruction-modules/')) {
      return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
    }
    if (url.pathname.startsWith('/storage/v1/object/instruction-modules/')) {
      const custom = handlers.storage?.(init, url);
      if (custom) return custom;
      return Response.json({ Key: url.pathname.slice('/storage/v1/object/'.length) });
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

const sendFile = (path: string, method: string, bytes: Uint8Array) =>
  createApp().request(
    path,
    {
      method,
      headers: { Authorization: 'Bearer test-access-token', 'Content-Type': docxType },
      body: new Blob([bytes as BlobPart]),
    },
    env
  );

async function bytesOf(body: BodyInit | null | undefined) {
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  throw new Error(`Unexpected upload body: ${Object.prototype.toString.call(body)}`);
}

function docxWith(paragraphs: string[]) {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
      .map(
        (text, index) =>
          `<w:p><w:pPr>${index > 0 ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`
      )
      .join('')}</w:body></w:document>`
  );
  return zip.generate({ type: 'uint8array' });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('GET /instruction-modules', () => {
  it('lists the library by group and title with the current version and where each is applied', async () => {
    mockUpstream();
    const response = await request('/instruction-modules');
    expect(response.status).toBe(200);
    const { items } = instructionModuleListResponseSchema.parse(await response.json());
    expect(
      items.map((item) => [item.title, item.group, item.version.number, item.appliedCount])
    ).toEqual([
      ['Birouri', 'work_activity', 1, 0],
      ['Scări metalice', 'work_equipment', 2, 2],
    ]);
    const listed = calls('/rest/v1/instruction_modules', 'GET')[0]![0];
    expect(new URL(String(listed)).searchParams.get('archived_at')).toBe('is.null');
  });

  it('lists only the archived ones when asked', async () => {
    mockUpstream();
    await request('/instruction-modules?archived=true');
    const listed = calls('/rest/v1/instruction_modules', 'GET')[0]![0];
    expect(new URL(String(listed)).searchParams.get('archived_at')).toBe('not.is.null');
  });
});

describe('POST /instruction-modules', () => {
  it('starts a module from the skeleton, as version 1 in the module folder', async () => {
    mockUpstream({
      modules: (init, url) =>
        isGet(init) && url.searchParams.get('id') ? Response.json([welding]) : undefined,
      versions: (init) => (isGet(init) ? Response.json([]) : undefined),
    });
    const response = await request('/instruction-modules', 'POST', {
      title: 'Sudură oxiacetilenică',
      group: 'work_equipment',
    });
    expect(response.status).toBe(201);
    const { module } = instructionModuleResponseSchema.parse(await response.json());
    expect(module.title).toBe('Sudură oxiacetilenică');
    expect(sent('/rest/v1/instruction_modules', 'POST')).toMatchObject({
      organization_id: organizationId,
      title: 'Sudură oxiacetilenică',
      module_group: 'work_equipment',
      created_by: user.id,
    });
    const versionRow = sent('/rest/v1/instruction_module_versions', 'POST');
    expect(versionRow).toMatchObject({
      module_id: weldingId,
      number: 1,
      docx_path: `${organizationId}/${weldingId}/1.docx`,
      size_bytes: instructionModuleSkeleton().length,
      article_count: 4,
    });
    expect(
      calls(`/storage/v1/object/instruction-modules/${organizationId}/${weldingId}/1.docx`, 'POST')
    ).toHaveLength(1);
  });

  it('refuses a title the library already has', async () => {
    mockUpstream({
      modules: (init) =>
        init?.method === 'POST'
          ? Response.json({ code: '23505', message: 'duplicate' }, { status: 409 })
          : undefined,
    });
    const response = await request('/instruction-modules', 'POST', {
      title: 'Birouri',
      group: 'work_activity',
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instruction_module_title_taken'
    );
  });
});

describe('POST /instruction-modules/upload', () => {
  it('takes the title from the first line, sweeps the fonts and counts the articles', async () => {
    mockUpstream({
      modules: (init, url) =>
        isGet(init) && url.searchParams.get('id') ? Response.json([welding]) : undefined,
      versions: (init) => (isGet(init) ? Response.json([]) : undefined),
    });
    const response = await sendFile(
      '/instruction-modules/upload?group=work_equipment',
      'POST',
      docxWith(['Instrucțiuni pentru aparatul de sudură', 'Art', 'Art', 'Art'])
    );
    expect(response.status).toBe(201);
    expect(sent('/rest/v1/instruction_modules', 'POST')).toMatchObject({
      title: 'Instrucțiuni pentru aparatul de sudură',
      module_group: 'work_equipment',
    });
    expect(sent('/rest/v1/instruction_module_versions', 'POST')).toMatchObject({
      article_count: 3,
    });
    const stored = calls(
      `/storage/v1/object/instruction-modules/${organizationId}/${weldingId}/1.docx`,
      'POST'
    )[0]![1];
    const xml = new PizZip(await bytesOf(stored?.body)).file('word/document.xml')!.asText();
    expect(xml).toContain('w:ascii="Arial"');
    expect(xml).not.toContain('Calibri');
  });

  it('prefers a title given with the upload', async () => {
    mockUpstream({
      modules: (init, url) =>
        isGet(init) && url.searchParams.get('id') ? Response.json([welding]) : undefined,
      versions: (init) => (isGet(init) ? Response.json([]) : undefined),
    });
    await sendFile(
      `/instruction-modules/upload?title=${encodeURIComponent('Sudură')}`,
      'POST',
      docxWith(['Whatever the file says'])
    );
    expect(sent('/rest/v1/instruction_modules', 'POST')).toMatchObject({
      title: 'Sudură',
      module_group: 'work_activity',
    });
  });

  it('refuses a body that is not a Word document', async () => {
    mockUpstream();
    const response = await sendFile(
      '/instruction-modules/upload',
      'POST',
      new Uint8Array([1, 2, 3])
    );
    expect(response.status).toBe(400);
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

describe('GET /instruction-modules/{moduleId}/file-link', () => {
  it('signs a link to the current version, named after the module', async () => {
    mockUpstream();
    const response = await request(`/instruction-modules/${laddersId}/file-link`);
    expect(response.status).toBe(200);
    const link = instructionModuleFileLinkResponseSchema.parse(await response.json());
    expect(link.fileName).toBe('Scări metalice.docx');
    expect(link.url).toContain(`/instruction-modules/${organizationId}/${laddersId}/2.docx`);
  });
});

describe('PUT /instruction-modules/{moduleId}/file', () => {
  it('stores the next version and leaves the earlier one', async () => {
    mockUpstream();
    const response = await sendFile(
      `/instruction-modules/${laddersId}/file`,
      'PUT',
      docxWith(['Scări', 'Art'])
    );
    expect(response.status).toBe(200);
    expect(sent('/rest/v1/instruction_module_versions', 'POST')).toMatchObject({
      number: 3,
      docx_path: `${organizationId}/${laddersId}/3.docx`,
      article_count: 1,
    });
  });

  it('refuses a file on an archived module', async () => {
    mockUpstream({
      modules: (init, url) =>
        isGet(init) && url.searchParams.get('id')
          ? Response.json([{ ...ladders, archived_at: '2026-09-26T11:00:00+00:00' }])
          : undefined,
    });
    const response = await sendFile(
      `/instruction-modules/${laddersId}/file`,
      'PUT',
      docxWith(['Scări'])
    );
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'instruction_module_archived'
    );
  });
});

const instructionsPath = `/clients/${clientId}/job-positions/${welderId}/instructions`;

describe('GET …/instructions', () => {
  it('lists the applied modules with the decision', async () => {
    mockUpstream();
    const response = await request(instructionsPath);
    expect(response.status).toBe(200);
    const body = positionInstructionsResponseSchema.parse(await response.json());
    expect(body.items.map((item) => item.title)).toEqual(['Scări metalice']);
    expect(body.needsInstructions).toBe(true);
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
        created_by: user.id,
      },
    ]);
    const removed = calls('/rest/v1/job_position_instructions', 'DELETE')[0]![0];
    expect(new URL(String(removed)).searchParams.get('module_id')).toBe(`in.(${laddersId})`);
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
