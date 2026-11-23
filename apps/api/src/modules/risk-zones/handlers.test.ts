import {
  apiErrorResponseSchema,
  riskZoneNamesResponseSchema,
  riskZonesResponseSchema,
} from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { apiRequest } from '../../test/request';
import {
  callsTo,
  databaseError,
  mockUpstream,
  stubFetch,
  testEnv,
  type UpstreamRoutes,
} from '../../test/upstream';

const env = testEnv();

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const zoneId = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
const otherZoneId = '4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a';
const workplaceId = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const stamp = '2026-11-23T10:00:00+00:00';
const later = '2026-11-23T11:00:00+00:00';

const factor = (
  n: number,
  gravity: number,
  probability: number,
  extra: Partial<{ sort_order: number; description: string; prevention_measures: unknown[] }> = {}
) => ({
  id: id(n),
  component: 'means_of_production',
  factor_group: 'Factori de risc electric',
  description: `Factor ${n}`,
  gravity_class: gravity,
  probability_class: probability,
  sort_order: n,
  prevention_measures: [],
  ...extra,
});

const position = (name: string, workZone: string | null, archived = false) => ({
  id: id(900 + name.length),
  name,
  work_zone: workZone,
  archived_at: archived ? stamp : null,
});

const evaluations = [
  {
    id: id(101),
    kind: 'job_position',
    name: null,
    job_positions: position('Electrician', 'Atelier'),
    risk_factors: [
      factor(1, 5, 2, {
        prevention_measures: [
          { id: id(501), kind: 'organizational', description: 'Instruire', sort_order: 0 },
          { id: id(502), kind: 'technical', description: 'Împământare', sort_order: 2 },
          { id: id(503), kind: 'technical', description: 'Carcasă', sort_order: 1 },
        ],
      }),
      factor(2, 6, 4),
      factor(3, 3, 3),
    ],
  },
  {
    id: id(102),
    kind: 'job_position',
    name: null,
    job_positions: position('Lăcătuș', ' atelier '),
    risk_factors: [factor(4, 4, 5)],
  },
  {
    id: id(103),
    kind: 'job_position',
    name: null,
    job_positions: position('Contabil', null),
    risk_factors: [factor(5, 4, 5)],
  },
  {
    id: id(104),
    kind: 'job_position',
    name: null,
    job_positions: position('Sudor vechi', 'Hală', true),
    risk_factors: [factor(6, 6, 4), factor(10, 6, 4)],
  },
  {
    id: id(105),
    kind: 'other',
    name: 'Vizitatori',
    job_positions: null,
    risk_factors: [factor(7, 5, 2)],
  },
  {
    id: id(106),
    kind: 'sensitive_groups',
    name: null,
    job_positions: null,
    risk_factors: [factor(8, 4, 5), factor(9, 2, 2)],
  },
];

const zones = [
  {
    id: otherZoneId,
    client_id: clientId,
    name: 'Contabil',
    location: null,
    measures: 'Acces restricționat',
    created_at: later,
    updated_at: later,
    client_workplaces: null,
    risk_zone_factors: [],
  },
  {
    id: zoneId,
    client_id: clientId,
    name: 'Tablou electric',
    location: 'parter',
    measures: null,
    created_at: stamp,
    updated_at: stamp,
    client_workplaces: { id: workplaceId, name: 'Sediu' },
    risk_zone_factors: [{ factor_id: id(1) }, { factor_id: id(2) }, { factor_id: id(10) }],
  },
];

const clientRow = {
  id: clientId,
  stage: 'client',
  archived_at: null,
  risk_zones_state: 'listed',
};

function mock(overrides: UpstreamRoutes = {}) {
  mockUpstream(overrides, {
    '/rest/v1/clients': () => [clientRow],
    '/rest/v1/risk_evaluations': () => evaluations,
    'GET /rest/v1/risk_zones': () => zones,
    'DELETE /rest/v1/risk_zones': () => [{ id: zoneId }],
    '/rest/v1/rpc/save_risk_zone': () => zoneId,
    '/rest/v1/rpc/risk_zone_names': () => [],
    'GET /rest/v1/risk_zone_ignored_factors': () => [],
    'POST /rest/v1/risk_zone_ignored_factors': () => [],
    'DELETE /rest/v1/risk_zone_ignored_factors': () => [],
  });
}

const request = (path: string, method = 'GET', body?: unknown) =>
  apiRequest(path, { method, body }, env);

const base = `/clients/${clientId}/risk-zones`;

const zoneBody = {
  name: '  Tablou electric  ',
  workplaceId,
  location: 'parter',
  measures: null,
  factorIds: [id(1), id(2)],
};

stubFetch();

