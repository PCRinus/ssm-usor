import {
  apiErrorResponseSchema,
  jobPositionRiskEvaluationResponseSchema,
  riskEvaluationListResponseSchema,
  riskEvaluationResponseSchema,
  riskFactorSuggestionsResponseSchema,
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
  email: 'specialist@example.com',
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
const managerId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const evaluationId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const sensitiveId = '8d0f7780-8536-41ef-a55c-f18fd2010bf8';
const otherId = '9e1a8891-9647-42f0-b66d-0290e3121c09';
const electrocutionId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const rhythmId = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

const stamp = '2026-10-01T10:00:00+00:00';

const electrocution = {
  id: electrocutionId,
  component: 'means_of_production',
  factor_group: 'Factori de risc electric',
  description: 'Electrocutare prin atingere indirectă',
  gravity_class: 5,
  probability_class: 2,
  actions: 'Verificarea instalației',
  deadline: 'Anual',
  responsible_person: 'Administrator',
  observations: null,
  sort_order: 1,
  created_at: stamp,
  updated_at: stamp,
  prevention_measures: [
    {
      id: 'b1000000-0000-4000-8000-000000000002',
      kind: 'organizational',
      description: 'Instruire',
      sort_order: 1,
    },
    {
      id: 'b1000000-0000-4000-8000-000000000001',
      kind: 'technical',
      description: 'Buletine P.R.A.M.',
      sort_order: 0,
    },
  ],
};

const rhythm = {
  ...electrocution,
  id: rhythmId,
  component: 'work_task',
  factor_group: 'Suprasolicitare psihică',
  description: 'Ritm de muncă intens',
  gravity_class: 2,
  probability_class: 4,
  actions: null,
  deadline: null,
  responsible_person: null,
  sort_order: 0,
  prevention_measures: [],
};

const managerEvaluation = {
  id: evaluationId,
  client_id: clientId,
  kind: 'job_position',
  name: null,
  means_of_production: 'Calculator, imprimantă',
  work_environment: 'Birou',
  exposure: '8 h / schimb',
  work_task: null,
  exposed_persons: null,
  created_at: stamp,
  updated_at: stamp,
  job_positions: { id: managerId, name: 'Manager magazin' },
  risk_factors: [electrocution, rhythm],
};

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;

const isGet = (init: RequestInit | undefined) => (init?.method ?? 'GET') === 'GET';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(
  handlers: {
    clients?: Handler;
    positions?: Handler;
    evaluations?: Handler;
    factors?: Handler;
    rpc?: Handler;
  } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const custom = handlers.rpc?.(init, url);
      if (custom) return custom;
      if (url.pathname.endsWith('/save_risk_factor')) return Response.json(electrocutionId);
      if (url.pathname.endsWith('/reorder_risk_factors')) return Response.json(true);
      if (url.pathname.endsWith('/copy_risk_factors')) return Response.json(2);
    }
    if (url.pathname === '/rest/v1/clients') {
      return handlers.clients?.(init, url) ?? Response.json([{ id: clientId }]);
    }
    if (url.pathname === '/rest/v1/job_positions') {
      return (
        handlers.positions?.(init, url) ??
        Response.json([
          { id: managerId, needs_protective_equipment: null, needs_instructions: null },
        ])
      );
    }
    if (url.pathname === '/rest/v1/risk_evaluations') {
      const custom = handlers.evaluations?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return Response.json({ id: evaluationId }, { status: 201 });
      if (init?.method === 'PATCH') return Response.json([]);
      if (init?.method === 'DELETE') return Response.json([{ id: evaluationId }]);
      if (url.searchParams.get('select') === 'id,kind') {
        return Response.json([{ id: evaluationId, kind: 'job_position' }]);
      }
      return Response.json([managerEvaluation]);
    }
    if (url.pathname === '/rest/v1/risk_factors') {
      const custom = handlers.factors?.(init, url);
      if (custom) return custom;
      if (init?.method === 'DELETE') return Response.json([{ id: electrocutionId }]);
      return Response.json([]);
    }
    throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
  });
}

const calls = (path: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === `/rest/v1/${path}` && (init?.method ?? 'GET') === method
  );

