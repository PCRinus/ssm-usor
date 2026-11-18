import type { MailService } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashToken } from '../../lib/tokens';
import { apiRequest } from '../../test/request';
import {
  callsTo,
  fetchMock,
  mockUpstream as mockSignedInUpstream,
  stubFetch,
  testEnv,
  testSecretKey,
} from '../../test/upstream';

const sendWaitlistConfirmation = vi.fn<MailService['sendWaitlistConfirmation']>();

const env = testEnv({
  SUPABASE_SECRET_KEY: testSecretKey,
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  CORS_ORIGINS: 'https://app.ssmusor.ro',
  API_ORIGIN: 'https://api.ssmusor.ro',
  MARKETING_ORIGIN: 'https://ssmusor.ro',
  MAIL: {
    sendWaitlistConfirmation,
    sendOrganizationInvitation: vi.fn(),
    sendPasswordReset: vi.fn(),
    sendPasswordChanged: vi.fn(),
    sendSignupConfirmation: vi.fn(),
    sendServiceContract: vi.fn(),
    sendSignedCopyReceived: vi.fn(),
    sendParticipantInvitation: vi.fn(),
    sendSignInCode: vi.fn(),
    sendSigningCode: vi.fn(),
    sendSignatureRequest: vi.fn(),
    sendSmsUsageNotice: vi.fn(),
    sendEmployeesOverStepNotice: vi.fn(),
    sendExtrasNotice: vi.fn(),
  },
});

type Row = {
  id: string;
  confirmed_at: string | null;
  confirmation_sent_at?: string | null;
};

function mockUpstream({ turnstile = true, row = null }: { turnstile?: boolean; row?: Row | null }) {
  mockSignedInUpstream({
    'POST /turnstile/v0/siteverify': ({ url }) => {
      if (url.hostname !== 'challenges.cloudflare.com') throw new Error(`Unexpected ${url}`);
      return { success: turnstile };
    },
    'GET /rest/v1/waitlist_subscribers': () => Response.json(row),
    'POST /rest/v1/waitlist_subscribers': () => ({ id: row?.id ?? 'new-id' }),
    'PATCH /rest/v1/waitlist_subscribers': () => new Response(null, { status: 204 }),
  });
}

const writes = (method: 'POST' | 'PATCH') =>
  callsTo('/rest/v1/waitlist_subscribers', method).map(
    ({ body }) => body as Record<string, unknown>
  );

const subscribe = (body: unknown, targetEnv = env) =>
  apiRequest(
    '/waitlist',
    { method: 'POST', body, token: null, client: null, headers: { Origin: 'https://ssmusor.ro' } },
    targetEnv
  );

const validBody = { email: ' Ana@Example.ro ', consentVersion: '2026-09', turnstileToken: 'tt' };

stubFetch();

beforeEach(() => {
  sendWaitlistConfirmation.mockReset().mockResolvedValue({ id: 'msg_1' });
});

afterEach(() => {
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
    expect(await hashToken(link.searchParams.get('token')!)).toBe(saved!.confirmation_token_hash);

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
    const response = await apiRequest(
      '/health',
      { token: null, client: null, headers: { Origin: 'https://ssmusor.ro' } },
      env
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('GET /waitlist/confirm', () => {
  const confirm = (query: string) =>
    apiRequest(`/waitlist/confirm${query}`, { token: null, client: null }, env);

  it('confirms a pending subscription and redirects to the confirmed page', async () => {
    mockUpstream({ row: { id: 'row-1', confirmed_at: null } });

    const response = await confirm('?token=some-token');

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://ssmusor.ro/abonare/confirmata/');
    expect(writes('PATCH')[0]).toHaveProperty('confirmed_at');

    const [lookup] = callsTo('/rest/v1/waitlist_subscribers', 'GET');
    expect(String(lookup!.url)).toContain(
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

  it('fails instead of redirecting to a default site when MARKETING_ORIGIN is not set', async () => {
    mockUpstream({ row: { id: 'row-1', confirmed_at: null } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await apiRequest(
      '/waitlist/confirm?token=some-token',
      { token: null, client: null },
      { ...env, MARKETING_ORIGIN: undefined }
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('Location')).toBeNull();
    expect(console.error).toHaveBeenCalledWith('MARKETING_ORIGIN is not set.');
  });
});