describe('GET /clients/{clientId}/risk-zones', () => {
  it('reads the zones in the order they were added, with their factors as the evaluations hold them', async () => {
    mock();
    const response = await request(base);
    expect(response.status).toBe(200);
    const body = riskZonesResponseSchema.parse(await response.json());
    expect(body.state).toBe('listed');
    expect(body.zones.map((zone) => zone.name)).toEqual(['Tablou electric', 'Contabil']);
    const [panel] = body.zones;
    expect(panel!.workplace).toEqual({ id: workplaceId, name: 'Sediu' });
    expect(panel!.factors.map((f) => [f.id, f.riskLevel, f.evaluation.title])).toEqual([
      [id(2), 6, 'Electrician'],
      [id(10), 6, 'Sudor vechi'],
      [id(1), 4, 'Electrician'],
    ]);
    expect(panel!.factors[2]!.measures.map((m) => m.description)).toEqual([
      'Carcasă',
      'Împământare',
      'Instruire',
    ]);
    expect(panel!.factors[2]!.evaluation).toEqual({
      id: id(101),
      kind: 'job_position',
      title: 'Electrician',
      jobPositionId: position('Electrician', null).id,
    });
  });

  it('suggests the unacceptable factors no zone links, grouped by work zone, post or evaluation', async () => {
    mock();
    const { suggestions } = riskZonesResponseSchema.parse(await (await request(base)).json());
    expect(
      suggestions.map((s) => [s.name, s.origin, s.factors.map((f) => f.id), s.existingZoneId])
    ).toEqual([
      ['atelier', 'work_zone', [id(4)], null],
      ['Contabil', 'evaluation', [id(5)], otherZoneId],
      ['Grupuri sensibile la riscuri specifice', 'evaluation', [id(8)], null],
      ['Vizitatori', 'evaluation', [id(7)], null],
    ]);
    expect(suggestions[2]!.factors[0]!.evaluation).toEqual({
      id: id(106),
      kind: 'sensitive_groups',
      title: 'Grupuri sensibile la riscuri specifice',
      jobPositionId: null,
    });
  });

  it('sets the ignored factors apart, grouped the same way, and suggests a new factor on its own', async () => {
    mock({
      'GET /rest/v1/risk_zones': () => [],
      'GET /rest/v1/risk_zone_ignored_factors': () => [
        { factor_id: id(1) },
        { factor_id: id(4) },
        { factor_id: id(7) },
        { factor_id: id(3) },
      ],
    });
    const body = riskZonesResponseSchema.parse(await (await request(base)).json());
    expect(body.suggestions.map((s) => [s.name, s.factors.map((f) => f.id)])).toEqual([
      ['Atelier', [id(2)]],
      ['Contabil', [id(5)]],
      ['Grupuri sensibile la riscuri specifice', [id(8)]],
    ]);
    expect(
      body.ignoredSuggestions.map((s) => [s.name, s.origin, s.factors.map((f) => f.id)])
    ).toEqual([
      ['Atelier', 'work_zone', [id(4), id(1)]],
      ['Vizitatori', 'evaluation', [id(7)]],
    ]);
  });

  it('leaves out of the ignored ones a factor a zone links since', async () => {
    mock({ 'GET /rest/v1/risk_zone_ignored_factors': () => [{ factor_id: id(2) }] });
    const body = riskZonesResponseSchema.parse(await (await request(base)).json());
    expect(body.ignoredSuggestions).toEqual([]);
  });

  it('names a suggestion after the post when its work zone is too short to be a zone name', async () => {
    mock({
      '/rest/v1/risk_evaluations': () => [
        {
          id: id(107),
          kind: 'job_position',
          name: null,
          job_positions: position('Casier', ' B '),
          risk_factors: [factor(11, 4, 5)],
        },
      ],
    });
    const { suggestions } = riskZonesResponseSchema.parse(await (await request(base)).json());
    expect(suggestions.map((s) => s.name)).toEqual(['Casier']);
  });

  it('offers every factor of current posts and evaluations to link, acceptable ones too', async () => {
    mock();
    const { factors } = riskZonesResponseSchema.parse(await (await request(base)).json());
    expect(factors.map((f) => f.id)).toEqual([5, 1, 2, 3, 4, 8, 9, 7].map(id));
  });

  it('answers 404 for a client outside the organization', async () => {
    mock({ '/rest/v1/clients': () => [] });
    expect((await request(base)).status).toBe(404);
  });
});

