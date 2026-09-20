import {
  apiErrorResponseSchema,
  jobPositionListResponseSchema,
  jobPositionResponseSchema,
} from '@ssm-usor/contracts';
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
  role: 'specialist',
};

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const welderId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const accountantId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const welder = {
  id: welderId,
  client_id: clientId,
  name: 'Sudor',
  staff_category: 'execution',
  work_zone: 'Atelier, teren',
  activities: 'Sudură electrică',
  training_interval_months: null as number | null,
  created_at: '2026-09-20T10:00:00+00:00',
  updated_at: '2026-09-20T10:00:00+00:00',
};
const accountant = {
  ...welder,
  id: accountantId,
  name: 'Contabil',
  staff_category: 'technical_administrative',
  work_zone: 'Birou',
  activities: null,
};

type Handler = (init?: RequestInit, url?: URL) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: { clients?: Handler; positions?: Handler } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    if (url.pathname === '/rest/v1/clients') {
      return handlers.clients?.(init, url) ?? Response.json([{ id: clientId, archived_at: null }]);
    }
    if (url.pathname === '/rest/v1/job_positions') {
      const custom = handlers.positions?.(init, url);
      if (custom) return custom;
      // The count of current employees per position is a query of its own.
      if (url.searchParams.get('select')?.includes('employees(count)')) {
        return Response.json([
          { id: welderId, employees: [{ count: 3 }] },
          { id: accountantId, employees: [{ count: 0 }] },
        ]);
      }
      return Response.json([accountant, welder]);
    }
    throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
  });
}

const calls = (method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === '/rest/v1/job_positions' &&
      (init?.method ?? 'GET') === method
  );

const sent = (method: string, index = 0) =>
  JSON.parse(String(calls(method)[index]![1]?.body)) as Record<string, unknown>;

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

const path = `/clients/${clientId}/job-positions`;
const duplicate = () =>
  Response.json(
    { code: '23505', message: 'duplicate key "job_positions_client_name_key"', details: null },
    { status: 409 }
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('GET /clients/{clientId}/job-positions', () => {
  it('lists the positions by name with their current employees, archived ones left out', async () => {
    mockUpstream();
    const response = await request(path);
    expect(response.status).toBe(200);
    const { items } = jobPositionListResponseSchema.parse(await response.json());
    expect(items.map((item) => [item.name, item.staffCategory, item.employeeCount])).toEqual([
      ['Contabil', 'technical_administrative', 0],
      ['Sudor', 'execution', 3],
    ]);

    const [list, counts] = calls('GET').map(([input]) => new URL(String(input)).searchParams);
    expect(list!.get('archived_at')).toBe('is.null');
    expect(list!.get('order')).toBe('name.asc,id.asc');
    // People who left, and rows archived as mistakes, are not in a position any more.
    expect(counts!.get('employees.status')).toBe('neq.terminated');
    expect(counts!.get('employees.archived_at')).toBe('is.null');
  });

  it('answers 404 for a client of another organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await request(path)).status).toBe(404);
    expect(calls('GET')).toHaveLength(0);
  });
});

describe('POST /clients/{clientId}/job-positions', () => {
  it('creates a position for the caller, in the execution category unless told otherwise', async () => {
    mockUpstream({
      positions: (init) => (init?.method === 'POST' ? Response.json(welder) : undefined!),
    });
    const response = await request(path, 'POST', { name: '  Sudor ', workZone: 'Atelier, teren' });
    expect(response.status).toBe(201);
    expect(jobPositionResponseSchema.parse(await response.json()).jobPosition.employeeCount).toBe(
      0
    );
    expect(sent('POST')).toEqual({
      name: 'Sudor',
      staff_category: 'execution',
      work_zone: 'Atelier, teren',
      activities: null,
      training_interval_months: null,
      organization_id: membership.organization_id,
      client_id: clientId,
      created_by: user.id,
    });
  });

  it('names the field when the client already has a position of that name', async () => {
    mockUpstream({ positions: (init) => (init?.method === 'POST' ? duplicate() : undefined!) });
    const response = await request(path, 'POST', { name: 'sudor' });
    expect(response.status).toBe(409);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.reason).toBe('job_position_name_taken');
    expect(body.issues?.[0]?.path).toBe('name');
  });

  it('refuses an archived client and an invalid body', async () => {
    mockUpstream({ clients: () => Response.json([{ id: clientId, archived_at: '2026-09-01' }]) });
    expect((await request(path, 'POST', { name: 'Sudor' })).status).toBe(409);
    expect((await request(path, 'POST', { name: 'S' })).status).toBe(400);
    expect((await request(path, 'POST', { name: 'Sudor', staffCategory: 'office' })).status).toBe(
      400
    );
    // Execution staff are trained at least every 6 months; the other category may go to 12.
    expect(
      (await request(path, 'POST', { name: 'Sudor', trainingIntervalMonths: 12 })).status
    ).toBe(400);
    expect(calls('POST')).toHaveLength(0);
  });
});

