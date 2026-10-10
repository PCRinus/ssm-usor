import {
  apiErrorResponseSchema,
  clientFireSafetyResponseSchema,
  fireEquipmentListResponseSchema,
  fireEquipmentResponseSchema,
  fireInstallationListResponseSchema,
  fireInstallationResponseSchema,
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

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const membership = { user_id: user.id, organization_id: organizationId, role: 'specialist' };

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const officeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const shopId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const archivedWorkplaceId = '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d';

const fireSafetyRow = {
  periodic_training_hours: 2,
  administrative_training_interval_months: 3,
  worker_training_interval_months: 3,
  training_first_month: 2,
  training_day_from: 2,
  training_day_to: 7,
  smoking_policy: null,
  smoking_place: null,
  waste_kinds: ['deșeuri de carton, hârtie, plastic'],
  waste_contractor: 'Salubris S.A.',
};

const unit = (id: string, workplaceId: string, fields: Record<string, unknown>) => ({
  id,
  client_id: clientId,
  workplace_id: workplaceId,
  kind: 'extinguisher',
  agent: null,
  capacity: null,
  wheeled: false,
  label: null,
  location: null,
  manufactured_year: null,
  last_service_on: null,
  next_service_on: null,
  maintainer: null,
  created_at: '2026-10-10T10:00:00+00:00',
  updated_at: '2026-10-10T10:00:00+00:00',
  ...fields,
});

const shopCo2 = unit('00000000-0000-4000-8000-000000000001', shopId, {
  agent: 'co2',
  capacity: 3,
});
const shopSand = unit('00000000-0000-4000-8000-000000000002', shopId, { kind: 'sand_box' });
const officePowderB = unit('00000000-0000-4000-8000-000000000003', officeId, {
  agent: 'powder',
  capacity: 6,
  label: 'B-2',
});
const officePowderA = unit('00000000-0000-4000-8000-000000000004', officeId, {
  agent: 'powder',
  capacity: 6,
  label: 'A-1',
});
const shopPowder = unit('00000000-0000-4000-8000-000000000005', shopId, {
  agent: 'powder',
  capacity: 6,
});
const officeWheeled = unit('00000000-0000-4000-8000-000000000006', officeId, {
  agent: 'powder',
  capacity: 50,
  wheeled: true,
});
const archivedUnit = unit('00000000-0000-4000-8000-000000000007', archivedWorkplaceId, {
  agent: 'powder',
  capacity: 6,
});

const installation = (id: string, workplaceId: string, kind: string, description = null) => ({
  id,
  client_id: clientId,
  workplace_id: workplaceId,
  kind,
  description,
  maintainer: null,
  last_check_on: null,
  next_check_on: null,
  created_at: '2026-10-10T10:00:00+00:00',
  updated_at: '2026-10-10T10:00:00+00:00',
});

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;
type Upstream = 'clients' | 'workplaces' | 'fireSafety' | 'equipment' | 'installations';

const fetchMock = vi.fn<typeof fetch>();

const isGet = (init: RequestInit | undefined) => (init?.method ?? 'GET') === 'GET';

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const custom = (name: Upstream) => handlers[name]?.(init, url);
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json(user);
      case '/rest/v1/rpc/current_membership':
        return Response.json([membership]);
      case '/rest/v1/clients':
        return custom('clients') ?? Response.json([{ id: clientId }]);
      case '/rest/v1/client_workplaces':
        return (
          custom('workplaces') ??
          (url.searchParams.has('order')
            ? Response.json([{ id: officeId }, { id: shopId }])
            : Response.json([{ id: shopId }]))
        );
      case '/rest/v1/client_fire_safety':
        return custom('fireSafety') ?? Response.json([fireSafetyRow]);
      case '/rest/v1/fire_equipment':
        return custom('equipment') ?? Response.json(shopPowder);
      case '/rest/v1/fire_installations':
        return (
          custom('installations') ??
          Response.json(
            installation('10000000-0000-4000-8000-000000000001', shopId, 'detection_alarm')
          )
        );
      default:
        throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
    }
  });
}