describe('POST /clients/{clientId}/risk-zones', () => {
  it('adds a zone with its linked factors and answers with all of them', async () => {
    mock();
    const response = await request(base, 'POST', zoneBody);
    expect(response.status).toBe(201);
    expect(riskZonesResponseSchema.parse(await response.json()).zones).toHaveLength(2);
    expect(callsTo('/rest/v1/rpc/save_risk_zone', 'POST')[0]!.body).toEqual({
      p_client_id: clientId,
      p_name: 'Tablou electric',
      p_factor_ids: [id(1), id(2)],
      p_workplace_id: workplaceId,
      p_location: 'parter',
    });
  });

  it('takes a zone of measures only', async () => {
    mock();
    const response = await request(base, 'POST', { name: 'Acoperiș', measures: 'Centură' });
    expect(response.status).toBe(201);
    expect(callsTo('/rest/v1/rpc/save_risk_zone', 'POST')[0]!.body).toEqual({
      p_client_id: clientId,
      p_name: 'Acoperiș',
      p_factor_ids: [],
      p_measures: 'Centură',
    });
  });

  it('refuses a zone with neither a linked factor nor measures of its own', async () => {
    mock();
    const response = await request(base, 'POST', { name: 'Acoperiș', measures: null });
    expect(response.status).toBe(400);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.issues?.map((issue) => issue.path)).toContain('measures');
    expect(callsTo('/rest/v1/rpc/save_risk_zone')).toHaveLength(0);
  });

  it.each([
    ['RZN02', 'measures'],
    ['RZN03', 'workplaceId'],
    ['RZN04', 'factorIds'],
  ])('answers the database’s %s as 400 on %s', async (code, path) => {
    mock({ '/rest/v1/rpc/save_risk_zone': () => databaseError(code, 'refused') });
    const response = await request(base, 'POST', zoneBody);
    expect(response.status).toBe(400);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.issues).toEqual([expect.objectContaining({ path })]);
  });

  it('refuses a name the client has already', async () => {
    mock({
      '/rest/v1/rpc/save_risk_zone': () =>
        databaseError(
          '23505',
          'duplicate key value violates unique constraint "risk_zones_name_key"'
        ),
    });
    const response = await request(base, 'POST', zoneBody);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('risk_zone_name_taken');
  });

  it('refuses an archived client and a lead before writing', async () => {
    mock({ '/rest/v1/clients': () => [{ ...clientRow, archived_at: stamp }] });
    const archived = await request(base, 'POST', zoneBody);
    expect(archived.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await archived.json()).reason).toBe('client_archived');
    mock({ '/rest/v1/clients': () => [{ ...clientRow, stage: 'lead' }] });
    const lead = await request(base, 'POST', zoneBody);
    expect(lead.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await lead.json()).reason).toBe('client_is_lead');
    expect(callsTo('/rest/v1/rpc/save_risk_zone')).toHaveLength(0);
  });
});

describe('PUT /clients/{clientId}/risk-zones/{zoneId}', () => {
  it('replaces the zone and its linked factors', async () => {
    mock();
    const response = await request(`${base}/${zoneId}`, 'PUT', { ...zoneBody, workplaceId: null });
    expect(response.status).toBe(200);
    expect(callsTo('/rest/v1/rpc/save_risk_zone', 'POST')[0]!.body).toEqual({
      p_client_id: clientId,
      p_zone_id: zoneId,
      p_name: 'Tablou electric',
      p_factor_ids: [id(1), id(2)],
      p_location: 'parter',
    });
  });

  it('answers 404 for a zone outside the client', async () => {
    mock({ '/rest/v1/rpc/save_risk_zone': () => null });
    expect((await request(`${base}/${zoneId}`, 'PUT', zoneBody)).status).toBe(404);
  });
});

