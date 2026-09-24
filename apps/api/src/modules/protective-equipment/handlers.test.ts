import {
  apiErrorResponseSchema,
  equipmentEntryResponseSchema,
  equipmentListResponseSchema,
  equipmentSuggestionsResponseSchema,
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
const fitterId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const maskId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const welder = {
  id: welderId,
  client_id: clientId,
  name: 'Sudor',
  staff_category: 'execution',
  work_zone: 'Atelier',
  activities: null,
  training_interval_months: null,
  needs_protective_equipment: true,
  created_at: '2026-09-20T10:00:00+00:00',
  updated_at: '2026-09-20T10:00:00+00:00',
};

const mask = {
  id: maskId,
  job_position_id: welderId,
  risk: 'Radiații, împroșcare (față, ochi)',
  item: 'Mască de sudură',
  quantity: 1,
  duration_months: 24,
  allocation: 'section_inventory',
  created_at: '2026-09-24T10:00:00+00:00',
  updated_at: '2026-09-24T10:00:00+00:00',
};
const gloves = {
  ...mask,
  id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  risk: 'Căldură, foc (mâini)',
  item: 'Mănuși de sudor',
  quantity: 2,
  duration_months: 3,
  allocation: 'personal_inventory',
};

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;

const isGet = (init: RequestInit | undefined) => (init?.method ?? 'GET') === 'GET';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: { positions?: Handler; equipment?: Handler } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    if (url.pathname === '/rest/v1/job_positions') {
      const custom = handlers.positions?.(init, url);
      if (custom) return custom;
      const select = url.searchParams.get('select') ?? '';
      if (select.includes('employees(count)')) {
        return Response.json([
          { id: welderId, employees: [{ count: 3 }], job_position_equipment: [{ count: 2 }] },
        ]);
      }
      if (init?.method === 'PATCH') return Response.json(welder);
      // `.single()` reads an object; `.maybeSingle()` on a GET reads the array's first row.
      if (select === 'needs_protective_equipment') {
        return Response.json({ needs_protective_equipment: true });
      }
      return Response.json([{ id: welderId, needs_protective_equipment: true }]);
    }
    if (url.pathname === '/rest/v1/job_position_equipment') {
      const custom = handlers.equipment?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return Response.json(mask, { status: 201 });
      if (init?.method === 'PATCH') return Response.json(mask);
      if (init?.method === 'DELETE') return Response.json([{ id: maskId }]);
      return Response.json([mask, gloves]);
    }
    throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
  });
}

const calls = (table: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === `/rest/v1/${table}` && (init?.method ?? 'GET') === method
  );

const sent = (table: string, method: string, index = 0) =>
  JSON.parse(String(calls(table, method)[index]![1]?.body)) as unknown;

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

const path = `/clients/${clientId}/job-positions/${welderId}/equipment`;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('GET …/equipment', () => {
  it('lists the entries in the order they were added, with the decision', async () => {
    mockUpstream();
    const response = await request(path);
    expect(response.status).toBe(200);
    const body = equipmentListResponseSchema.parse(await response.json());
    expect(body.needsProtectiveEquipment).toBe(true);
    expect(body.items.map((item) => [item.item, item.quantity, item.durationMonths])).toEqual([
      ['Mască de sudură', 1, 24],
      ['Mănuși de sudor', 2, 3],
    ]);
    const [list] = calls('job_position_equipment', 'GET').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(list!.get('job_position_id')).toBe(`eq.${welderId}`);
    expect(list!.get('order')).toBe('created_at.asc,id.asc');
  });

  it('answers 404 for a position of another client, or an archived one', async () => {
    mockUpstream({ positions: (init) => (isGet(init) ? Response.json([]) : undefined) });
    const response = await request(path);
    expect(response.status).toBe(404);
    const [find] = calls('job_positions', 'GET').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(find!.get('client_id')).toBe(`eq.${clientId}`);
    expect(find!.get('archived_at')).toBe('is.null');
  });
});