const calls = (table: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === `/rest/v1/${table}` && (init?.method ?? 'GET') === method
  );

const sent = (table: string, method: string, index = 0) =>
  JSON.parse(String(calls(table, method)[index]![1]?.body)) as Record<string, unknown>;

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

const databaseError = (code: string, status: number) =>
  Response.json({ code, message: 'refused', details: null, hint: null }, { status });

const noClient: Handler = () => Response.json([]);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('/clients/{clientId}/fire-safety', () => {
  const path = `/clients/${clientId}/fire-safety`;
  const body = {
    periodicTrainingHours: 2,
    administrativeTrainingIntervalMonths: 3,
    workerTrainingIntervalMonths: 3,
    trainingFirstMonth: 2,
    trainingDayFrom: 2,
    trainingDayTo: 7,
    wasteKinds: [' deșeuri de carton, hârtie, plastic '],
    wasteContractor: 'Salubris S.A.',
  };

  it('reads the saved facts', async () => {
    mockUpstream();
    const response = await request(path);
    expect(response.status).toBe(200);
    const parsed = clientFireSafetyResponseSchema.parse(await response.json());
    expect(parsed.exists).toBe(true);
    expect(parsed.fireSafety).toMatchObject({
      periodicTrainingHours: 2,
      workerTrainingIntervalMonths: 3,
      wasteKinds: ['deșeuri de carton, hârtie, plastic'],
    });
  });

  it('answers with empty facts and exists false before the first save', async () => {
    mockUpstream({ fireSafety: () => Response.json([]) });
    const parsed = clientFireSafetyResponseSchema.parse(await (await request(path)).json());
    expect(parsed).toEqual({
      exists: false,
      fireSafety: {
        periodicTrainingHours: null,
        administrativeTrainingIntervalMonths: null,
        workerTrainingIntervalMonths: null,
        trainingFirstMonth: null,
        trainingDayFrom: null,
        trainingDayTo: null,
        smokingPolicy: null,
        smokingPlace: null,
        wasteKinds: [],
        wasteContractor: null,
      },
    });
  });

  it('answers 404 for a client of another organization', async () => {
    mockUpstream({ clients: noClient });
    expect((await request(path)).status).toBe(404);
    expect((await request(path, 'PUT', body)).status).toBe(404);
    expect(calls('client_fire_safety', 'GET')).toHaveLength(0);
    expect(calls('client_fire_safety', 'PATCH')).toHaveLength(0);
  });

  it('replaces the saved row, clearing what is left out', async () => {
    mockUpstream({
      fireSafety: (init) => (init?.method === 'PATCH' ? Response.json(fireSafetyRow) : undefined),
    });
    const response = await request(path, 'PUT', body);
    expect(response.status).toBe(200);
    expect(clientFireSafetyResponseSchema.parse(await response.json()).exists).toBe(true);
    expect(sent('client_fire_safety', 'PATCH')).toEqual({
      periodic_training_hours: 2,
      administrative_training_interval_months: 3,
      worker_training_interval_months: 3,
      training_first_month: 2,
      training_day_from: 2,
      training_day_to: 7,
      smoking_policy: null,
      smoking_place: null,
      waste_kinds: ['deșeuri de carton, hârtie, plastic'],
      waste_contractor: 'Salubris S.A.',
    });
    const [update] = calls('client_fire_safety', 'PATCH').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(update!.get('client_id')).toBe(`eq.${clientId}`);
    expect(calls('client_fire_safety', 'POST')).toHaveLength(0);
  });

  it('keeps the smoking place with designated places and drops it with any other policy', async () => {
    const place = 'În curtea interioară, lângă poarta de acces auto';
    mockUpstream({
      fireSafety: (init) =>
        init?.method === 'PATCH'
          ? Response.json({
              ...fireSafetyRow,
              smoking_policy: 'designated_places',
              smoking_place: place,
            })
          : undefined,
    });
    const response = await request(path, 'PUT', {
      ...body,
      smokingPolicy: 'designated_places',
      smokingPlace: ` ${place} `,
    });
    expect(clientFireSafetyResponseSchema.parse(await response.json()).fireSafety).toMatchObject({
      smokingPolicy: 'designated_places',
      smokingPlace: place,
    });
    expect(sent('client_fire_safety', 'PATCH')).toMatchObject({
      smoking_policy: 'designated_places',
      smoking_place: place,
    });

    await request(path, 'PUT', {
      ...body,
      smokingPolicy: 'forbidden_everywhere',
      smokingPlace: place,
    });
    expect(sent('client_fire_safety', 'PATCH', 1)).toMatchObject({
      smoking_policy: 'forbidden_everywhere',
      smoking_place: null,
    });

    await request(path, 'PUT', { ...body, smokingPlace: place });
    expect(sent('client_fire_safety', 'PATCH', 2)).toMatchObject({
      smoking_policy: null,
      smoking_place: null,
    });
  });

  it('creates the row on the first save', async () => {
    mockUpstream({
      fireSafety: (init) => {
        if (init?.method === 'PATCH') return Response.json(null);
        if (init?.method === 'POST') return Response.json(fireSafetyRow, { status: 201 });
        return undefined;
      },
    });
    const response = await request(path, 'PUT', { periodicTrainingHours: 2 });
    expect(response.status).toBe(200);
    expect(sent('client_fire_safety', 'POST')).toMatchObject({
      client_id: clientId,
      organization_id: organizationId,
      created_by: user.id,
      periodic_training_hours: 2,
      worker_training_interval_months: null,
      waste_kinds: [],
    });
  });

  it('updates the row another first save created in between', async () => {
    let updates = 0;
    mockUpstream({
      fireSafety: (init) => {
        if (init?.method === 'PATCH') {
          updates += 1;
          return Response.json(updates === 1 ? null : fireSafetyRow);
        }
        if (init?.method === 'POST') return databaseError('23505', 409);
        return undefined;
      },
    });
    expect((await request(path, 'PUT', body)).status).toBe(200);
    expect(updates).toBe(2);
  });

  it('refuses the bounds of OMAI 712/2005 before reaching the database', async () => {
    mockUpstream();
    for (const fields of [
      { periodicTrainingHours: 1 },
      { workerTrainingIntervalMonths: 12 },
      { trainingDayFrom: 8, trainingDayTo: 7 },
      { wasteKinds: Array.from({ length: 13 }, (_, index) => `deșeu ${index}`) },
    ]) {
      expect((await request(path, 'PUT', { ...body, ...fields })).status).toBe(400);
    }
    expect(calls('client_fire_safety', 'PATCH')).toHaveLength(0);
  });

  it('words the refusals of an archived client and a lead', async () => {
    for (const [code, reason] of [
      ['CLA01', 'client_archived'],
      ['CLL01', 'client_is_lead'],
    ] as const) {
      mockUpstream({
        fireSafety: (init) => {
          if (init?.method === 'PATCH') return Response.json(null);
          if (init?.method === 'POST') return databaseError(code, 400);
          return undefined;
        },
      });
      const response = await request(path, 'PUT', body);
      expect(response.status).toBe(409);
      expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(reason);
    }
  });
});

