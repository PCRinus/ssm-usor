import type { MailService, SmsService } from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../app';
import { accessTokenAt } from './access-token.fixture';
import { requireAuth } from './auth';
import type { ApiEnv } from './env';
import { refuseDuringImpersonation } from './impersonation';
import { requireMembership } from './membership';

const admin = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'mircea@example.ro',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email', role: 'admin' } as Record<string, string>,
  user_metadata: {},
};
const memberId = '9ae7d65f-fac5-4b57-9d9b-3e502febfd31';
const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const someId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const activeImpersonation = {
  id: 'b1b1b1b1-0000-4000-8000-000000000001',
  target_user_id: memberId,
  reason: 'Reproduce a failed import',
  started_at: '2026-11-11T09:00:00+00:00',
  expires_at: '2026-11-11T11:00:00+00:00',
  ended_at: null,
};

const sendSignatureRequest = vi.fn<MailService['sendSignatureRequest']>();
const sendSigningCode = vi.fn<SmsService['sendSigningCode']>();

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
  APP_ORIGIN: 'https://app.example.ro',
  PORTAL_ORIGIN: 'https://portal.example.ro',
  MAIL: { sendSignatureRequest } as unknown as MailService,
  SMS: { sendSigningCode } as unknown as SmsService,
};

const fetchMock = vi.fn<typeof fetch>();
let appMetadata: Record<string, string>;
let effectiveUserId: string;
let impersonation: typeof activeImpersonation | null;

const upstreamPaths = () => fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  sendSignatureRequest.mockReset().mockResolvedValue({ id: 'm1' });
  sendSigningCode.mockReset().mockResolvedValue({ id: 's1' });
  appMetadata = admin.app_metadata;
  effectiveUserId = memberId;
  impersonation = activeImpersonation;
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') {
      return Response.json({ ...admin, app_metadata: appMetadata });
    }
    if (url.pathname === '/rest/v1/rpc/current_membership') {
      return Response.json([
        {
          user_id: effectiveUserId,
          organization_id: organizationId,
          role: 'owner',
          access: 'full',
        },
      ]);
    }
    if (url.pathname === '/rest/v1/rpc/current_impersonation') return Response.json(impersonation);
    return Response.json(null);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Routes no handler guards itself, as a route added later would be.
function appWithUnguardedSenders() {
  const app = createApp();
  app.post('/unguarded/mail', requireAuth, async (c) => {
    await c.env.MAIL!.sendSignatureRequest({
      to: 'ion@example.ro',
      count: 1,
      organizationName: 'Protect SSM',
      signUrl: 'https://portal.example.ro',
      place: 'portal',
    });
    return c.body(null, 204);
  });
  app.post('/unguarded/sms', requireAuth, requireMembership, async (c) => {
    await c.env.SMS!.sendSigningCode({ to: '+40722000001', code: '123456' } as never);
    return c.body(null, 204);
  });
  return app;
}

const post = (path: string, token = accessTokenAt('aal2', admin.id)) =>
  appWithUnguardedSenders().request(
    path,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    env
  );

describe('messages sent during an impersonation', () => {
  it('sends from a route without a membership, which acts as the signed-in admin himself', async () => {
    const response = await post('/unguarded/mail');

    expect(response.status).toBe(204);
    expect(sendSignatureRequest).toHaveBeenCalledOnce();
    expect(upstreamPaths()).not.toContain('/rest/v1/rpc/current_impersonation');
  });

  it('refuses an SMS from a route with a membership that is not the admin’s own', async () => {
    const response = await post('/unguarded/sms');

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: 'impersonation_refused' });
    expect(sendSigningCode).not.toHaveBeenCalled();
    expect(upstreamPaths()).not.toContain('/rest/v1/rpc/current_impersonation');
  });

  it('sends for a platform admin who is not impersonating', async () => {
    impersonation = null;
    effectiveUserId = admin.id;

    expect((await post('/unguarded/mail')).status).toBe(204);
    expect((await post('/unguarded/sms')).status).toBe(204);
    expect(sendSignatureRequest).toHaveBeenCalledOnce();
    expect(sendSigningCode).toHaveBeenCalledOnce();
  });

  it.each([
    ['a member', { provider: 'email' }, 'aal2'],
    ['an admin signed in with the password alone', { provider: 'email', role: 'admin' }, 'aal1'],
  ] as const)('sends for %s without reading any impersonation', async (_, metadata, aal) => {
    appMetadata = metadata;
    effectiveUserId = admin.id;

    expect((await post('/unguarded/mail', accessTokenAt(aal, admin.id))).status).toBe(204);
    expect(sendSignatureRequest).toHaveBeenCalledOnce();
    expect(upstreamPaths()).not.toContain('/rest/v1/rpc/current_impersonation');
  });
});