describe('PUT /clients/{clientId}/job-positions/{jobPositionId}', () => {
  const update = (body: unknown) => request(`${path}/${welderId}`, 'PUT', body);

  it('replaces the position and leaves everything else to the database', async () => {
    mockUpstream({
      positions: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ ...welder, name: 'Sudor autorizat' })
          : undefined!,
    });
    const response = await update({
      name: 'Sudor autorizat',
      staffCategory: 'execution',
      trainingIntervalMonths: 2,
    });
    expect(response.status).toBe(200);
    const { jobPosition } = jobPositionResponseSchema.parse(await response.json());
    expect([jobPosition.name, jobPosition.employeeCount]).toEqual(['Sudor autorizat', 3]);
    expect(sent('PATCH')).toEqual({
      name: 'Sudor autorizat',
      staff_category: 'execution',
      work_zone: null,
      activities: null,
      training_interval_months: 2,
    });
    const filter = new URL(String(calls('PATCH')[0]![0])).searchParams;
    expect([filter.get('id'), filter.get('client_id'), filter.get('archived_at')]).toEqual([
      `eq.${welderId}`,
      `eq.${clientId}`,
      'is.null',
    ]);
  });

  it('answers 404 for a position that is gone, and 409 for a name that is taken', async () => {
    mockUpstream({
      positions: (init) => (init?.method === 'PATCH' ? Response.json(null) : undefined!),
    });
    expect((await update({ name: 'Sudor' })).status).toBe(404);
    mockUpstream({ positions: (init) => (init?.method === 'PATCH' ? duplicate() : undefined!) });
    expect((await update({ name: 'Contabil' })).status).toBe(409);
  });
});

describe('DELETE /clients/{clientId}/job-positions/{jobPositionId}', () => {
  const remove = () => request(`${path}/${welderId}`, 'DELETE');
  const pointedAt = () =>
    Response.json(
      { code: '23503', message: 'violates foreign key', details: null },
      { status: 409 }
    );
  const found = (init?: RequestInit, url?: URL) =>
    (init?.method ?? 'GET') === 'GET' && url?.searchParams.get('select') === 'id'
      ? Response.json({ id: welderId })
      : undefined;

  it('deletes a position nobody points at', async () => {
    mockUpstream({
      positions: (init, url) =>
        found(init, url) ??
        (init?.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined!),
    });
    expect((await remove()).status).toBe(204);
    expect(calls('PATCH')).toHaveLength(0);
  });

  it('archives one that only people who left point at', async () => {
    mockUpstream({
      positions: (init, url) =>
        found(init, url) ??
        (init?.method === 'DELETE' ? pointedAt() : new Response(null, { status: 204 })),
    });
    expect((await remove()).status).toBe(204);
    expect(Date.parse(String(sent('PATCH').archived_at))).not.toBeNaN();
  });

  it('refuses while current employees are in it, and says so', async () => {
    mockUpstream({
      positions: (init, url) =>
        found(init, url) ??
        (init?.method === 'DELETE'
          ? pointedAt()
          : Response.json(
              { code: 'JOB01', message: 'Employees still hold this job position.', details: null },
              { status: 400 }
            )),
    });
    const response = await remove();
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('job_position_held');
  });

  it('answers 404 for a position that is not there', async () => {
    mockUpstream({
      positions: (init) => ((init?.method ?? 'GET') === 'GET' ? Response.json(null) : undefined!),
    });
    expect((await remove()).status).toBe(404);
    expect(calls('DELETE')).toHaveLength(0);
  });
});
