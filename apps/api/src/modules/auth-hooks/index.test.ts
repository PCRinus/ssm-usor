import type { MailService } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const sendPasswordReset = vi.fn<MailService['sendPasswordReset']>();

const base64 = (text: string) => btoa(text);
const key = base64('a-hook-signing-key-of-32-bytes!!');
const env: ApiEnv['Bindings'] = {
  SUPABASE_AUTH_HOOK_SECRET: `v1,whsec_${key}`,
  APP_ORIGIN: 'https://app.example.ro',
  MAIL: {
    sendWaitlistConfirmation: vi.fn(),
    sendOrganizationInvitation: vi.fn(),
    sendPasswordReset,
  },
};

const payload = (type = 'recovery') => ({
  user: { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ion@example.ro' },
  email_data: {
    token: '12345678',
    token_hash: 'hash-abc',
    redirect_to: 'https://elsewhere.example/',
    email_action_type: type,
    site_url: 'https://app.example.ro',
  },
});

// Signed the way Standard Webhooks specifies, with `sign` where the code under test uses
// `verify`.
async function sign(body: string, { id = 'msg_1', at = Date.now(), withKey = key } = {}) {
  const timestamp = String(Math.floor(at / 1000));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(withKey), (char) => char.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`)
  );
  return {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`,
  };
}

const post = (body: string, headers: Record<string, string>, targetEnv = env) =>
  createApp().request(
    '/hooks/supabase/send-email',
    { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body },
    targetEnv
  );

beforeEach(() => {
  sendPasswordReset.mockReset().mockResolvedValue({ id: 'msg_1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /hooks/supabase/send-email', () => {
  it('sends the recovery email with a link to the reset page of the SPA', async () => {
    const body = JSON.stringify(payload());

    const response = await post(body, await sign(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(sendPasswordReset).toHaveBeenCalledWith({
      to: 'ion@example.ro',
      resetUrl: 'https://app.example.ro/reset-password?token_hash=hash-abc',
      expiresInMinutes: 60,
    });
  });

  it('ignores the redirect Supabase was asked for, so the link cannot leave the SPA', async () => {
    const body = JSON.stringify(payload());

    await post(body, await sign(body));

    expect(sendPasswordReset.mock.calls[0]![0].resetUrl).not.toContain('elsewhere');
  });

  it.each([
    [
      'a signature made with another key',
      (body: string) => sign(body, { withKey: base64('another-key') }),
    ],
    ['a signature for a different body', () => sign('{"tampered":true}')],
    [
      'a request older than five minutes',
      (body: string) => sign(body, { at: Date.now() - 6 * 60 * 1000 }),
    ],
    ['missing signature headers', () => ({})],
  ])('rejects %s', async (_, headersFor) => {
    const body = JSON.stringify(payload());

    const response = await post(body, (await headersFor(body)) as Record<string, string>);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { http_code: 401, message: 'Invalid signature.' },
    });
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });

  it('accepts a signature made with either secret while one is being rotated', async () => {
    const body = JSON.stringify(payload());
    const oldKey = base64('the-previous-signing-key-32-byte');

    const response = await post(body, await sign(body, { withKey: oldKey }), {
      ...env,
      SUPABASE_AUTH_HOOK_SECRET: `v1,whsec_${key}|v1,whsec_${oldKey}`,
    });

    expect(response.status).toBe(200);
  });

  it.each(['signup', 'magiclink', 'email_change', 'invite', 'reauthentication'])(
    'refuses the %s email, which is not in use, instead of dropping it silently',
    async (type) => {
      const body = JSON.stringify(payload(type));

      const response = await post(body, await sign(body));

      expect(response.status).toBe(422);
      expect(sendPasswordReset).not.toHaveBeenCalled();
    }
  );

  it('answers 500 when the email cannot be sent, so Supabase reports the failure', async () => {
    sendPasswordReset.mockRejectedValue(new Error('Resend rejected the email'));
    const body = JSON.stringify(payload());

    const response = await post(body, await sign(body));

    expect(response.status).toBe(500);
  });

  it.each(['SUPABASE_AUTH_HOOK_SECRET', 'MAIL'] as const)(
    'answers 503 while %s is missing',
    async (missing) => {
      const body = JSON.stringify(payload());

      const response = await post(body, await sign(body), { ...env, [missing]: undefined });

      expect(response.status).toBe(503);
    }
  );

  it('rejects a signed payload of the wrong shape', async () => {
    const body = JSON.stringify({ user: {}, email_data: {} });

    const response = await post(body, await sign(body));

    expect(response.status).toBe(400);
  });

  it('stays out of the OpenAPI document and the generated client', async () => {
    const document = (await (await createApp().request('/openapi.json', {}, env)).json()) as {
      paths: Record<string, unknown>;
    };

    expect(Object.keys(document.paths)).not.toContain('/hooks/supabase/send-email');
  });
});
