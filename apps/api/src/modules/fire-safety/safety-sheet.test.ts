import {
  apiErrorResponseSchema,
  readSafetySheetResponseSchema,
  safetySheetLimits,
} from '@ssm-usor/contracts';
import type { SafetySheetAnswer } from '@ssm-usor/import';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

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
const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const secretKey = 'sb_secret_test_key_safety_sheet';
const gateway = 'https://gateway.example/v1/account/ssm-usor';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: secretKey,
  CORS_ORIGINS: 'http://localhost:5173',
  EXTRACTOR_URL: 'http://localhost:3302',
  AI_GATEWAY_URL: gateway,
  AI_GATEWAY_TOKEN: 'gateway-token',
};

const sectionTitles = [
  'Identificarea produsului: Lac Lucios L-7, furnizor Vopsele Pădurea Verde SRL',
  'Identificarea pericolelor: Flam. Liq. 3, H226',
  'Compoziție: Xilen CAS 1330-20-7 CE 215-535-7',
  'Prim ajutor',
  'Stingerea incendiilor: pulbere, spumă',
  'Dispersie accidentală',
  'Manipulare și depozitare',
  'Protecția personală',
  'Proprietăți fizice și chimice: punct de inflamabilitate 27 °C',
  'Stabilitate',
  'Informații toxicologice',
  'Informații ecologice',
  'Eliminare',
  'Transport: UN 1263',
  'Reglementare',
  'Alte informații',
];
const sheetPage = sectionTitles
  .map((title, index) => `SECȚIUNEA ${index + 1}: ${title}`)
  .join('\n');

const pdfBytes = new TextEncoder().encode('%PDF-1.7\n% an invented sheet\n');

const answer = (overrides: Partial<SafetySheetAnswer> = {}): SafetySheetAnswer => ({
  isSafetyDataSheet: true,
  productName: 'Lac Lucios L-7',
  notClassified: false,
  hazards: [{ hazardClass: 'Flam. Liq. 3', statements: ['H226'] }],
  components: [{ name: 'Xilen', cas: '1330-20-7', ec: '215-535-7' }],
  unNumber: '1263',
  physicalChemicalProperties: 'Lichid; punct de inflamabilitate 27 °C.',
  healthEnvironmentRisks: '',
  protectionMeans: '',
  interventionMeasures: '',
  extinguishingAgents: 'Pulbere, spumă.',
  handling: '',
  ...overrides,
});

type Call = { method: string; url: URL; body: unknown; headers: Headers };
type Handler = (call: Call) => Response | undefined;

const fetchMock = vi.fn<typeof fetch>();
let calls: Call[] = [];

const page = (text: string, number = 1) => ({ number, text, isScan: text.trim().length < 100 });

function mockUpstream(
  options: {
    client?: Record<string, unknown> | null;
    pages?: { number: number; text: string; isScan: boolean }[];
    model?: () => Response;
    charge?: Record<string, unknown>;
    custom?: Handler;
  } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const raw = init?.body;
    const call: Call = {
      method: init?.method ?? 'GET',
      url,
      body: typeof raw === 'string' && /^[[{]/.test(raw) ? JSON.parse(raw) : raw,
      headers: new Headers(init?.headers),
    };
    calls.push(call);
    const custom = options.custom?.(call);
    if (custom) return custom;
    switch (url.pathname) {
      case '/auth/v1/user':
        return Response.json(user);
      case '/rest/v1/rpc/current_membership':
        return Response.json([
          { user_id: user.id, organization_id: organizationId, role: 'specialist', access: 'full' },
        ]);
      case '/rest/v1/clients':
        return Response.json(
          options.client === null
            ? []
            : [{ id: clientId, archived_at: null, stage: 'client', ...options.client }]
        );
      case '/rest/v1/subscriptions':
        return Response.json([]);
      case '/rest/v1/rpc/charge_credits':
        return Response.json(
          options.charge ?? { charged: 3, refused: false, balance: null, gift_left: 0 }
        );
      case '/rest/v1/rpc/refund_safety_sheet_credits':
        return Response.json(3);
      case '/pdf-text': {
        const pages = options.pages ?? [page(sheetPage)];
        return Response.json({ pageCount: pages.length, pages });
      }
      case '/v1/account/ssm-usor/openai/chat/completions':
        return (
          options.model?.() ??
          Response.json({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer()) } }],
            usage: { prompt_tokens: 4000, completion_tokens: 900 },
          })
        );
    }
    throw new Error(`Unexpected upstream request: ${call.method} ${url}`);
  });
}

const read = (body: BodyInit = pdfBytes, headers: Record<string, string> = {}) =>
  createApp().request(
    `/clients/${clientId}/fire-substances/read-safety-sheet`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-token',
        'Content-Type': 'application/octet-stream',
        ...headers,
      },
      body,
    },
    env
  );