describe('DELETE /clients/{clientId}/risk-zones/{zoneId}', () => {
  it('deletes the zone and answers with those left', async () => {
    mock();
    const response = await request(`${base}/${zoneId}`, 'DELETE');
    expect(response.status).toBe(200);
    riskZonesResponseSchema.parse(await response.json());
    const [deletion] = callsTo('/rest/v1/risk_zones', 'DELETE');
    expect(deletion!.url.searchParams.get('id')).toBe(`eq.${zoneId}`);
    expect(deletion!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('answers 404 for a zone outside the client, and 409 under an archived client', async () => {
    mock({ 'DELETE /rest/v1/risk_zones': () => [] });
    expect((await request(`${base}/${zoneId}`, 'DELETE')).status).toBe(404);
    mock({
      'DELETE /rest/v1/risk_zones': () =>
        databaseError('CLA01', 'An archived client is not changed.'),
    });
    const archived = await request(`${base}/${zoneId}`, 'DELETE');
    expect(archived.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await archived.json()).reason).toBe('client_archived');
  });
});

describe('PUT /clients/{clientId}/risk-zones-state', () => {
  const statePath = `/clients/${clientId}/risk-zones-state`;

  it('records that the client has no such zones', async () => {
    mock({
      'PATCH /rest/v1/clients': () => ({ id: clientId }),
      '/rest/v1/clients': () => [{ ...clientRow, risk_zones_state: 'none' }],
      'GET /rest/v1/risk_zones': () => [],
    });
    const response = await request(statePath, 'PUT', { state: 'none' });
    expect(response.status).toBe(200);
    expect(riskZonesResponseSchema.parse(await response.json()).state).toBe('none');
    const [update] = callsTo('/rest/v1/clients', 'PATCH');
    expect(update!.body).toEqual({ risk_zones_state: 'none' });
    expect(update!.url.searchParams.get('archived_at')).toBe('is.null');
  });

  it('never takes listed, which follows the zones', async () => {
    mock();
    expect((await request(statePath, 'PUT', { state: 'listed' })).status).toBe(400);
    expect(callsTo('/rest/v1/clients', 'PATCH')).toHaveLength(0);
  });

  it('refuses a declaration while the client has zones', async () => {
    mock({ 'PATCH /rest/v1/clients': () => databaseError('RZN01', 'refused') });
    const response = await request(statePath, 'PUT', { state: 'none' });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('risk_zones_listed');
  });

  it('answers 409 for an archived client', async () => {
    mock({ 'PATCH /rest/v1/clients': () => null });
    const response = await request(statePath, 'PUT', { state: 'none' });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });
});

describe('GET /risk-zone-names', () => {
  it('lists the names used before, leaving out one client on request', async () => {
    mock({
      '/rest/v1/rpc/risk_zone_names': () => [
        { name: 'Depozit', measures: 'Acces restricționat' },
        { name: 'Tablou electric', measures: null },
      ],
    });
    const response = await request(`/risk-zone-names?exceptClientId=${clientId}`);
    expect(response.status).toBe(200);
    expect(riskZoneNamesResponseSchema.parse(await response.json()).items).toEqual([
      { name: 'Depozit', measures: 'Acces restricționat' },
      { name: 'Tablou electric', measures: null },
    ]);
    const [call] = callsTo('/rest/v1/rpc/risk_zone_names');
    expect(call!.body ?? Object.fromEntries(call!.url.searchParams)).toEqual({
      p_except_client_id: clientId,
    });
  });
});

describe('POST /clients/{clientId}/risk-zone-suggestions/ignore', () => {
  const ignorePath = `/clients/${clientId}/risk-zone-suggestions/ignore`;

  it('keeps each factor out of the suggestions, once', async () => {
    mock();
    const response = await request(ignorePath, 'POST', { factorIds: [id(4), id(4), id(5)] });
    expect(response.status).toBe(200);
    riskZonesResponseSchema.parse(await response.json());
    const [insert] = callsTo('/rest/v1/risk_zone_ignored_factors', 'POST');
    expect(insert!.body).toEqual([
      expect.objectContaining({ factor_id: id(4), client_id: clientId }),
      expect.objectContaining({ factor_id: id(5), client_id: clientId }),
    ]);
    expect(insert!.url.searchParams.get('on_conflict')).toBe('factor_id');
  });

  it('refuses a factor of another client', async () => {
    mock({
      'POST /rest/v1/risk_zone_ignored_factors': () =>
        databaseError('23503', 'violates foreign key constraint'),
    });
    const response = await request(ignorePath, 'POST', { factorIds: [id(4)] });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).issues).toEqual([
      expect.objectContaining({ path: 'factorIds' }),
    ]);
  });

  it('takes at least one factor', async () => {
    mock();
    expect((await request(ignorePath, 'POST', { factorIds: [] })).status).toBe(400);
  });

  it('refuses an archived client before writing', async () => {
    mock({ '/rest/v1/clients': () => [{ ...clientRow, archived_at: stamp }] });
    const response = await request(ignorePath, 'POST', { factorIds: [id(4)] });
    expect(response.status).toBe(409);
    expect(callsTo('/rest/v1/risk_zone_ignored_factors', 'POST')).toHaveLength(0);
  });
});

describe('POST /clients/{clientId}/risk-zone-suggestions/restore', () => {
  const restorePath = `/clients/${clientId}/risk-zone-suggestions/restore`;

  it('returns the factors to the suggestions', async () => {
    mock();
    const response = await request(restorePath, 'POST', { factorIds: [id(4), id(1)] });
    expect(response.status).toBe(200);
    riskZonesResponseSchema.parse(await response.json());
    const [deletion] = callsTo('/rest/v1/risk_zone_ignored_factors', 'DELETE');
    expect(deletion!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(deletion!.url.searchParams.get('factor_id')).toBe(`in.(${id(4)},${id(1)})`);
  });

  it('answers 409 under an archived client', async () => {
    mock({
      'DELETE /rest/v1/risk_zone_ignored_factors': () =>
        databaseError('CLA01', 'An archived client is not changed.'),
    });
    const response = await request(restorePath, 'POST', { factorIds: [id(4)] });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('client_archived');
  });
});
