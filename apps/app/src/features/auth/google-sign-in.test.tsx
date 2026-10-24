import type { Session } from '@supabase/supabase-js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM SRL' };

const fetchMock = vi.fn<typeof fetch>();

function mockApi({ member = true } = {}) {
  fetchMock.mockImplementation(async (input) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: {
          fullName: 'Ana Popescu',
          professionalTitle: null,
          termsVersion: null,
          termsAcceptedAt: null,
        },
        membership: member ? { organization, role: 'owner' } : null,
      });
    }
    if (pathname === '/me/invitations') return Response.json({ items: [] });
    return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
  });
}

function googleSession(): Session {
  const session = makeSession();
  return {
    ...session,
    user: { ...session.user, app_metadata: { provider: 'google', providers: ['google'] } },
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mockApi();
  sessionStorage.clear();
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Google button', () => {
  it('is on the registration page and sends Google back to the callback', async () => {
    const auth = authFixture();
    mountApp(auth.client, '/register');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('google-sign-in'));

    expect(auth.client.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  });

  it('is not on the login page unless the registration flag is on', async () => {
    mountApp(authFixture().client, '/login');

    await screen.findByTestId('login-page');
    expect(screen.queryByTestId('google-sign-in')).toBeNull();
  });

  it('is on the login page when the registration flag is on', async () => {
    vi.stubEnv('VITE_REGISTRATION_LINK', 'true');
    mountApp(authFixture().client, '/login');

    expect(await screen.findByTestId('google-sign-in')).toBeTruthy();
  });

  it('says so when Google cannot be opened', async () => {
    const auth = authFixture();
    auth.client.signInWithOAuth.mockResolvedValue({ error: { message: 'offline' } });
    mountApp(auth.client, '/register');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('google-sign-in'));

    expect(await screen.findByTestId('google-sign-in-error')).toBeTruthy();
  });
});

describe('Google callback', () => {
  it('exchanges the code once and opens the app', async () => {
    const auth = authFixture();
    auth.client.exchangeCodeForSession.mockResolvedValue({
      data: { session: googleSession() },
      error: null,
    });
    const runtime = mountApp(auth.client, '/auth/callback?code=code-abc');

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(auth.client.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(auth.client.exchangeCodeForSession).toHaveBeenCalledWith('code-abc');
  });

  it('sends a new account to onboarding', async () => {
    mockApi({ member: false });
    const auth = authFixture();
    auth.client.exchangeCodeForSession.mockResolvedValue({
      data: { session: googleSession() },
      error: null,
    });
    const runtime = mountApp(auth.client, '/auth/callback?code=code-abc');

    await screen.findByTestId('onboarding-page');
    expect(runtime.router.state.location.pathname).toBe('/onboarding');
  });

  it('returns to the invitation the sign-in started from', async () => {
    vi.stubEnv('VITE_REGISTRATION_LINK', 'true');
    const auth = authFixture();
    mountApp(auth.client, '/login?invitation=token-xyz');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('google-sign-in'));
    disposeRuntimes();

    auth.client.exchangeCodeForSession.mockResolvedValue({
      data: { session: googleSession() },
      error: null,
    });
    const runtime = mountApp(auth.client, '/auth/callback?code=code-abc');

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/accept-invitation'));
    expect(runtime.router.state.location.search).toEqual({ token: 'token-xyz' });
  });

  it('goes back to the page it started from when the person cancels at Google', async () => {
    const auth = authFixture();
    mountApp(auth.client, '/register');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('google-sign-in'));
    disposeRuntimes();

    const runtime = mountApp(auth.client, '/auth/callback?error=access_denied');

    await screen.findByTestId('register-page');
    expect(runtime.router.state.location.pathname).toBe('/register');
    expect(auth.client.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('explains a code Supabase refuses', async () => {
    mountApp(authFixture().client, '/auth/callback?code=used-code');

    await screen.findByTestId('google-callback-failed');
    expect(screen.getByTestId('google-callback-retry').getAttribute('href')).toBe('/login');
  });
});

describe('password card for an account made with Google', () => {
  it('offers a link that sets a first password', async () => {
    const auth = authFixture(googleSession());
    mountApp(auth.client, '/profile');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('set-password-send'));

    expect(await screen.findByTestId('set-password-sent')).toBeTruthy();
    expect(auth.client.resetPasswordForEmail).toHaveBeenCalledWith('review@example.test');
  });

  it('is not offered to an account with a password', async () => {
    mountApp(authFixture(makeSession()).client, '/profile');

    await screen.findByTestId('change-password-card');
    expect(screen.queryByTestId('set-password-notice')).toBeNull();
  });
});
