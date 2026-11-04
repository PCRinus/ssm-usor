import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { unstable_readConfig } from 'wrangler';

import worker, { type AdminWorkerEnv } from './index';

const teamDomain = 'team.cloudflareaccess.com';
const audience = 'test-audience';

let privateKey: CryptoKey;
let publicJwk: JWK;
let strangerKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' };
  strangerKey = (await generateKeyPair('RS256')).privateKey;
});

function accessToken({
  key = privateKey,
  issuer = `https://${teamDomain}`,
  aud = audience,
  expiresIn = '5m',
} = {}) {
  return new SignJWT({ email: 'mircea@example.ro' })
    .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
    .setIssuer(issuer)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

const fetchMock = vi.fn<typeof fetch>();
const assets = { fetch: vi.fn(async () => new Response('<!doctype html>', { status: 200 })) };
const api = { fetch: vi.fn(async () => Response.json({ id: 'user-1' })) };

function env(overrides: Partial<AdminWorkerEnv> = {}) {
  return {
    ASSETS: assets as unknown as Fetcher,
    API: api as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: teamDomain,
    ACCESS_AUD: audience,
    ...overrides,
  } satisfies AdminWorkerEnv;
}

function request(path: string, headers: Record<string, string> = {}, init: RequestInit = {}) {
  return new Request(`https://admin.ssmusor.ro${path}`, { ...init, headers });
}

const call = (input: Request, bindings = env()) =>
  worker.fetch(input as Parameters<typeof worker.fetch>[0], bindings);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `https://${teamDomain}/cdn-cgi/access/certs`) {
      return Response.json({ keys: [publicJwk] });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  assets.fetch.mockClear();
  api.fetch.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe('the Access check', () => {
  it('serves the pages to a request Access let through', async () => {
    const response = await call(request('/', { 'Cf-Access-Jwt-Assertion': await accessToken() }));
    expect(response.status).toBe(200);
    expect(assets.fetch).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it.each([
    ['no assertion', async () => null],
    ['a token signed by another key', () => accessToken({ key: strangerKey })],
    ['a token for another application', () => accessToken({ aud: 'another-audience' })],
    [
      'a token from another team',
      () => accessToken({ issuer: 'https://other.cloudflareaccess.com' }),
    ],
    ['an expired token', () => accessToken({ expiresIn: '-1m' })],
    ['something that is not a token', async () => 'not-a-token'],
  ])('refuses %s, static files and API alike', async (_case, makeToken) => {
    const token = await makeToken();
    const headers: Record<string, string> = token ? { 'Cf-Access-Jwt-Assertion': token } : {};
    for (const path of ['/', '/assets/index.js', '/api/me']) {
      const response = await call(request(path, headers));
      expect(response.status).toBe(403);
    }
    expect(assets.fetch).not.toHaveBeenCalled();
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it.each([{ ACCESS_AUD: undefined }, { ACCESS_AUD: ' ' }, { ACCESS_TEAM_DOMAIN: undefined }])(
    'refuses everything when the environment lacks its Access settings: %o',
    async (overrides) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const token = await accessToken();
      const response = await call(
        request('/', { 'Cf-Access-Jwt-Assertion': token }),
        env(overrides)
      );
      expect(response.status).toBe(403);
      expect(assets.fetch).not.toHaveBeenCalled();
    }
  );

  it('lets local development through only with ACCESS_CHECK=off', async () => {
    expect((await call(request('/'), env({ ACCESS_CHECK: 'off' }))).status).toBe(200);
    for (const value of ['false', 'OFF', '0', '']) {
      expect((await call(request('/'), env({ ACCESS_CHECK: value }))).status).toBe(403);
    }
  });
});

describe('the API forwarding', () => {
  it('sends /api to the Admin entrypoint under /admin, with the bearer token and nothing else', async () => {
    const response = await call(
      request(
        '/api/me?full=1',
        {
          'Cf-Access-Jwt-Assertion': await accessToken(),
          Authorization: 'Bearer user-token',
          Cookie: 'CF_Authorization=secret',
          Accept: 'application/json',
        },
        { method: 'GET' }
      )
    );
    expect(response.status).toBe(200);
    expect(assets.fetch).not.toHaveBeenCalled();
    const [forwarded] = api.fetch.mock.calls[0] as unknown as [Request];
    expect(new URL(forwarded.url).pathname).toBe('/admin/me');
    expect(new URL(forwarded.url).search).toBe('?full=1');
    expect(forwarded.headers.get('Authorization')).toBe('Bearer user-token');
    expect(forwarded.headers.get('Accept')).toBe('application/json');
    expect(forwarded.headers.get('Cookie')).toBeNull();
    expect(forwarded.headers.get('Cf-Access-Jwt-Assertion')).toBeNull();
  });

  it('forwards a body with its method', async () => {
    await call(
      request(
        '/api/accounts',
        {
          'Cf-Access-Jwt-Assertion': await accessToken(),
          'Content-Type': 'application/json',
        },
        { method: 'POST', body: JSON.stringify({ reason: 'test' }) }
      )
    );
    const [forwarded] = api.fetch.mock.calls[0] as unknown as [Request];
    expect(forwarded.method).toBe('POST');
    expect(await forwarded.json()).toEqual({ reason: 'test' });
  });

  it('leaves a path that only starts with "api" to the pages', async () => {
    await call(request('/apiary', { 'Cf-Access-Jwt-Assertion': await accessToken() }));
    expect(api.fetch).not.toHaveBeenCalled();
    expect(assets.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('wrangler.jsonc', () => {
  const configPath = new URL('../wrangler.jsonc', import.meta.url).pathname;

  it.each([
    ['production', undefined, 'admin.ssmusor.ro', 'ssm-usor-api', '634a3d06512e'],
    ['non-prod', 'non-prod', 'admin.non-prod.ssmusor.ro', 'ssm-usor-api-non-prod', '0e439e147f84'],
  ])(
    'keeps %s behind Access, on its own domain and API',
    (_name, environment, domain, apiService, audiencePrefix) => {
      const config = unstable_readConfig({ config: configPath, env: environment });
      expect(config.workers_dev).toBe(false);
      expect(config.preview_urls).toBe(false);
      expect(config.assets?.run_worker_first).toBe(true);
      expect(config.routes).toEqual([{ pattern: domain, custom_domain: true }]);
      expect(config.services).toEqual([
        { binding: 'API', service: apiService, entrypoint: 'Admin' },
      ]);
      expect(config.vars.ACCESS_TEAM_DOMAIN).toBe('shy-glitter-7bca.cloudflareaccess.com');
      expect(String(config.vars.ACCESS_AUD)).toMatch(new RegExp(`^${audiencePrefix}[0-9a-f]{52}$`));
      expect(config.vars).not.toHaveProperty('ACCESS_CHECK');
    }
  );
});