describe('/clients/{clientId}/fire-equipment', () => {
  const path = `/clients/${clientId}/fire-equipment`;
  const extinguisher = { workplaceId: shopId, kind: 'extinguisher', agent: 'powder', capacity: 6 };

  it('lists the units by workplace, then by kind, agent, capacity and label', async () => {
    mockUpstream({
      equipment: (init) =>
        isGet(init)
          ? Response.json([
              shopSand,
              archivedUnit,
              shopCo2,
              officeWheeled,
              officePowderB,
              shopPowder,
              officePowderA,
            ])
          : undefined,
    });
    const response = await request(path);
    expect(response.status).toBe(200);
    const { items } = fireEquipmentListResponseSchema.parse(await response.json());
    expect(items.map((item) => item.id)).toEqual([
      officePowderA.id,
      officePowderB.id,
      officeWheeled.id,
      shopPowder.id,
      shopCo2.id,
      shopSand.id,
    ]);
    const [workplaces] = calls('client_workplaces', 'GET').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(workplaces!.get('client_id')).toBe(`eq.${clientId}`);
    expect(workplaces!.get('archived_at')).toBe('is.null');
    expect(workplaces!.get('order')).toBe('is_registered_office.desc,name.asc,id.asc');
  });

  it('answers 404 for a client of another organization', async () => {
    mockUpstream({ clients: noClient });
    expect((await request(path)).status).toBe(404);
    expect((await request(path, 'POST', extinguisher)).status).toBe(404);
    expect(calls('fire_equipment', 'GET')).toHaveLength(0);
    expect(calls('fire_equipment', 'POST')).toHaveLength(0);
  });

  it('adds a unit to an active workplace of the client', async () => {
    mockUpstream({
      equipment: (init) =>
        init?.method === 'POST' ? Response.json(shopPowder, { status: 201 }) : undefined,
    });
    const response = await request(path, 'POST', { ...extinguisher, label: ' P6-001 ' });
    expect(response.status).toBe(201);
    expect(fireEquipmentResponseSchema.parse(await response.json()).equipment.agent).toBe('powder');
    expect(sent('fire_equipment', 'POST')).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      workplace_id: shopId,
      kind: 'extinguisher',
      agent: 'powder',
      capacity: 6,
      wheeled: false,
      label: 'P6-001',
      location: null,
      manufactured_year: null,
      last_service_on: null,
      next_service_on: null,
      maintainer: null,
      created_by: user.id,
    });
    const [find] = calls('client_workplaces', 'GET').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(find!.get('id')).toBe(`eq.${shopId}`);
    expect(find!.get('client_id')).toBe(`eq.${clientId}`);
    expect(find!.get('archived_at')).toBe('is.null');
  });

  it('refuses a workplace that is not an active one of this client', async () => {
    mockUpstream({ workplaces: () => Response.json([]) });
    for (const [method, url] of [
      ['POST', path],
      ['PUT', `${path}/${shopPowder.id}`],
    ] as const) {
      const response = await request(url, method, extinguisher);
      expect(response.status).toBe(400);
      expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
        'workplaceId'
      );
    }
    expect(calls('fire_equipment', 'POST')).toHaveLength(0);
    expect(calls('fire_equipment', 'PATCH')).toHaveLength(0);
  });

  it('names the workplace when the foreign key refuses it', async () => {
    mockUpstream({
      equipment: (init) => (init?.method === 'POST' ? databaseError('23503', 409) : undefined),
    });
    const response = await request(path, 'POST', extinguisher);
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
      'workplaceId'
    );
  });

  it('refuses an extinguisher without agent or capacity, and a sand box with one, before the database', async () => {
    mockUpstream();
    for (const unitBody of [
      { ...extinguisher, agent: undefined },
      { ...extinguisher, capacity: null },
      { workplaceId: shopId, kind: 'sand_box', agent: 'powder' },
      { workplaceId: shopId, kind: 'fire_post', wheeled: true },
    ]) {
      const response = await request(path, 'POST', unitBody);
      expect(response.status).toBe(400);
      expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
    }
    expect(calls('clients', 'GET')).toHaveLength(0);
    expect(calls('fire_equipment', 'POST')).toHaveLength(0);
  });

  it('replaces a unit scoped to the client, and answers 404 when it is not there', async () => {
    mockUpstream({ equipment: () => Response.json(shopPowder) });
    const item = `${path}/${shopPowder.id}`;
    expect(
      (await request(item, 'PUT', { ...extinguisher, location: 'Lângă casa de marcat' })).status
    ).toBe(200);
    const [update] = calls('fire_equipment', 'PATCH').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(update!.get('id')).toBe(`eq.${shopPowder.id}`);
    expect(update!.get('client_id')).toBe(`eq.${clientId}`);
    expect(sent('fire_equipment', 'PATCH')).toMatchObject({ location: 'Lângă casa de marcat' });

    mockUpstream({ equipment: () => Response.json(null) });
    expect((await request(item, 'PUT', extinguisher)).status).toBe(404);
  });

  it('deletes a unit, and answers 404 when it is not there', async () => {
    mockUpstream({ equipment: () => Response.json([{ id: shopPowder.id }]) });
    const item = `${path}/${shopPowder.id}`;
    expect((await request(item, 'DELETE')).status).toBe(204);
    const [remove] = calls('fire_equipment', 'DELETE').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(remove!.get('client_id')).toBe(`eq.${clientId}`);

    mockUpstream({ equipment: () => Response.json([]) });
    expect((await request(item, 'DELETE')).status).toBe(404);
  });

  it('words the refusal of an archived client', async () => {
    mockUpstream({ equipment: () => databaseError('CLA01', 400) });
    const response = await request(`${path}/${shopPowder.id}`, 'DELETE');
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });
});

