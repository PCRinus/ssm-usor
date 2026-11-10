import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  apiErrorResponseSchema,
  clientContract,
  clientContractFingerprints,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app';
import type { ApiEnv } from './env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CORS_ORIGINS: 'https://app.ssmusor.ro',
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

const request = (path: string, headers: Record<string, string> = {}, init: RequestInit = {}) =>
  createApp().request(path, { ...init, headers }, env);

const hashOf = (client: string) =>
  createHash('sha256')
    .update(readFileSync(new URL(`../../../${client}/src/api/generated/api.ts`, import.meta.url)))
    .digest('hex')
    .slice(0, 16);

describe('the contract fingerprints', () => {
  it.each(['app', 'portal'] as const)('are the hash of the generated %s client', (client) => {
    expect(clientContractFingerprints[client]).toBe(hashOf(client));
  });
});

// /me without a token answers 401 before reaching Supabase, so a 401 means the check let it pass.
describe('the client contract check', () => {
  it.each(['app', 'portal'] as const)('lets the current %s client through', async (client) => {
    const response = await request('/me', { 'X-Client-Contract': clientContract(client) });
    expect(response.status).toBe(401);
  });

  it('lets a request without the header through', async () => {
    expect((await request('/me')).status).toBe(401);
  });

  it.each([
    ['another fingerprint', 'app:0000000000000000'],
    ["the other client's fingerprint", clientContract('portal').replace('portal', 'app')],
    ['an unknown client', `admin:${clientContract('app').split(':')[1]}`],
    ['a malformed value', 'app'],
    ['an empty value', ''],
  ])('refuses %s before authentication', async (_case, contract) => {
    const response = await request('/me', {
      'X-Client-Contract': contract,
      Origin: 'https://app.ssmusor.ro',
    });
    expect(response.status).toBe(426);
    expect(apiErrorResponseSchema.parse(await response.json())).toEqual({
      error: 'client_outdated',
      message: 'This client was built for an older API. Reload the page.',
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.ssmusor.ro');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/health'],
    ['POST', '/billing/stripe-webhook'],
    ['POST', '/hooks/supabase/send-email'],
    ['POST', '/hooks/supabase/send-sms'],
    ['POST', '/waitlist'],
    ['GET', '/waitlist/confirm'],
    ['GET', '/files/download'],
    ['GET', '/openapi.json'],
  ])('does not check %s %s', async (method, path) => {
    const response = await request(
      path,
      { 'X-Client-Contract': 'app:0000000000000000' },
      { method }
    );
    expect(response.status).not.toBe(426);
  });

  it('answers a CORS preflight that announces the header', async () => {
    const response = await request(
      '/me',
      {
        Origin: 'https://app.ssmusor.ro',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization, x-client-contract',
        'X-Client-Contract': 'app:0000000000000000',
      },
      { method: 'OPTIONS' }
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'x-client-contract'
    );
  });
});