const sent = (path: string, method: string, index = 0) =>
  JSON.parse(String(calls(path, method)[index]![1]?.body)) as unknown;

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

const base = `/clients/${clientId}/risk-evaluations`;
const evaluationPath = `${base}/${evaluationId}`;

const factorBody = {
  component: 'means_of_production',
  group: 'Factori de risc electric',
  description: 'Electrocutare prin atingere indirectă',
  gravityClass: 5,
  probabilityClass: 2,
  measures: [{ kind: 'technical', description: 'Buletine P.R.A.M.' }],
  deadline: 'Anual',
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('GET /clients/{clientId}/risk-evaluations', () => {
  it('lists positions by name, then the sensitive groups, then the others, without archived positions', async () => {
    mockUpstream({
      evaluations: (init) =>
        isGet(init)
          ? Response.json([
              {
                id: otherId,
                client_id: clientId,
                kind: 'other',
                name: 'Vizitatori',
                created_at: stamp,
                updated_at: stamp,
                job_positions: null,
                risk_factors: [],
              },
              {
                id: sensitiveId,
                client_id: clientId,
                kind: 'sensitive_groups',
                name: null,
                created_at: stamp,
                updated_at: stamp,
                job_positions: null,
                risk_factors: [{ gravity_class: 2, probability_class: 2 }],
              },
              {
                id: evaluationId,
                client_id: clientId,
                kind: 'job_position',
                name: null,
                created_at: stamp,
                updated_at: stamp,
                job_positions: { id: managerId, name: 'Manager magazin', archived_at: null },
                risk_factors: [
                  { gravity_class: 5, probability_class: 2 },
                  { gravity_class: 2, probability_class: 4 },
                ],
              },
              {
                id: '0f2b99a2-a758-43a1-877e-03a1f4232d1a',
                client_id: clientId,
                kind: 'job_position',
                name: null,
                created_at: stamp,
                updated_at: stamp,
                job_positions: {
                  id: '1a3c0ab3-b869-44b2-988f-14b205343e2b',
                  name: 'Barman',
                  archived_at: stamp,
                },
                risk_factors: [],
              },
            ])
          : undefined,
    });
    const response = await request(base);
    expect(response.status).toBe(200);
    const { items } = riskEvaluationListResponseSchema.parse(await response.json());
    expect(
      items.map((item) => [
        item.kind,
        item.jobPosition?.name ?? item.name,
        item.factorCount,
        item.unacceptableFactorCount,
        item.globalRiskLevel,
      ])
    ).toEqual([
      ['job_position', 'Manager magazin', 2, 1, 3.33],
      ['sensitive_groups', null, 1, 0, 2],
      ['other', 'Vizitatori', 0, 0, null],
    ]);
  });

  it('answers 404 for a client outside the organization', async () => {
    mockUpstream({ clients: () => Response.json([]) });
    expect((await request(base)).status).toBe(404);
    expect(calls('risk_evaluations', 'GET')).toHaveLength(0);
  });
});

describe('POST /clients/{clientId}/risk-evaluations', () => {
  it('starts the evaluation of a position, with a shift of exposure by default', async () => {
    mockUpstream();
    const response = await request(base, 'POST', {
      kind: 'job_position',
      jobPositionId: managerId,
    });
    expect(response.status).toBe(201);
    expect(riskEvaluationResponseSchema.parse(await response.json()).evaluation.id).toBe(
      evaluationId
    );
    expect(sent('risk_evaluations', 'POST')).toEqual({
      organization_id: membership.organization_id,
      client_id: clientId,
      kind: 'job_position',
      job_position_id: managerId,
      name: null,
      means_of_production: null,
      work_environment: null,
      exposure: '8 h / schimb',
      work_task: null,
      exposed_persons: null,
      created_by: user.id,
    });
  });

  it('answers 400 on jobPositionId for a position that is not a current one of the client', async () => {
    mockUpstream({ positions: () => Response.json([]) });
    const response = await request(base, 'POST', {
      kind: 'job_position',
      jobPositionId: managerId,
    });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe(
      'jobPositionId'
    );
    expect(calls('risk_evaluations', 'POST')).toHaveLength(0);
  });

  it('records the work task and the persons exposed of a client-level evaluation only', async () => {
    mockUpstream();
    const other = await request(base, 'POST', {
      kind: 'other',
      name: 'Vizitatori',
      workTask: 'Cumpără înghețată',
      exposedPersons: 'Min. 3 persoane',
    });
    expect(other.status).toBe(201);
    expect(sent('risk_evaluations', 'POST')).toMatchObject({
      work_task: 'Cumpără înghețată',
      exposed_persons: 'Min. 3 persoane',
    });
    const position = await request(base, 'POST', {
      kind: 'job_position',
      jobPositionId: managerId,
      exposedPersons: '2 persoane',
    });
    expect(position.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await position.json()).issues?.[0]?.path).toBe(
      'exposedPersons'
    );
    expect(calls('risk_evaluations', 'POST')).toHaveLength(1);
  });

  it('requires a name for another evaluation, and none for the sensitive groups', async () => {
    mockUpstream();
    expect((await request(base, 'POST', { kind: 'other' })).status).toBe(400);
    expect((await request(base, 'POST', { kind: 'sensitive_groups' })).status).toBe(201);
    expect(sent('risk_evaluations', 'POST')).toMatchObject({
      kind: 'sensitive_groups',
      name: null,
      job_position_id: null,
    });
  });

  it('answers 409 for a second evaluation, and for a name taken', async () => {
    const duplicate = () =>
      mockUpstream({
        evaluations: (init) =>
          init?.method === 'POST'
            ? Response.json(
                { code: '23505', message: 'duplicate key', details: null },
                { status: 409 }
              )
            : undefined,
      });
    duplicate();
    const second = await request(base, 'POST', { kind: 'sensitive_groups' });
    expect(second.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await second.json()).reason).toBe('risk_evaluation_exists');
    duplicate();
    const named = await request(base, 'POST', { kind: 'other', name: 'Vizitatori' });
    expect(named.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await named.json()).reason).toBe(
      'risk_evaluation_name_taken'
    );
  });

  it('answers 409 when the client is archived', async () => {
    mockUpstream({
      evaluations: (init) =>
        init?.method === 'POST'
          ? Response.json(
              { code: 'CLA01', message: 'An archived client is not changed.', details: null },
              { status: 400 }
            )
          : undefined,
    });
    const response = await request(base, 'POST', { kind: 'sensitive_groups' });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });
});

