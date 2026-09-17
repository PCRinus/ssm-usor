import { apiErrorResponseSchema, companyLookupResponseSchema } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { anafLookupUrl, normalizeDiacritics } from './anaf';
import { createApp } from './app';
import type { ApiEnv } from './env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
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

// Trimmed from a real ANAF v9 response.
const anafFound = {
  date_generale: {
    data: '2026-09-17',
    cui: 1590082,
    denumire: 'OMV PETROM SA',
    adresa: 'MUNICIPIUL BUCUREŞTI, SECTOR 1, STR. CORALILOR, NR.22, BL.PETROM CITY',
    stare_inregistrare: 'INREGISTRAT din data 23.10.1997',
    nrRegCom: 'J1997008302407',
    cod_CAEN: '610',
    iban: '',
  },
  inregistrare_scop_Tva: { scpTVA: true, perioade_TVA: [] },
  stare_inactiv: { dataInactivare: '', statusInactivi: false },
  adresa_sediu_social: {
    sdenumire_Localitate: 'Sector 1 Mun. Bucureşti',
    sdenumire_Strada: 'Str. Coralilor',
    snumar_Strada: '22',
    sdenumire_Judet: 'MUNICIPIUL BUCUREŞTI',
    scod_JudetAuto: 'B',
    sdetalii_Adresa: '(PETROM CITY)',
    scod_Postal: '13329',
  },
};

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(anaf: (init?: RequestInit) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json([{ user_id: user.id, organization_id: 'org', role: 'owner' }]);
    }
    if (String(input) === anafLookupUrl) return anaf(init);
    throw new Error(`Unexpected upstream request: ${url}`);
  });
}

const lookup = (cui: string) =>
  createApp().request(
    `/companies/lookup?cui=${encodeURIComponent(cui)}`,
    { headers: { Authorization: 'Bearer test-access-token' } },
    env
  );

const anafCalls = () => fetchMock.mock.calls.filter(([input]) => String(input) === anafLookupUrl);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /companies/lookup', () => {
  it('maps the ANAF record onto the client form fields', async () => {
    mockUpstream(() => Response.json({ found: [anafFound], notFound: [] }));
    const response = await lookup('RO1590082');
    expect(response.status).toBe(200);
    expect(companyLookupResponseSchema.parse(await response.json())).toEqual({
      company: {
        cui: '1590082',
        legalName: 'OMV PETROM SA',
        vatPayer: true,
        caenCode: '0610',
        tradeRegisterNumber: 'J1997008302407',
        countyCode: 'B',
        locality: 'Sector 1 Mun. București',
        addressLine: 'Str. Coralilor, nr. 22, (PETROM CITY)',
        registrationStatus: 'INREGISTRAT din data 23.10.1997',
        inactive: false,
      },
    });
    const [, init] = anafCalls()[0]!;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual([
      { cui: 1590082, data: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    ]);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('tolerates missing optional blocks', async () => {
    mockUpstream(() =>
      Response.json({
        found: [
          {
            date_generale: { cui: 1590082, denumire: 'FIRMA', nrRegCom: '', cod_CAEN: '' },
          },
        ],
        notFound: [],
      })
    );
    const response = await lookup('1590082');
    expect(response.status).toBe(200);
    expect(companyLookupResponseSchema.parse(await response.json()).company).toMatchObject({
      legalName: 'FIRMA',
      vatPayer: false,
      caenCode: null,
      tradeRegisterNumber: null,
      countyCode: null,
      locality: null,
      addressLine: null,
      inactive: false,
    });
  });

  it('returns not found when ANAF has no record', async () => {
    mockUpstream(() => Response.json({ found: [], notFound: [1590082] }));
    const response = await lookup('1590082');
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('not_found');
  });

  it('rejects an invalid CUI without calling ANAF', async () => {
    mockUpstream(() => Response.json({ found: [], notFound: [] }));
    const response = await lookup('1590083');
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).error).toBe('validation_error');
    expect(anafCalls()).toHaveLength(0);
  });

  it.each([
    ['HTTP failure', () => new Response('Service Unavailable', { status: 503 })],
    ['non-JSON body', () => new Response('<html>rate limited</html>', { status: 200 })],
    ['unexpected shape', () => Response.json({ unexpected: true })],
    [
      'network error',
      () => {
        throw new TypeError('Sensitive connection details');
      },
    ],
  ])('reports ANAF unavailability (%s) without details', async (_, anaf) => {
    mockUpstream(anaf);
    const response = await lookup('1590082');
    expect(response.status).toBe(503);
    const body = apiErrorResponseSchema.parse(await response.json());
    expect(body.error).toBe('service_unavailable');
    expect(JSON.stringify(body)).not.toContain('Sensitive');
  });

  it('requires authentication', async () => {
    mockUpstream(() => Response.json({ found: [anafFound], notFound: [] }));
    const response = await createApp().request('/companies/lookup?cui=1590082', {}, env);
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it('normalizes cedilla diacritics to comma-below forms', () => {
  expect(normalizeDiacritics('Bucureşti Ţara Şoseaua ţ')).toBe('București Țara Șoseaua ț');
});