describe('routes that sign or send in the member’s name', () => {
  const routes = [
    '/organization/invitations',
    `/organization/invitations/${someId}/resend`,
    `/clients/${clientId}/employees/${someId}/participant-invitations`,
    `/clients/${clientId}/participant-invitations`,
    `/clients/${clientId}/employee-participant-invitations`,
    `/participant-invitations/${someId}/resend`,
    `/clients/${clientId}/service-contract/send`,
    '/me/signing-sessions',
    `/me/signing-sessions/${someId}/sign`,
  ];

  it.each(routes)('refuse POST %s during an impersonation, before anything else', async (path) => {
    const response = await createApp().request(
      path,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessTokenAt('aal2', admin.id)}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      env
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: 'forbidden',
      reason: 'impersonation_refused',
    });
    expect(upstreamPaths()).toEqual(['/auth/v1/user', '/rest/v1/rpc/current_membership']);
  });

  it('refuse an admin whose role was removed after his token was issued, whom the database still lets act as the member', async () => {
    appMetadata = { provider: 'email' };

    const guarded = await createApp().request(
      '/organization/invitations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessTokenAt('aal2', admin.id)}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      env
    );
    const unguarded = await post('/unguarded/sms');

    expect(guarded.status).toBe(403);
    expect(unguarded.status).toBe(403);
    expect(sendSigningCode).not.toHaveBeenCalled();
  });

  it.each(routes)('let POST %s through for the admin as himself', async (path) => {
    effectiveUserId = admin.id;

    const response = await createApp().request(
      path,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessTokenAt('aal2', admin.id)}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      env
    );

    // Past the guard: the empty body is refused, or a resend finds no invitation.
    expect([400, 404]).toContain(response.status);
  });
});

describe('a page built for someone other than whom the request acts as', () => {
  const otherMemberId = '4f0c1e2d-3b4a-4c5d-8e6f-7a8b9c0d1e2f';

  const list = (actingAs?: string, token = accessTokenAt('aal2', admin.id)) =>
    createApp().request(
      '/clients',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(actingAs === undefined ? {} : { 'X-Acting-As': actingAs }),
        },
      },
      env
    );

  it.each([
    ['another member than the one impersonated', otherMemberId, activeImpersonation],
    ['a member, when none is impersonated any more', memberId, null],
    ['the admin himself, while he impersonates a member', 'self', activeImpersonation],
  ])('is refused when it names %s, before anything is read', async (_, actingAs, active) => {
    impersonation = active;

    const response = await list(actingAs);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'conflict',
      reason: 'identity_changed',
    });
    expect(upstreamPaths()).toEqual(['/auth/v1/user', '/rest/v1/rpc/current_impersonation']);
  });

  it.each([
    ['the member impersonated', memberId, activeImpersonation, memberId],
    ['the admin himself, impersonating nobody', 'self', null, admin.id],
  ])('passes when it names %s', async (_, actingAs, active, effective) => {
    impersonation = active;
    effectiveUserId = effective;

    const response = await list(actingAs);

    expect(response.status).not.toBe(409);
    expect(upstreamPaths().slice(0, 3)).toEqual([
      '/auth/v1/user',
      '/rest/v1/rpc/current_impersonation',
      '/rest/v1/rpc/current_membership',
    ]);
  });

  it('passes without the header, with no read of its own', async () => {
    const response = await list();

    expect(response.status).not.toBe(409);
    expect(upstreamPaths()).not.toContain('/rest/v1/rpc/current_impersonation');
  });

  it.each(['self', memberId, 'anything'])(
    'passes %s from someone who cannot impersonate, with no read of its own',
    async (actingAs) => {
      appMetadata = { provider: 'email' };
      effectiveUserId = admin.id;

      const response = await list(actingAs);

      expect(response.status).not.toBe(409);
      expect(upstreamPaths()).not.toContain('/rest/v1/rpc/current_impersonation');
    }
  );

  it('reads the impersonation once a request, for the check and the refusal after it', async () => {
    const app = createApp();
    app.post('/unguarded/guarded', requireAuth, refuseDuringImpersonation, (c) =>
      c.body(null, 204)
    );

    const response = await app.request(
      '/unguarded/guarded',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessTokenAt('aal2', admin.id)}`,
          'X-Acting-As': memberId,
        },
      },
      env
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: 'impersonation_refused' });
    expect(
      upstreamPaths().filter((path) => path === '/rest/v1/rpc/current_impersonation')
    ).toHaveLength(1);
  });

  it('is allowed across origins by CORS', async () => {
    const response = await createApp().request(
      '/clients',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.example.ro',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization,x-acting-as',
        },
      },
      { ...env, CORS_ORIGINS: 'https://app.example.ro' }
    );

    expect(response.headers.get('Access-Control-Allow-Headers')).toMatch(/X-Acting-As/i);
  });
});