describe('GET …/risk-evaluations/{evaluationId}', () => {
  it('returns the factors and measures in their order, with their levels and the global level', async () => {
    mockUpstream();
    const response = await request(evaluationPath);
    expect(response.status).toBe(200);
    const { evaluation } = riskEvaluationResponseSchema.parse(await response.json());
    expect(evaluation.jobPosition).toEqual({ id: managerId, name: 'Manager magazin' });
    expect(evaluation.factors.map((f) => [f.description, f.riskLevel, f.group])).toEqual([
      ['Ritm de muncă intens', 2, 'Suprasolicitare psihică'],
      ['Electrocutare prin atingere indirectă', 4, 'Factori de risc electric'],
    ]);
    expect(evaluation.factors[1]!.measures.map((m) => m.kind)).toEqual([
      'technical',
      'organizational',
    ]);
    expect(evaluation.globalRiskLevel).toBe(3.33);
    const [find] = calls('risk_evaluations', 'GET').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(find!.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('answers 404 for an evaluation of another client', async () => {
    mockUpstream({ evaluations: (init) => (isGet(init) ? Response.json([]) : undefined) });
    expect((await request(evaluationPath)).status).toBe(404);
  });
});

describe('GET …/job-positions/{jobPositionId}/risk-evaluation', () => {
  const positionPath = `/clients/${clientId}/job-positions/${managerId}/risk-evaluation`;

  it('returns the position’s evaluation', async () => {
    mockUpstream();
    const response = await request(positionPath);
    expect(response.status).toBe(200);
    const body = jobPositionRiskEvaluationResponseSchema.parse(await response.json());
    expect(body.evaluation?.factors).toHaveLength(2);
    const [read] = calls('risk_evaluations', 'GET').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(read!.get('job_position_id')).toBe(`eq.${managerId}`);
  });

  it('returns null for a position not evaluated yet, and 404 for an archived one', async () => {
    mockUpstream({ evaluations: () => Response.json([]) });
    const response = await request(positionPath);
    expect(
      jobPositionRiskEvaluationResponseSchema.parse(await response.json()).evaluation
    ).toBeNull();
    mockUpstream({ positions: () => Response.json([]) });
    expect((await request(positionPath)).status).toBe(404);
  });
});

describe('PATCH and DELETE …/risk-evaluations/{evaluationId}', () => {
  it('changes only the fields sent', async () => {
    mockUpstream();
    const response = await request(evaluationPath, 'PATCH', {
      workEnvironment: null,
      exposure: '4 h / schimb',
    });
    expect(response.status).toBe(200);
    expect(sent('risk_evaluations', 'PATCH')).toEqual({
      work_environment: null,
      exposure: '4 h / schimb',
    });
  });

  it('refuses a name for the evaluation of a position', async () => {
    mockUpstream();
    const response = await request(evaluationPath, 'PATCH', { name: 'Altceva' });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe('name');
    expect(calls('risk_evaluations', 'PATCH')).toHaveLength(0);
  });

  it('refuses a work task or exposed persons for the evaluation of a position', async () => {
    mockUpstream();
    const response = await request(evaluationPath, 'PATCH', { workTask: 'Vânzare' });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe('workTask');
    expect(calls('risk_evaluations', 'PATCH')).toHaveLength(0);
  });

  it('changes the work task and the persons exposed of a client-level evaluation', async () => {
    mockUpstream({
      evaluations: (init, url) =>
        isGet(init) && url.searchParams.get('select') === 'id,kind'
          ? Response.json([{ id: evaluationId, kind: 'sensitive_groups' }])
          : undefined,
    });
    const response = await request(evaluationPath, 'PATCH', {
      workTask: 'Lucrători sub 18 ani',
      exposedPersons: null,
    });
    expect(response.status).toBe(200);
    expect(sent('risk_evaluations', 'PATCH')).toEqual({
      work_task: 'Lucrători sub 18 ani',
      exposed_persons: null,
    });
  });

  it('deletes an evaluation, and answers 404 for one not under the client', async () => {
    mockUpstream();
    expect((await request(evaluationPath, 'DELETE')).status).toBe(204);
    mockUpstream({
      evaluations: (init) => (init?.method === 'DELETE' ? Response.json([]) : undefined),
    });
    expect((await request(evaluationPath, 'DELETE')).status).toBe(404);
  });
});

describe('factors', () => {
  it('adds a factor with its measures in one call, leaving out the empty plan fields', async () => {
    mockUpstream();
    const response = await request(`${evaluationPath}/factors`, 'POST', factorBody);
    expect(response.status).toBe(201);
    expect(
      riskEvaluationResponseSchema.parse(await response.json()).evaluation.factors
    ).toHaveLength(2);
    expect(sent('rpc/save_risk_factor', 'POST')).toEqual({
      p_evaluation_id: evaluationId,
      p_component: 'means_of_production',
      p_factor_group: 'Factori de risc electric',
      p_description: 'Electrocutare prin atingere indirectă',
      p_gravity_class: 5,
      p_probability_class: 2,
      p_measures: [{ kind: 'technical', description: 'Buletine P.R.A.M.' }],
      p_deadline: 'Anual',
    });
  });

  it('refuses classes outside the method', async () => {
    mockUpstream();
    expect(
      (await request(`${evaluationPath}/factors`, 'POST', { ...factorBody, gravityClass: 8 }))
        .status
    ).toBe(400);
    expect(
      (await request(`${evaluationPath}/factors`, 'POST', { ...factorBody, probabilityClass: 7 }))
        .status
    ).toBe(400);
    expect(calls('rpc/save_risk_factor', 'POST')).toHaveLength(0);
  });

  it('replaces a factor, and answers 404 for one not on the evaluation', async () => {
    mockUpstream();
    const response = await request(
      `${evaluationPath}/factors/${electrocutionId}`,
      'PUT',
      factorBody
    );
    expect(response.status).toBe(200);
    expect(sent('rpc/save_risk_factor', 'POST')).toMatchObject({ p_factor_id: electrocutionId });
    mockUpstream({ rpc: () => Response.json(null) });
    expect(
      (await request(`${evaluationPath}/factors/${electrocutionId}`, 'PUT', factorBody)).status
    ).toBe(404);
  });

  it('removes a factor and answers with the evaluation', async () => {
    mockUpstream();
    const response = await request(`${evaluationPath}/factors/${electrocutionId}`, 'DELETE');
    expect(response.status).toBe(200);
    const [remove] = calls('risk_factors', 'DELETE').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(remove!.get('evaluation_id')).toBe(`eq.${evaluationId}`);
    mockUpstream({
      factors: (init) => (init?.method === 'DELETE' ? Response.json([]) : undefined),
    });
    expect((await request(`${evaluationPath}/factors/${electrocutionId}`, 'DELETE')).status).toBe(
      404
    );
  });

  it('reorders the factors, and refuses an order that is not every factor once', async () => {
    mockUpstream();
    const order = { factorIds: [electrocutionId, rhythmId] };
    expect((await request(`${evaluationPath}/factor-order`, 'PUT', order)).status).toBe(200);
    expect(sent('rpc/reorder_risk_factors', 'POST')).toEqual({
      p_evaluation_id: evaluationId,
      p_factor_ids: order.factorIds,
    });
    mockUpstream({ rpc: () => Response.json(false) });
    const refused = await request(`${evaluationPath}/factor-order`, 'PUT', order);
    expect(refused.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await refused.json()).issues?.[0]?.path).toBe('factorIds');
  });
});

describe('POST …/factors/copy', () => {
  it('copies the factors of another evaluation of the client', async () => {
    mockUpstream();
    const response = await request(`${evaluationPath}/factors/copy`, 'POST', {
      fromEvaluationId: sensitiveId,
    });
    expect(response.status).toBe(200);
    expect(sent('rpc/copy_risk_factors', 'POST')).toEqual({
      p_evaluation_id: evaluationId,
      p_from_evaluation_id: sensitiveId,
    });
  });

  it('refuses the evaluation itself, and one of another client', async () => {
    mockUpstream({
      rpc: () =>
        Response.json(
          {
            code: 'RSK01',
            message: 'Copy from another evaluation of the same client.',
            details: null,
          },
          { status: 400 }
        ),
    });
    expect(
      (await request(`${evaluationPath}/factors/copy`, 'POST', { fromEvaluationId: evaluationId }))
        .status
    ).toBe(400);
    expect(calls('rpc/copy_risk_factors', 'POST')).toHaveLength(0);
    const other = await request(`${evaluationPath}/factors/copy`, 'POST', {
      fromEvaluationId: sensitiveId,
    });
    expect(other.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await other.json()).issues?.[0]?.path).toBe(
      'fromEvaluationId'
    );
  });
});

describe('GET /risk-factor-suggestions', () => {
  it('returns the distinct values that contain the query, most recent first', async () => {
    mockUpstream({
      factors: () =>
        Response.json([
          { factor_group: 'Factori de risc electric', updated_at: '2026-10-01T12:00:00Z' },
          { factor_group: 'Factori de risc mecanic', updated_at: '2026-10-01T11:00:00Z' },
          { factor_group: 'factori de risc electric', updated_at: '2026-10-01T10:00:00Z' },
          { factor_group: 'Acțiuni greșite', updated_at: '2026-10-01T09:00:00Z' },
        ]),
    });
    const response = await request('/risk-factor-suggestions?field=group&query=RISC');
    expect(response.status).toBe(200);
    expect(riskFactorSuggestionsResponseSchema.parse(await response.json()).items).toEqual([
      'Factori de risc electric',
      'Factori de risc mecanic',
    ]);
    const [list] = calls('risk_factors', 'GET').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(list!.get('select')).toBe('factor_group,updated_at');
    expect(list!.get('factor_group')).toBe('not.is.null');
  });

  it('refuses a field it does not suggest', async () => {
    mockUpstream();
    expect((await request('/risk-factor-suggestions?field=description')).status).toBe(400);
  });
});
