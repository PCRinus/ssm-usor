import type { MailService } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import { hashToken } from './tokens';

const sendWaitlistConfirmation = vi.fn<MailService['sendWaitlistConfirmation']>();

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  CORS_ORIGINS: 'https://app.ssmusor.ro',
  MAIL: { sendWaitlistConfirmation },
};

type Row = {
  id: string;
  confirmed_at: string | null;
  confirmation_sent_at?: string | null;
};

const fetchMock = vi.fn<typeof fetch>();

// Stands in for Turnstile and for PostgREST's waitlist_subscribers resource.
function mockUpstream({ turnstile = true, row = null }: { turnstile?: boolean; row?: Row | null }) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'challenges.cloudflare.com') return Response.json({ success: turnstile });
    if (url.pathname === '/rest/v1/waitlist_subscribers') {
      if (init?.method === 'GET') return Response.json(row);
      if (init?.method === 'POST') return Response.json({ id: row?.id ?? 'new-id' });
      if (init?.method === 'PATCH') return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected upstream request: ${init?.method} ${url}`);
  });
}

const writes = (method: 'POST' | 'PATCH') =>
  fetchMock.mock.calls
    .filter(([input, init]) => String(input).includes('/rest/v1/') && init?.method === method)
    .map(([, init]) => JSON.parse(init?.body as string));

const subscribe = (body: unknown, targetEnv = env) =>
  createApp().request(
    '/waitlist',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://ssmusor.ro' },
      body: JSON.stringify(body),
    },
    targetEnv
  );

const validBody = { email: ' Ana@Example.ro ', consentVersion: '2026-09', turnstileToken: 'tt' };

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  sendWaitlistConfirmation.mockReset().mockResolvedValue({ id: 'msg_1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /waitlist', () => {
  it('stores a new address as pending and emails a link whose token matches the stored hash', async () => {
    mockUpstream({});

    const response = await subscribe(validBody);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: 'confirmation_pending' });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ssmusor.ro');

    const [saved] = writes('POST');
    expect(saved).toMatchObject({ email: 'ana@example.ro', consent_version: '2026-09' });

    const [{ to, confirmUrl }] = sendWaitlistConfirmation.mock.calls[0]!;
    expect(to).toBe('ana@example.ro');
    const link = new URL(confirmUrl);
    expect(link.origin).toBe('https://api.ssmusor.ro');
    expect(link.pathname).toBe('/waitlist/confirm');
    expect(await hashToken(link.searchParams.get('token')!)).toBe(saved.confirmation_token_hash);

    expect(writes('PATCH')[0]).toHaveProperty('confirmation_sent_at');
  });

  it('answers the same way for a confirmed address without emailing or writing', async () => {
    mockUpstream({ row: { id: 'row-1', confirmed_at: '2026-09-01T10:00:00Z' } });

    const response = await subscribe(validBody);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: 'confirmation_pending' });
    expect(sendWaitlistConfirmation).not.toHaveBeenCalled();
    expect(writes('POST')).toEqual([]);
  });

  it('does not email a pending address again within ten minutes', async () => {
    const recently = new Date(Date.now() - 60_000).toISOString();
    mockUpstream({ row: { id: 'row-1', confirmed_at: null, confirmation_sent_at: recently } });

    expect((await subscribe(validBody)).status).toBe(202);
    expect(sendWaitlistConfirmation).not.toHaveBeenCalled();
  });

  it('emails a pending address again once ten minutes have passed', async () => {
    const earlier = new Date(Date.now() - 11 * 60_000).toISOString();
    mockUpstream({ row: { id: 'row-1', confirmed_at: null, confirmation_sent_at: earlier } });

    expect((await subscribe(validBody)).status).toBe(202);
    expect(sendWaitlistConfirmation).toHaveBeenCalledOnce();
  });

  it('rejects the request before touching the database when Turnstile refuses the token', async () => {
    mockUpstream({ turnstile: false });

    const response = await subscribe(validBody);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'validation_error',
      issues: [{ path: 'turnstileToken' }],
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/rest/v1/'))).toBe(false);
  });

  it('reports the failure and leaves the sent time unset when the email cannot be sent', async () => {
    mockUpstream({});
    sendWaitlistConfirmation.mockRejectedValue(new Error('Resend rejected the email'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await subscribe(validBody);

    expect(response.status).toBe(503);
    expect(writes('PATCH')).toEqual([]);
  });

  it('is unavailable until the secret key, Turnstile key, and mail binding are configured', async () => {
    mockUpstream({});

    for (const missing of ['SUPABASE_SECRET_KEY', 'TURNSTILE_SECRET_KEY', 'MAIL'] as const) {
      const response = await subscribe(validBody, { ...env, [missing]: undefined });
      expect(response.status, missing).toBe(503);
    }
    expect(sendWaitlistConfirmation).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    const response = await subscribe({ ...validBody, email: 'not-an-email' });
    expect(response.status).toBe(400);
  });

  it('does not grant the dashboard origin access to other routes from the marketing site', async () => {
    const response = await createApp().request(
      '/health',
      { headers: { Origin: 'https://ssmusor.ro' } },
      env
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('GET /waitlist/confirm', () => {
  const confirm = (query: string) => createApp().request(`/waitlist/confirm${query}`, {}, env);

  it('confirms a pending subscription and redirects to the confirmed page', async () => {
    mockUpstream({ row: { id: 'row-1', confirmed_at: null } });

    const response = await confirm('?token=some-token');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://ssmusor.ro/abonare/confirmata/');
    expect(writes('PATCH')[0]).toHaveProperty('confirmed_at');

    const lookup = fetchMock.mock.calls.find(([, init]) => init?.method === 'GET')!;
    expect(String(lookup[0])).toContain(
      `confirmation_token_hash=eq.${await hashToken('some-token')}`
    );
  });

  it('keeps the original confirmation time when the link is followed again', async () => {
    mockUpstream({ row: { id: 'row-1', confirmed_at: '2026-09-01T10:00:00Z' } });

    const response = await confirm('?token=some-token');

    expect(response.headers.get('Location')).toBe('https://ssmusor.ro/abonare/confirmata/');
    expect(writes('PATCH')).toEqual([]);
  });

  it('redirects an unknown or missing token to the invalid-link page', async () => {
    mockUpstream({ row: null });

    for (const query of ['?token=unknown', '']) {
      const response = await confirm(query);
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toBe('https://ssmusor.ro/abonare/link-invalid/');
    }
  });
});
