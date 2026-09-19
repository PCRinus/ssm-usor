import { apiErrorResponseSchema, documentReadinessResponseSchema } from '@ssm-usor/contracts';
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
const membership = { user_id: user.id, organization_id: organizationId, role: 'owner' };
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const organizationRow = {
  legal_name: 'S.C. SAFETY S.R.L.',
  legal_representative_name: 'Maria POPESCU',
  legal_representative_role: 'Administrator',
};
const clientRow = {
  legal_name: 'S.C. PIPETECH S.R.L.',
  legal_representative_name: 'Florin TALOȘ',
  legal_representative_role: 'Administrator',
  periodic_training_hours: 2,
  administrative_training_interval_months: 6,
  worker_training_interval_months: 3,
  training_first_month: 2,
  training_day_from: 2,
  training_day_to: 7,
  archived_at: null,
};
const memberRow = {
  user_id: user.id,
  email: user.email,
  full_name: 'Maria POPESCU',
  professional_title: 'Evaluator de risc SSM',
  role: 'owner',
  joined_at: '2026-09-01T00:00:00+00:00',
};
const personRow = {
  full_name: 'Florin TALOȘ',
  job_title: 'Administrator',
  roles: ['workplace_manager', 'first_aid', 'risk_evaluation_team', 'imminent_danger'],
};

type Upstream = 'organizations' | 'clients' | 'members' | 'persons';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, () => Response>> = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json(user);
      case '/rest/v1/rpc/current_membership':
        return Response.json([membership]);
      case '/rest/v1/organizations':
        return handlers.organizations?.() ?? Response.json(organizationRow);
      case '/rest/v1/clients':
        return handlers.clients?.() ?? Response.json(clientRow);
      case '/rest/v1/rpc/organization_member_list':
        return handlers.members?.() ?? Response.json([memberRow]);
      case '/rest/v1/client_responsible_persons':
        return handlers.persons?.() ?? Response.json([personRow]);
      default:
        throw new Error(`Unexpected upstream request: ${url}`);
    }
  });
}

const request = (path: string) =>
  createApp().request(path, { headers: { Authorization: 'Bearer test-access-token' } }, env);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /clients/{clientId}/documents/readiness', () => {
  it('is ready when nothing is missing', async () => {
    mockUpstream();
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(response.status).toBe(200);
    expect(documentReadinessResponseSchema.parse(await response.json())).toEqual({
      ready: true,
      missing: [],
    });
    const persons = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .find((url) => url.pathname === '/rest/v1/client_responsible_persons')!;
    expect(persons.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    expect(persons.searchParams.get('archived_at')).toBe('is.null');
  });

  it('lists what is missing, from each place it is filled in', async () => {
    mockUpstream({
      organizations: () => Response.json({ ...organizationRow, legal_name: null }),
      clients: () => Response.json({ ...clientRow, training_first_month: null }),
      members: () => Response.json([{ ...memberRow, professional_title: null }]),
      persons: () => Response.json([{ ...personRow, roles: ['first_aid'] }]),
    });
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(documentReadinessResponseSchema.parse(await response.json())).toEqual({
      ready: false,
      missing: [
        'provider.legalName',
        'specialist.professionalTitle',
        'client.trainingSchedule',
        'responsible.workplace_manager',
        'responsible.risk_evaluation_team',
        'responsible.imminent_danger',
      ],
    });
  });

  it('answers 404 for a client of another organization', async () => {
    mockUpstream({ clients: () => Response.json(null) });
    const response = await request(`/clients/${clientId}/documents/readiness`);
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });
});