describe('POST …/equipment', () => {
  it('adds an entry under the organization, the client and the position', async () => {
    mockUpstream();
    const response = await request(path, 'POST', {
      risk: 'Radiații, împroșcare (față, ochi)',
      item: 'Mască de sudură',
      durationMonths: 24,
      allocation: 'section_inventory',
    });
    expect(response.status).toBe(201);
    expect(equipmentEntryResponseSchema.parse(await response.json()).entry.item).toBe(
      'Mască de sudură'
    );
    expect(sent('job_position_equipment', 'POST')).toEqual({
      risk: 'Radiații, împroșcare (față, ochi)',
      item: 'Mască de sudură',
      quantity: 1,
      duration_months: 24,
      allocation: 'section_inventory',
      organization_id: membership.organization_id,
      client_id: clientId,
      job_position_id: welderId,
      created_by: user.id,
    });
  });

  it('refuses a consumable with a duration, and inventory without one', async () => {
    mockUpstream();
    const consumable = await request(path, 'POST', {
      risk: 'Pulberi',
      item: 'Mănuși',
      allocation: 'consumable',
      durationMonths: 6,
    });
    expect(consumable.status).toBe(400);
    const inventory = await request(path, 'POST', { risk: 'Pulberi', item: 'Mănuși' });
    expect(inventory.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await inventory.json()).issues).toEqual([
      {
        path: 'durationMonths',
        message: 'Inventory has a duration of use; a consumable has none.',
      },
    ]);
    expect(calls('job_position_equipment', 'POST')).toHaveLength(0);
  });

  it('answers 409 when the client is archived', async () => {
    mockUpstream({
      equipment: (init) =>
        init?.method === 'POST'
          ? Response.json(
              { code: 'CLA01', message: 'An archived client is not changed.', details: null },
              { status: 400 }
            )
          : undefined,
    });
    const response = await request(path, 'POST', {
      risk: 'Pulberi',
      item: 'Mănuși',
      durationMonths: 6,
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });
});

describe('PUT and DELETE …/equipment/{entryId}', () => {
  it('replaces an entry of the position', async () => {
    mockUpstream();
    const response = await request(`${path}/${maskId}`, 'PUT', {
      risk: 'Radiații',
      item: 'Mască de sudură',
      quantity: 1,
      durationMonths: 12,
      allocation: 'personal_inventory',
    });
    expect(response.status).toBe(200);
    expect(sent('job_position_equipment', 'PATCH')).toEqual({
      risk: 'Radiații',
      item: 'Mască de sudură',
      quantity: 1,
      duration_months: 12,
      allocation: 'personal_inventory',
    });
    const [update] = calls('job_position_equipment', 'PATCH').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(update!.get('id')).toBe(`eq.${maskId}`);
    expect(update!.get('job_position_id')).toBe(`eq.${welderId}`);
  });

  it('removes an entry, and answers 404 for one that is not on the position', async () => {
    mockUpstream();
    expect((await request(`${path}/${maskId}`, 'DELETE')).status).toBe(204);
    mockUpstream({
      equipment: (init) => (init?.method === 'DELETE' ? Response.json([]) : undefined),
    });
    expect((await request(`${path}/${maskId}`, 'DELETE')).status).toBe(404);
  });
});

describe('POST …/equipment/copy', () => {
  it('copies the entries of another position of the client after the existing ones', async () => {
    let listed = 0;
    mockUpstream({
      positions: (init, url) =>
        isGet(init) && url.searchParams.get('id') === `eq.${fitterId}`
          ? Response.json([{ id: fitterId }])
          : undefined,
      equipment: (init, url) => {
        if (!isGet(init)) return undefined;
        listed += 1;
        // The source's entries, then the target's list after the copy.
        return url.searchParams.get('job_position_id') === `eq.${fitterId}`
          ? Response.json([gloves])
          : Response.json([mask, { ...gloves, job_position_id: welderId }]);
      },
    });
    const response = await request(`${path}/copy`, 'POST', { fromJobPositionId: fitterId });
    expect(response.status).toBe(200);
    const body = equipmentListResponseSchema.parse(await response.json());
    expect(body.items).toHaveLength(2);
    expect(listed).toBe(2);
    expect(sent('job_position_equipment', 'POST')).toEqual([
      {
        risk: gloves.risk,
        item: gloves.item,
        quantity: 2,
        duration_months: 3,
        allocation: 'personal_inventory',
        organization_id: membership.organization_id,
        client_id: clientId,
        job_position_id: welderId,
        created_by: user.id,
      },
    ]);
  });

  it('refuses the position itself, and a position of another client', async () => {
    mockUpstream({
      positions: (init, url) =>
        isGet(init) && url.searchParams.get('id') === `eq.${fitterId}`
          ? Response.json([])
          : undefined,
    });
    const self = await request(`${path}/copy`, 'POST', { fromJobPositionId: welderId });
    expect(self.status).toBe(400);
    const other = await request(`${path}/copy`, 'POST', { fromJobPositionId: fitterId });
    expect(other.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await other.json()).issues?.[0]?.path).toBe(
      'fromJobPositionId'
    );
    expect(calls('job_position_equipment', 'POST')).toHaveLength(0);
  });
});