const callsTo = (pathname: string) => calls.filter((call) => call.url.pathname === pathname);
const charges = () => callsTo('/rest/v1/rpc/charge_credits');
const refunds = () => callsTo('/rest/v1/rpc/refund_safety_sheet_credits');

async function refusal(response: Response) {
  return apiErrorResponseSchema.parse(await response.json());
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  calls = [];
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /clients/{clientId}/fire-substances/read-safety-sheet', () => {
  it('answers the draft, charges the reading and writes nothing', async () => {
    mockUpstream();

    const response = await read();

    expect(response.status).toBe(200);
    const body = readSafetySheetResponseSchema.parse(await response.json());
    expect(body).toEqual({
      draft: {
        name: 'Lac Lucios L-7',
        classification: 'Flam. Liq. 3, H226',
        identificationCodes: 'CAS 1330-20-7, CE 215-535-7; UN 1263',
        physicalChemicalProperties: 'Lichid; punct de inflamabilitate 27 °C.',
        healthEnvironmentRisks: null,
        protectionMeans: null,
        interventionMeasures: null,
        extinguishingAgents: 'Pulbere, spumă.',
        handling: null,
      },
      droppedCodes: 0,
      credits: 3,
    });
    expect(charges()).toHaveLength(1);
    expect(charges()[0]!.body).toMatchObject({
      p_organization_id: organizationId,
      p_kind: 'safety_sheet',
      p_credits: 3,
      p_import_id: null,
      p_require: true,
    });
    expect(charges()[0]!.headers.get('Authorization')).toBe(`Bearer ${secretKey}`);
    expect(refunds()).toHaveLength(0);
    expect(calls.some((call) => call.url.pathname.startsWith('/rest/v1/fire_substances'))).toBe(
      false
    );
    expect(calls.some((call) => call.url.pathname.startsWith('/storage/'))).toBe(false);
    const [modelCall] = callsTo('/v1/account/ssm-usor/openai/chat/completions');
    expect(JSON.parse(modelCall!.headers.get('cf-aig-metadata')!)).toEqual({
      organizationId,
      reading: 'safety_sheet',
      clientId,
    });
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('"input":4000');
  });

  it('leaves out and counts a code the file does not hold', async () => {
    mockUpstream({
      model: () =>
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify(
                  answer({
                    hazards: [{ hazardClass: 'Flam. Liq. 3', statements: ['H226', 'H304'] }],
                    unNumber: '1866',
                  })
                ),
              },
            },
          ],
          usage: { prompt_tokens: 4000, completion_tokens: 900 },
        }),
    });

    const body = readSafetySheetResponseSchema.parse(await (await read()).json());

    expect(body.droppedCodes).toBe(2);
    expect(body.draft.classification).toBe('Flam. Liq. 3, H226');
    expect(body.draft.identificationCodes).toBe('CAS 1330-20-7, CE 215-535-7');
  });

  it('refuses a file that is not a PDF before charging', async () => {
    mockUpstream();

    const response = await read(new TextEncoder().encode('PK\u0003\u0004 a Word file'));

    expect(response.status).toBe(422);
    const body = await refusal(response);
    expect(body.reason).toBe('safety_sheet_not_pdf');
    expect(body).not.toHaveProperty('creditsRefunded');
    expect(charges()).toHaveLength(0);
  });

  it('refuses a file over the size limit before reading it', async () => {
    mockUpstream();

    const response = await read(pdfBytes, {
      'Content-Length': String(safetySheetLimits.maxBytes + 1),
    });

    expect(response.status).toBe(422);
    expect((await refusal(response)).reason).toBe('safety_sheet_too_large');
    expect(charges()).toHaveLength(0);
  });

  it('refuses a scanned sheet and gives its credits back', async () => {
    mockUpstream({ pages: [page('', 1), page('', 2), page(sheetPage, 3)] });

    const response = await read();

    expect(response.status).toBe(422);
    const body = await refusal(response);
    expect(body).toMatchObject({ reason: 'safety_sheet_scanned', creditsRefunded: true });
    expect(callsTo('/v1/account/ssm-usor/openai/chat/completions')).toHaveLength(0);
    expect(refunds()).toHaveLength(1);
    const { p_key: key } = charges()[0]!.body as { p_key: string };
    expect(key).toMatch(/^sheet:/);
    expect(refunds()[0]!.body).toEqual({ p_key: key });
  });

  it('refuses a sheet of more than 40 pages and gives its credits back', async () => {
    mockUpstream({
      pages: Array.from({ length: 41 }, (_, index) => page(sheetPage, index + 1)),
    });

    const response = await read();

    expect(response.status).toBe(422);
    expect((await refusal(response)).reason).toBe('safety_sheet_too_many_pages');
    expect(refunds()).toHaveLength(1);
  });

  it('refuses a file without the sections of a sheet without asking the model', async () => {
    mockUpstream({ pages: [page('FIȘĂ TEHNICĂ\nLac Lucios L-7\n'.repeat(10))] });

    const response = await read();

    expect(response.status).toBe(422);
    expect((await refusal(response)).reason).toBe('safety_sheet_not_a_sheet');
    expect(callsTo('/v1/account/ssm-usor/openai/chat/completions')).toHaveLength(0);
    expect(refunds()).toHaveLength(1);
  });

  it('refuses a file the model says is no sheet and gives its credits back', async () => {
    mockUpstream({
      model: () =>
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(answer({ isSafetyDataSheet: false })) },
            },
          ],
          usage: { prompt_tokens: 4000, completion_tokens: 50 },
        }),
    });

    const response = await read();

    expect(response.status).toBe(422);
    expect((await refusal(response)).reason).toBe('safety_sheet_not_a_sheet');
    expect(refunds()).toHaveLength(1);
  });

  it('gives the credits back when the gateway fails', async () => {
    mockUpstream({ model: () => new Response('bad request', { status: 400 }) });

    const response = await read();

    expect(response.status).toBe(503);
    expect((await refusal(response)).reason).toBe('safety_sheet_failed');
    expect(refunds()).toHaveLength(1);
  });

  it('refuses a reading the credits left do not cover', async () => {
    mockUpstream({ charge: { charged: 0, refused: true, balance: 2, gift_left: 0 } });

    const response = await read();

    expect(response.status).toBe(409);
    const body = await refusal(response);
    expect(body.reason).toBe('credits_insufficient');
    expect(body.credits).toMatchObject({ needed: 3, left: 2 });
    expect(callsTo('/pdf-text')).toHaveLength(0);
    expect(refunds()).toHaveLength(0);
  });

  it.each([
    [{ archived_at: '2026-11-01T10:00:00+00:00' }, 'client_archived'],
    [{ stage: 'lead' }, 'client_is_lead'],
  ])('refuses a client that cannot hold substances (%o)', async (client, reason) => {
    mockUpstream({ client });

    const response = await read();

    expect(response.status).toBe(409);
    expect((await refusal(response)).reason).toBe(reason);
    expect(charges()).toHaveLength(0);
  });

  it('answers 404 for a client outside the organization', async () => {
    mockUpstream({ client: null });

    const response = await read();

    expect(response.status).toBe(404);
    expect(charges()).toHaveLength(0);
  });

  it('answers 503 where the gateway is not configured', async () => {
    mockUpstream();

    const response = await createApp().request(
      `/clients/${clientId}/fire-substances/read-safety-sheet`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/octet-stream' },
        body: pdfBytes,
      },
      { ...env, AI_GATEWAY_TOKEN: undefined }
    );

    expect(response.status).toBe(503);
    const body = await refusal(response);
    expect(body.reason).toBe('safety_sheet_unavailable');
    expect(body).not.toHaveProperty('creditsRefunded');
  });

  it('says the credits were given back when a reading fails after its charge', async () => {
    mockUpstream({ model: () => new Response('bad request', { status: 400 }) });

    const body = await refusal(await read());

    expect(body).toMatchObject({ reason: 'safety_sheet_failed', creditsRefunded: true });
  });

  it('does not say the credits came back when giving them back failed', async () => {
    mockUpstream({
      pages: [page('', 1), page('', 2)],
      custom: (call) =>
        call.url.pathname === '/rest/v1/rpc/refund_safety_sheet_credits'
          ? Response.json({ code: 'XX000', message: 'down' }, { status: 500 })
          : undefined,
    });

    const body = await refusal(await read());

    expect(body).toMatchObject({ reason: 'safety_sheet_scanned', creditsRefunded: false });
  });

  it('refuses an oversized length before anything else, even where reading is not configured', async () => {
    mockUpstream();

    const response = await createApp().request(
      `/clients/${clientId}/fire-substances/read-safety-sheet`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer user-token',
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(safetySheetLimits.maxBytes + 1),
        },
        body: pdfBytes,
      },
      { ...env, AI_GATEWAY_TOKEN: undefined }
    );

    expect((await refusal(response)).reason).toBe('safety_sheet_too_large');
  });

  it('stops reading a body without a length once it passes the limit', async () => {
    mockUpstream();
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(pdfBytes);
    let sent = 0;
    // Past the limit it never ends: a route that buffered the whole body would wait forever.
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > safetySheetLimits.maxBytes) return new Promise<void>(() => undefined);
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });

    const response = await createApp().request(
      `/clients/${clientId}/fire-substances/read-safety-sheet`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/octet-stream' },
        body,
        duplex: 'half',
      } as RequestInit,
      env
    );

    expect((await refusal(response)).reason).toBe('safety_sheet_too_large');
    expect(charges()).toHaveLength(0);
  });
});
