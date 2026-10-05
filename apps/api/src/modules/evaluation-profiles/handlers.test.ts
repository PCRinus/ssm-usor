import {
  apiErrorResponseSchema,
  applyEvaluationProfileResponseSchema,
  evaluationProfileListResponseSchema,
  evaluationProfileResponseSchema,
  evaluationProfileUsageResponseSchema,
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

const profileId = '6b8d5568-6314-4fcd-833a-d96eb0e80ad6';
const otherProfileId = '5a7c4457-5203-4ebc-922f-c85da0d79bc5';
const factorId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const evaluationId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const stamp = '2026-10-02T10:00:00+00:00';

const electrocution = {
  id: factorId,
  component: 'means_of_production',
  factor_group: 'Factori de risc electric',
  description: 'Electrocutare prin atingere indirectă',
  gravity_class: 5,
  probability_class: 2,
  actions: null,
  deadline: 'Anual',
  responsible_person: 'Administratorul',
  observations: null,
  sort_order: 1,
  created_at: stamp,
  updated_at: stamp,
  evaluation_profile_measures: [
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
  id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  component: 'work_task',
  factor_group: 'Suprasolicitare psihică',
  description: 'Ritm de muncă intens',
  gravity_class: 2,
  probability_class: 4,
  deadline: null,
  responsible_person: null,
  sort_order: 0,
  evaluation_profile_measures: [],
};

const officeProfile = {
  id: profileId,
  name: 'Lucrător de birou',
  created_at: stamp,
  updated_at: stamp,
  evaluation_profile_factors: [electrocution, rhythm],
};

const evaluation = {
  id: evaluationId,
  client_id: clientId,
  kind: 'other',
  name: 'Vizitatori',
  means_of_production: null,
  work_environment: null,
  exposure: '8 h / schimb',
  work_task: null,
  exposed_persons: null,
  created_at: stamp,
  updated_at: stamp,
  job_positions: null,
  risk_factors: [
    {
      ...electrocution,
      evaluation_profile_measures: undefined,
      prevention_measures: electrocution.evaluation_profile_measures,
    },
  ],
};

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;

const isGet = (init: RequestInit | undefined) => (init?.method ?? 'GET') === 'GET';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(
  handlers: {
    profiles?: Handler;
    factors?: Handler;
    evaluations?: Handler;
    riskFactors?: Handler;
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
      if (url.pathname.endsWith('/save_evaluation_profile_factor')) return Response.json(factorId);
      if (url.pathname.endsWith('/save_risk_evaluation_as_profile')) {
        return Response.json(profileId);
      }
      if (url.pathname.endsWith('/apply_evaluation_profile')) return Response.json(2);
    }
    if (url.pathname === '/rest/v1/evaluation_profiles') {
      const custom = handlers.profiles?.(init, url);
      if (custom) return custom;
      if (init?.method === 'POST') return Response.json({ id: profileId }, { status: 201 });
      if (init?.method === 'PATCH' || init?.method === 'DELETE') {
        return Response.json([{ id: profileId }]);
      }
      if (url.searchParams.get('select') === 'id') return Response.json([{ id: profileId }]);
      return Response.json([officeProfile]);
    }
    if (url.pathname === '/rest/v1/evaluation_profile_factors') {
      const custom = handlers.factors?.(init, url);
      if (custom) return custom;
      if (init?.method === 'DELETE') return Response.json([{ id: factorId }]);
    }
    if (url.pathname === '/rest/v1/risk_evaluations') {
      const custom = handlers.evaluations?.(init, url);
      if (custom) return custom;
      if (url.searchParams.get('select') === 'id,kind') {
        return Response.json([{ id: evaluationId, kind: 'other' }]);
      }
      return Response.json([evaluation]);
    }
    if (url.pathname === '/rest/v1/risk_factors') {
      const custom = handlers.riskFactors?.(init, url);
      if (custom) return custom;
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

const profilePath = `/evaluation-profiles/${profileId}`;
const evaluationPath = `/clients/${clientId}/risk-evaluations/${evaluationId}`;

const factorBody = {
  component: 'means_of_production',
  group: 'Factori de risc electric',
  description: 'Electrocutare prin atingere indirectă',
  gravityClass: 5,
  probabilityClass: 2,
  measures: [{ kind: 'technical', description: 'Buletine P.R.A.M.' }],
  deadline: 'Anual',
};

const nameConflict = () =>
  Response.json(
    { code: '23505', message: 'duplicate key value', details: null, hint: null },
    { status: 409 }
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('GET /evaluation-profiles', () => {
  it('lists the library by name, with counts and global levels', async () => {
    mockUpstream({
      profiles: (init) =>
        isGet(init)
          ? Response.json([
              {
                id: otherProfileId,
                name: 'Șofer',
                created_at: stamp,
                updated_at: stamp,
                evaluation_profile_factors: [],
              },
              {
                id: profileId,
                name: 'Lucrător de birou',
                created_at: stamp,
                updated_at: stamp,
                evaluation_profile_factors: [
                  { gravity_class: 5, probability_class: 2 },
                  { gravity_class: 2, probability_class: 4 },
                ],
              },
            ])
          : undefined,
    });
    const response = await request('/evaluation-profiles');
    expect(response.status).toBe(200);
    const { items } = evaluationProfileListResponseSchema.parse(await response.json());
    expect(
      items.map((item) => [
        item.name,
        item.factorCount,
        item.unacceptableFactorCount,
        item.globalRiskLevel,
      ])
    ).toEqual([
      ['Lucrător de birou', 2, 1, 3.33],
      ['Șofer', 0, 0, null],
    ]);
  });
});

describe('POST /evaluation-profiles', () => {
  it('starts an empty profile of the organization', async () => {
    mockUpstream();
    const response = await request('/evaluation-profiles', 'POST', {
      name: '  Lucrător de birou ',
    });
    expect(response.status).toBe(201);
    expect(evaluationProfileResponseSchema.parse(await response.json()).profile.id).toBe(profileId);
    expect(sent('evaluation_profiles', 'POST')).toEqual({
      organization_id: membership.organization_id,
      name: 'Lucrător de birou',
      created_by: user.id,
    });
  });

  it('answers 409 on the name the library already holds', async () => {
    mockUpstream({ profiles: (init) => (init?.method === 'POST' ? nameConflict() : undefined) });
    const response = await request('/evaluation-profiles', 'POST', { name: 'Lucrător de birou' });
    expect(response.status).toBe(409);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.reason).toBe('evaluation_profile_name_taken');
    expect(body.issues?.[0]?.path).toBe('name');
  });

  it('refuses a name of one character', async () => {
    mockUpstream();
    expect((await request('/evaluation-profiles', 'POST', { name: ' L ' })).status).toBe(400);
    expect(calls('evaluation_profiles', 'POST')).toHaveLength(0);
  });
});

describe('GET /evaluation-profiles/{profileId}', () => {
  it('reads the factors in order, with their levels, measures and the global level', async () => {
    mockUpstream();
    const response = await request(profilePath);
    expect(response.status).toBe(200);
    const { profile } = evaluationProfileResponseSchema.parse(await response.json());
    expect(profile.factors.map((factor) => [factor.description, factor.riskLevel])).toEqual([
      ['Ritm de muncă intens', 2],
      ['Electrocutare prin atingere indirectă', 4],
    ]);
    expect(profile.factors[1]!.measures.map((measure) => measure.kind)).toEqual([
      'technical',
      'organizational',
    ]);
    expect(profile.globalRiskLevel).toBe(3.33);
    expect(profile.factors.map((factor) => factor.sourceProfile)).toEqual([null, null]);
  });

  it('answers 404 for a profile outside the organization', async () => {
    mockUpstream({ profiles: () => Response.json([]) });
    expect((await request(profilePath)).status).toBe(404);
  });
});

describe('GET /evaluation-profiles/{profileId}/usage', () => {
  const linked = (
    id: string,
    client: { id: string; name: string; archivedAt?: string },
    fields: { kind: string; name?: string; position?: { name: string; archivedAt?: string } }
  ) => ({
    evaluation_profile_factors: { profile_id: profileId },
    risk_evaluations: {
      id,
      client_id: client.id,
      kind: fields.kind,
      name: fields.name ?? null,
      job_positions: fields.position
        ? {
            id: `${id.slice(0, -4)}0000`,
            name: fields.position.name,
            archived_at: fields.position.archivedAt ?? null,
          }
        : null,
      clients: { legal_name: client.name, archived_at: client.archivedAt ?? null },
    },
  });
  const beta = { id: 'b0000000-0000-4000-8000-000000000001', name: 'Beta SRL' };
  const alfa = { id: 'a0000000-0000-4000-8000-000000000001', name: 'Alfa SRL', archivedAt: stamp };
  const visitors = 'e0000000-0000-4000-8000-000000000001';
  const accountant = 'e0000000-0000-4000-8000-000000000002';
  const sensitive = 'e0000000-0000-4000-8000-000000000003';
  const welder = 'e0000000-0000-4000-8000-000000000004';
  const alfaVisitors = 'e0000000-0000-4000-8000-000000000005';

  it('lists the evaluations with copies of its factors, counted, by client and as listed', async () => {
    mockUpstream({
      riskFactors: () =>
        Response.json([
          linked(visitors, beta, { kind: 'other', name: 'Vizitatori' }),
          linked(accountant, beta, { kind: 'job_position', position: { name: 'Contabil' } }),
          linked(visitors, beta, { kind: 'other', name: 'Vizitatori' }),
          linked(sensitive, beta, { kind: 'sensitive_groups' }),
          linked(accountant, beta, { kind: 'job_position', position: { name: 'Contabil' } }),
          linked(accountant, beta, { kind: 'job_position', position: { name: 'Contabil' } }),
          linked(welder, beta, {
            kind: 'job_position',
            position: { name: 'Sudor', archivedAt: stamp },
          }),
          linked(alfaVisitors, alfa, { kind: 'other', name: 'Vizitatori' }),
        ]),
    });
    const response = await request(`${profilePath}/usage`);
    expect(response.status).toBe(200);
    const { items } = evaluationProfileUsageResponseSchema.parse(await response.json());
    expect(
      items.map((item) => [
        item.clientName,
        item.clientArchivedAt,
        item.id,
        item.jobPosition?.name ?? item.name,
        item.linkedFactorCount,
      ])
    ).toEqual([
      ['Alfa SRL', stamp, alfaVisitors, 'Vizitatori', 1],
      ['Beta SRL', null, accountant, 'Contabil', 3],
      ['Beta SRL', null, sensitive, null, 1],
      ['Beta SRL', null, visitors, 'Vizitatori', 2],
    ]);
    expect(items[1]).toMatchObject({ clientId: beta.id, kind: 'job_position' });
    const [read] = calls('risk_factors', 'GET');
    const params = new URL(String(read![0])).searchParams;
    expect(params.get('evaluation_profile_factors.profile_id')).toBe(`eq.${profileId}`);
  });

  it('answers 404 for a profile outside the organization', async () => {
    mockUpstream({ profiles: () => Response.json([]) });
    expect((await request(`${profilePath}/usage`)).status).toBe(404);
    expect(calls('risk_factors', 'GET')).toHaveLength(0);
  });
});

describe('PATCH /evaluation-profiles/{profileId}', () => {
  it('renames the profile', async () => {
    mockUpstream();
    const response = await request(profilePath, 'PATCH', { name: 'Birou' });
    expect(response.status).toBe(200);
    expect(sent('evaluation_profiles', 'PATCH')).toEqual({ name: 'Birou' });
  });

  it('answers 409 on a name the library already holds', async () => {
    mockUpstream({ profiles: (init) => (init?.method === 'PATCH' ? nameConflict() : undefined) });
    const response = await request(profilePath, 'PATCH', { name: 'Șofer' });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'evaluation_profile_name_taken'
    );
  });

  it('answers 404 for a profile outside the organization', async () => {
    mockUpstream({
      profiles: (init) => (init?.method === 'PATCH' ? Response.json([]) : undefined),
    });
    expect((await request(profilePath, 'PATCH', { name: 'Birou' })).status).toBe(404);
  });
});

describe('DELETE /evaluation-profiles/{profileId}', () => {
  it('deletes the profile', async () => {
    mockUpstream();
    expect((await request(profilePath, 'DELETE')).status).toBe(204);
    expect(calls('evaluation_profiles', 'DELETE')).toHaveLength(1);
  });

  it('answers 404 for a profile outside the organization', async () => {
    mockUpstream({
      profiles: (init) => (init?.method === 'DELETE' ? Response.json([]) : undefined),
    });
    expect((await request(profilePath, 'DELETE')).status).toBe(404);
  });
});

describe('the factors of a profile', () => {
  it('adds a factor with the body of an evaluation factor', async () => {
    mockUpstream();
    const response = await request(`${profilePath}/factors`, 'POST', factorBody);
    expect(response.status).toBe(201);
    expect(sent('rpc/save_evaluation_profile_factor', 'POST')).toEqual({
      p_profile_id: profileId,
      p_component: 'means_of_production',
      p_factor_group: 'Factori de risc electric',
      p_description: 'Electrocutare prin atingere indirectă',
      p_gravity_class: 5,
      p_probability_class: 2,
      p_measures: [{ kind: 'technical', description: 'Buletine P.R.A.M.' }],
      p_deadline: 'Anual',
    });
  });

  it('answers 404 when the profile is not the caller’s', async () => {
    mockUpstream({ rpc: () => Response.json(null) });
    expect((await request(`${profilePath}/factors`, 'POST', factorBody)).status).toBe(404);
  });

  it('replaces a factor and its measures', async () => {
    mockUpstream();
    const response = await request(`${profilePath}/factors/${factorId}`, 'PUT', factorBody);
    expect(response.status).toBe(200);
    expect(sent('rpc/save_evaluation_profile_factor', 'POST')).toMatchObject({
      p_profile_id: profileId,
      p_factor_id: factorId,
    });
  });

  it('answers 404 for a factor that is not on the profile', async () => {
    mockUpstream({ rpc: () => Response.json(null) });
    expect((await request(`${profilePath}/factors/${factorId}`, 'PUT', factorBody)).status).toBe(
      404
    );
  });

  it('removes a factor', async () => {
    mockUpstream();
    const response = await request(`${profilePath}/factors/${factorId}`, 'DELETE');
    expect(response.status).toBe(200);
    const [deleted] = calls('evaluation_profile_factors', 'DELETE');
    const params = new URL(String(deleted![0])).searchParams;
    expect(params.get('id')).toBe(`eq.${factorId}`);
    expect(params.get('profile_id')).toBe(`eq.${profileId}`);
  });

  it('refuses a class the method does not have', async () => {
    mockUpstream();
    expect(
      (await request(`${profilePath}/factors`, 'POST', { ...factorBody, gravityClass: 8 })).status
    ).toBe(400);
  });
});

describe('POST …/risk-evaluations/{evaluationId}/save-as-profile', () => {
  it('saves the evaluation as a new profile of the library', async () => {
    mockUpstream();
    const response = await request(`${evaluationPath}/save-as-profile`, 'POST', {
      name: 'Lucrător de birou',
    });
    expect(response.status).toBe(201);
    expect(evaluationProfileResponseSchema.parse(await response.json()).profile.name).toBe(
      'Lucrător de birou'
    );
    expect(sent('rpc/save_risk_evaluation_as_profile', 'POST')).toEqual({
      p_evaluation_id: evaluationId,
      p_name: 'Lucrător de birou',
    });
  });

  it('answers 409 on a name the library already holds', async () => {
    mockUpstream({ rpc: () => nameConflict() });
    const response = await request(`${evaluationPath}/save-as-profile`, 'POST', {
      name: 'Lucrător de birou',
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'evaluation_profile_name_taken'
    );
  });

  it('answers 404 for an evaluation that is not under the client', async () => {
    mockUpstream({ evaluations: () => Response.json([]) });
    const response = await request(`${evaluationPath}/save-as-profile`, 'POST', {
      name: 'Lucrător de birou',
    });
    expect(response.status).toBe(404);
    expect(calls('rpc/save_risk_evaluation_as_profile', 'POST')).toHaveLength(0);
  });
});

describe('POST …/risk-evaluations/{evaluationId}/factors/apply-profile', () => {
  it('copies the profile into the evaluation and says how many factors it added', async () => {
    mockUpstream();
    const response = await request(`${evaluationPath}/factors/apply-profile`, 'POST', {
      profileId,
    });
    expect(response.status).toBe(200);
    const body = applyEvaluationProfileResponseSchema.parse(await response.json());
    expect(body.addedFactorCount).toBe(2);
    expect(body.evaluation.id).toBe(evaluationId);
    expect(sent('rpc/apply_evaluation_profile', 'POST')).toEqual({
      p_evaluation_id: evaluationId,
      p_profile_id: profileId,
    });
  });

  it('answers 400 on profileId for a profile outside the library', async () => {
    mockUpstream({
      rpc: () =>
        Response.json(
          { code: 'RSK02', message: 'Apply a profile of the organization.' },
          { status: 400 }
        ),
    });
    const response = await request(`${evaluationPath}/factors/apply-profile`, 'POST', {
      profileId: otherProfileId,
    });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues?.[0]?.path).toBe('profileId');
  });

  it('answers 409 for an evaluation of an archived client', async () => {
    mockUpstream({
      rpc: () =>
        Response.json({ code: 'CLA01', message: 'The client is archived.' }, { status: 400 }),
    });
    const response = await request(`${evaluationPath}/factors/apply-profile`, 'POST', {
      profileId,
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });
});