describe('PATCH …/protective-equipment', () => {
  const decisionPath = `/clients/${clientId}/job-positions/${welderId}/protective-equipment`;

  it('marks the position as needing none and returns it with its counts', async () => {
    mockUpstream({
      positions: (init) =>
        init?.method === 'PATCH'
          ? Response.json({ ...welder, needs_protective_equipment: false })
          : undefined,
    });
    const response = await request(decisionPath, 'PATCH', { needsProtectiveEquipment: false });
    expect(response.status).toBe(200);
    const { jobPosition } = jobPositionResponseSchema.parse(await response.json());
    expect([
      jobPosition.needsProtectiveEquipment,
      jobPosition.employeeCount,
      jobPosition.equipmentCount,
    ]).toEqual([false, 3, 2]);
    expect(sent('job_positions', 'PATCH')).toEqual({ needs_protective_equipment: false });
  });

  it('refuses "needs equipment" in words, and "needs none" while entries exist', async () => {
    mockUpstream();
    const inWords = await request(decisionPath, 'PATCH', { needsProtectiveEquipment: true });
    expect(inWords.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await inWords.json()).reason).toBe(
      'equipment_decided_by_entries'
    );
    expect(calls('job_positions', 'PATCH')).toHaveLength(0);

    mockUpstream({
      positions: (init) =>
        init?.method === 'PATCH'
          ? Response.json(
              { code: 'EQP01', message: 'The position has equipment entries.', details: null },
              { status: 400 }
            )
          : undefined,
    });
    const withEntries = await request(decisionPath, 'PATCH', { needsProtectiveEquipment: false });
    expect(withEntries.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await withEntries.json()).reason).toBe(
      'equipment_entries_exist'
    );
  });
});

describe('GET /equipment-suggestions', () => {
  it('returns the distinct values that contain the query, most recent first', async () => {
    mockUpstream({
      equipment: () =>
        Response.json([
          { item: 'Mănuși de sudor', updated_at: '2026-09-24T12:00:00Z' },
          { item: 'Mască de sudură', updated_at: '2026-09-24T11:00:00Z' },
          { item: 'mănuși de sudor', updated_at: '2026-09-24T10:00:00Z' },
          { item: 'Bocanci', updated_at: '2026-09-24T09:00:00Z' },
        ]),
    });
    const response = await request('/equipment-suggestions?field=item&query=SUD');
    expect(response.status).toBe(200);
    expect(equipmentSuggestionsResponseSchema.parse(await response.json()).items).toEqual([
      'Mănuși de sudor',
      'Mască de sudură',
    ]);
    const [list] = calls('job_position_equipment', 'GET').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(list!.get('select')).toBe('item,updated_at');
    expect(list!.get('order')).toBe('updated_at.desc');
  });

  it('refuses a field it does not suggest', async () => {
    mockUpstream();
    expect((await request('/equipment-suggestions?field=quantity')).status).toBe(400);
  });
});
