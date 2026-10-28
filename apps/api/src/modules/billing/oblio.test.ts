import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/errors';
import {
  createOblioClient,
  loginRefusedMessage,
  type OblioProformaPayload,
  type OblioSessions,
} from './oblio';

const config = { clientId: 'facturi@example.ro', clientSecret: 'secret-123' };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const tokenResponse = (token: string) =>
  json(200, { access_token: token, expires_in: '3600', token_type: 'Bearer' });

const companiesResponse = (companies = [{ cif: 'RO123456', company: 'Casapu PFA' }]) =>
  json(200, { status: 200, statusMessage: 'Success', data: companies });

const documentResponse = (number = '0001') =>
  json(200, {
    status: 200,
    statusMessage: 'Success',
    data: {
      seriesName: 'SSMUSOR',
      number,
      link: `https://www.oblio.eu/utils/show_file/?id=${number}`,
    },
  });

const proforma: OblioProformaPayload = {
  client: { name: 'Test', vatPayer: 0, save: 0, autocomplete: 0 },
  seriesName: 'TEST',
  language: 'RO',
  currency: 'EUR',
  products: [],
  sendEmail: 0,
  idempotencyKey: 'in_1',
};

function setup(responses: Response[], start = 1_000_000) {
  let clock = start;
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  const sleep = vi.fn(async () => {});
  const sessions: OblioSessions = new Map();
  const client = () => createOblioClient(config, { fetch, now: () => clock, sleep, sessions });
  return {
    fetch,
    sleep,
    client,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const urlOf = (call: Parameters<typeof globalThis.fetch>) => String(call[0]);

describe('Oblio client', () => {
  it('logs in with the account email and secret as a form', async () => {
    const { fetch, client } = setup([tokenResponse('t1'), companiesResponse()]);
    await client().companies();

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://www.oblio.eu/api/authorize/token');
    expect(init?.method).toBe('POST');
    const form = init?.body as URLSearchParams;
    expect(form.get('client_id')).toBe('facturi@example.ro');
    expect(form.get('client_secret')).toBe('secret-123');
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('Authorization')).toBe('Bearer t1');
  });

  it('reuses the token across clients until shortly before it expires', async () => {
    const { fetch, client, advance } = setup([
      tokenResponse('t1'),
      companiesResponse(),
      companiesResponse(),
      tokenResponse('t2'),
      companiesResponse(),
    ]);
    await client().companies();
    advance(3_000_000);
    await client().companies();
    advance(560_000);
    await client().companies();

    const logins = fetch.mock.calls.filter((call) => urlOf(call).endsWith('/authorize/token'));
    expect(logins).toHaveLength(2);
    expect(new Headers(fetch.mock.calls[4]![1]?.headers).get('Authorization')).toBe('Bearer t2');
  });

  it('says the secret must be replaced when the login is refused', async () => {
    const { client } = setup([json(401, { status: 401, statusMessage: 'Invalid client' })]);
    const error = await client()
      .companies()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).reason).toBe('oblio_login_refused');
    expect((error as ApiError).message).toContain(loginRefusedMessage);
    expect((error as ApiError).message).toContain('OBLIO_CLIENT_SECRET');
    expect((error as ApiError).message).toContain('Invalid client');
    expect((error as ApiError).message).not.toContain('secret-123');
  });

  it('logs in again once when a cached token is refused', async () => {
    const { fetch, client } = setup([
      tokenResponse('t1'),
      companiesResponse(),
      json(401, { status: 401, statusMessage: 'Token expired' }),
      tokenResponse('t2'),
      companiesResponse(),
    ]);
    await client().companies();
    await client().companies();

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(new Headers(fetch.mock.calls[4]![1]?.headers).get('Authorization')).toBe('Bearer t2');
  });

  it('retries once after a 429, waiting as long as Oblio asks', async () => {
    const { fetch, sleep, client } = setup([
      tokenResponse('t1'),
      companiesResponse(),
      json(429, { status: 429, statusMessage: 'Too many requests' }, { 'Retry-After': '5' }),
      documentResponse('0007'),
    ]);
    const document = await client().createProforma(proforma);

    expect(sleep).toHaveBeenCalledExactlyOnceWith(5_000);
    expect(document.number).toBe('0007');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('gives up after a second 429 with Oblio’s message', async () => {
    const { sleep, client } = setup([
      tokenResponse('t1'),
      companiesResponse(),
      json(429, { status: 429, statusMessage: 'Too many requests' }),
      json(429, { status: 429, statusMessage: 'Too many requests' }),
    ]);
    const error = await client()
      .createProforma(proforma)
      .catch((caught: unknown) => caught);

    expect(sleep).toHaveBeenCalledExactlyOnceWith(2_000);
    expect(error).toMatchObject({
      code: 'service_unavailable',
      reason: 'oblio_unavailable',
      message: 'Oblio answered 429: Too many requests',
    });
  });

  it('includes Oblio’s message when it refuses a document', async () => {
    const { client } = setup([
      tokenResponse('t1'),
      companiesResponse(),
      json(400, { status: 400, statusMessage: 'Seria TEST nu exista' }),
    ]);
    const error = await client()
      .createProforma(proforma)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'unprocessable',
      reason: 'oblio_refused',
      message: 'Oblio answered 400: Seria TEST nu exista',
    });
  });

  it('issues from the only company of the account, asking for it once', async () => {
    const { fetch, client } = setup([
      tokenResponse('t1'),
      companiesResponse(),
      documentResponse('0001'),
      documentResponse('0002'),
    ]);
    await client().createProforma(proforma);
    await client().createProforma({ ...proforma, idempotencyKey: 'in_2' });

    const [url, init] = fetch.mock.calls[3]!;
    expect(url).toBe('https://www.oblio.eu/api/docs/proforma');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      cif: 'RO123456',
      idempotencyKey: 'in_2',
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('asks for the seller to be configured when the account holds several companies', async () => {
    const { client } = setup([
      tokenResponse('t1'),
      companiesResponse([
        { cif: 'RO1', company: 'Casapu PFA' },
        { cif: 'RO2', company: 'Altă firmă SRL' },
      ]),
    ]);
    const error = await client()
      .createProforma(proforma)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ reason: 'oblio_seller_unknown' });
    expect((error as Error).message).toContain('Altă firmă SRL (RO2)');
  });

  it('reads a document and cancels one with the seller’s CIF', async () => {
    const { fetch, client } = setup([
      tokenResponse('t1'),
      companiesResponse(),
      documentResponse('0003'),
      documentResponse('0003'),
    ]);
    const oblio = client();
    const document = await oblio.getDocument('invoice', 'SSMUSOR', '0003');
    await oblio.cancel('proforma', 'TEST', '0003');

    expect(document.link).toContain('0003');
    expect(urlOf(fetch.mock.calls[2]!)).toBe(
      'https://www.oblio.eu/api/docs/invoice?cif=RO123456&seriesName=SSMUSOR&number=0003'
    );
    const [cancelUrl, cancel] = fetch.mock.calls[3]!;
    expect(cancelUrl).toBe('https://www.oblio.eu/api/docs/proforma/cancel');
    expect(cancel?.method).toBe('PUT');
    expect(String(cancel?.body)).toBe('cif=RO123456&seriesName=TEST&number=0003');
  });

  it('turns a network failure into an unavailable service', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('timed out'));
    const error = await createOblioClient(config, { fetch, sessions: new Map() })
      .companies()
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'service_unavailable',
      message: 'Oblio could not be reached: timed out',
    });
  });
});