describe('/clients/{clientId}/fire-installations', () => {
  const path = `/clients/${clientId}/fire-installations`;

  it('lists the installations by workplace, then by kind', async () => {
    const shopHydrants = installation(
      '10000000-0000-4000-8000-000000000001',
      shopId,
      'interior_hydrants'
    );
    const shopAlarm = installation(
      '10000000-0000-4000-8000-000000000002',
      shopId,
      'detection_alarm'
    );
    const officeLighting = installation(
      '10000000-0000-4000-8000-000000000003',
      officeId,
      'emergency_lighting'
    );
    const archived = installation(
      '10000000-0000-4000-8000-000000000004',
      archivedWorkplaceId,
      'detection_alarm'
    );
    mockUpstream({
      installations: (init) =>
        isGet(init)
          ? Response.json([shopHydrants, archived, officeLighting, shopAlarm])
          : undefined,
    });
    const response = await request(path);
    expect(response.status).toBe(200);
    const { items } = fireInstallationListResponseSchema.parse(await response.json());
    expect(items.map((item) => item.id)).toEqual([
      officeLighting.id,
      shopAlarm.id,
      shopHydrants.id,
    ]);
  });

  it('adds an installation, and asks a description of another kind', async () => {
    mockUpstream();
    const response = await request(path, 'POST', {
      workplaceId: shopId,
      kind: 'detection_alarm',
      maintainer: 'Alarm Service S.R.L.',
      nextCheckOn: '2027-03-01',
    });
    expect(response.status).toBe(201);
    fireInstallationResponseSchema.parse(await response.json());
    expect(sent('fire_installations', 'POST')).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      workplace_id: shopId,
      kind: 'detection_alarm',
      description: null,
      maintainer: 'Alarm Service S.R.L.',
      last_check_on: null,
      next_check_on: '2027-03-01',
      created_by: user.id,
    });

    expect((await request(path, 'POST', { workplaceId: shopId, kind: 'other' })).status).toBe(400);
  });

  it('refuses a workplace of another client, and answers 404 for what is not there', async () => {
    mockUpstream({ workplaces: () => Response.json([]) });
    expect(
      (await request(path, 'POST', { workplaceId: officeId, kind: 'sprinklers' })).status
    ).toBe(400);

    mockUpstream({ installations: () => Response.json(null) });
    const item = `${path}/10000000-0000-4000-8000-000000000001`;
    expect((await request(item, 'PUT', { workplaceId: shopId, kind: 'sprinklers' })).status).toBe(
      404
    );

    mockUpstream({ installations: () => Response.json([]) });
    expect((await request(item, 'DELETE')).status).toBe(404);
  });
});
