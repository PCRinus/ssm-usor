import type { MailService, SmsService } from '@ssm-usor/contracts';
import { vi } from 'vitest';

import type { ApiEnv } from '../../lib/env';

export type UpstreamCall = {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
  secret: boolean;
};

export type UpstreamRoute = (call: UpstreamCall) => unknown;

export const user = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'ana@example.ro',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email' },
  user_metadata: {},
};

export const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
export const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

export const sendSignatureRequestEmail = vi.fn<MailService['sendSignatureRequest']>();
export const sendSignatureRequestSms = vi.fn<SmsService['sendSignatureRequest']>();

export const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
  APP_ORIGIN: 'https://app.example.ro',
  PORTAL_ORIGIN: 'https://portal.example.ro',
  MAIL: { sendSignatureRequest: sendSignatureRequestEmail } as unknown as MailService,
  SMS: { sendSignatureRequest: sendSignatureRequestSms } as unknown as SmsService,
};

export const fetchMock = vi.fn<typeof fetch>();

export const databaseError = (code: string, message: string, status = 400) =>
  Response.json({ code, message, details: null, hint: null }, { status });

/**
 * Answers each request by `METHOD /path` or `/path`; a route returns rows, which go back as one
 * object when supabase-js asked for one, or a Response as it is.
 */
export function mockUpstream(routes: Record<string, UpstreamRoute>) {
  const defaults: Record<string, UpstreamRoute> = {
    '/auth/v1/user': () => ({ ...user }),
    '/rest/v1/rpc/current_membership': () => [
      { user_id: user.id, organization_id: organizationId, role: 'specialist' },
    ],
  };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const call: UpstreamCall = {
      method,
      url,
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      secret: headers.get('Authorization') === `Bearer ${env.SUPABASE_SECRET_KEY}`,
    };
    const route =
      routes[`${method} ${url.pathname}`] ??
      routes[url.pathname] ??
      defaults[`${method} ${url.pathname}`] ??
      defaults[url.pathname];
    if (!route) throw new Error(`Unexpected upstream request: ${method} ${url}`);
    const result = await route(call);
    if (result instanceof Response) return result;
    const one = headers.get('Accept')?.includes('vnd.pgrst.object');
    return Response.json(one && Array.isArray(result) ? (result[0] ?? null) : result);
  });
}

export const callsTo = (pathname: string, method?: string) =>
  fetchMock.mock.calls
    .map(([input, init]) => {
      const headers = new Headers(init?.headers);
      return {
        method: init?.method ?? 'GET',
        url: new URL(String(input)),
        headers,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        secret: headers.get('Authorization') === `Bearer ${env.SUPABASE_SECRET_KEY}`,
      };
    })
    .filter((call) => call.url.pathname === pathname && (!method || call.method === method));
