import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const fetchMock = vi.fn<typeof fetch>();

// Only the pages behind the login call the API.
function mockApi() {
  fetchMock.mockImplementation(async (input) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Ana Popescu', termsVersion: null, termsAcceptedAt: null },
        membership: {
          organization: { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM' },
          role: 'specialist',
        },
      });
    }
    throw new Error(`Unexpected request: ${pathname}`);
  });
}

const authError = (code: string) => ({ message: code, code });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mockApi();
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('forgot password', () => {
  it('is reachable from the login page', async () => {
    const runtime = mountApp(authFixture().client, '/login');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('login-forgot-password'));

    await screen.findByTestId('forgot-password-page');
    expect(runtime.router.state.location.pathname).toBe('/forgot-password');
  });

  it('asks Supabase for the email and answers the same for any address', async () => {
    const auth = authFixture();
    mountApp(auth.client, '/forgot-password');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('forgot-email'), '  Ion@Example.test ');
    await user.click(screen.getByTestId('forgot-submit'));

    const sent = await screen.findByTestId('forgot-password-sent');
    expect(sent.textContent).toContain('Dacă există un cont cu adresa Ion@Example.test');
    expect(auth.client.resetPasswordForEmail).toHaveBeenCalledWith('Ion@Example.test');
  });

  it('validates the address before asking', async () => {
    const auth = authFixture();
    mountApp(auth.client, '/forgot-password');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('forgot-email'), 'nu-este-email');
    await user.click(screen.getByTestId('forgot-submit'));

    expect((await screen.findByTestId('forgot-email-error')).textContent).toBe(
      'Introdu o adresă de email validă.'
    );
    expect(auth.client.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('explains a request made too soon after the previous one', async () => {
    const auth = authFixture();
    auth.client.resetPasswordForEmail.mockResolvedValue({
      error: authError('over_email_send_rate_limit'),
    });
    mountApp(auth.client, '/forgot-password');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('forgot-email'), 'ion@example.test');
    await user.click(screen.getByTestId('forgot-submit'));

    expect((await screen.findByTestId('forgot-error')).textContent).toMatch(/Așteaptă un minut/);
  });

  it('sends someone already signed in to their profile', async () => {
    const runtime = mountApp(authFixture(makeSession()).client, '/forgot-password');

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/profile'));
  });
});

describe('reset password', () => {
  const path = '/reset-password?token_hash=hash-abc';

  function recoveringAuth() {
    const auth = authFixture();
    auth.client.verifyOtp.mockResolvedValue({ data: { session: makeSession() }, error: null });
    return auth;
  }

  it('does not use the token when the link is merely opened', async () => {
    const auth = recoveringAuth();
    mountApp(auth.client, path);

    await screen.findByTestId('reset-password-page');
    expect(auth.client.verifyOtp).not.toHaveBeenCalled();
  });

  it('verifies the token, saves the password, signs other devices out, and opens the app', async () => {
    const auth = recoveringAuth();
    const runtime = mountApp(auth.client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('reset-password'), 'ParolaNoua1');
    await user.click(screen.getByTestId('reset-submit'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(auth.client.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash-abc',
      type: 'recovery',
    });
    expect(auth.client.updateUser).toHaveBeenCalledWith({ password: 'ParolaNoua1' });
    expect(auth.client.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(await screen.findByText('Parola a fost schimbată.')).toBeTruthy();
  });

  it('checks the password rules before using the token', async () => {
    const auth = recoveringAuth();
    mountApp(auth.client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('reset-password'), 'faramajuscule1');
    await user.click(screen.getByTestId('reset-submit'));

    expect((await screen.findByTestId('reset-password-error')).textContent).toContain(
      'literă mare'
    );
    expect(auth.client.verifyOtp).not.toHaveBeenCalled();
  });

  it('retries a rejected password without verifying the spent token again', async () => {
    const auth = recoveringAuth();
    auth.client.updateUser
      .mockResolvedValueOnce({ error: authError('weak_password') })
      .mockResolvedValueOnce({ error: null });
    const runtime = mountApp(auth.client, path);
    const user = userEvent.setup();

    const field = await screen.findByTestId('reset-password');
    await user.type(field, 'Parola1234');
    await user.click(screen.getByTestId('reset-submit'));
    expect((await screen.findByTestId('reset-password-error')).textContent).toMatch(/prea slabă/);

    await user.clear(field);
    await user.type(field, 'ParolaNoua1');
    await user.click(screen.getByTestId('reset-submit'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(auth.client.verifyOtp).toHaveBeenCalledOnce();
  });

  it('treats the current password as done instead of as an error', async () => {
    const auth = recoveringAuth();
    auth.client.updateUser.mockResolvedValue({ error: authError('same_password') });
    const runtime = mountApp(auth.client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('reset-password'), 'ParolaVeche1');
    await user.click(screen.getByTestId('reset-submit'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(await screen.findByText('Parola a fost schimbată.')).toBeTruthy();
    expect(auth.client.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('explains an expired or used link and offers a new one', async () => {
    const auth = authFixture();
    const runtime = mountApp(auth.client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('reset-password'), 'ParolaNoua1');
    await user.click(screen.getByTestId('reset-submit'));

    await screen.findByTestId('reset-password-invalid');
    expect(auth.client.updateUser).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('reset-request-new'));
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/forgot-password'));
  });

  it('explains a link without a token', async () => {
    mountApp(authFixture().client, '/reset-password');

    await screen.findByTestId('reset-password-invalid');
  });
});

describe('change password on the profile page', () => {
  function signedIn() {
    const auth = authFixture(makeSession());
    auth.client.signInWithPassword.mockResolvedValue({
      data: { session: makeSession() },
      error: null,
    });
    return auth;
  }

  it('checks the current password, saves the new one, and signs other devices out', async () => {
    const auth = signedIn();
    mountApp(auth.client, '/profile');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('current-password'), 'ParolaVeche1');
    await user.type(screen.getByTestId('new-password'), 'ParolaNoua1');
    await user.click(screen.getByTestId('change-password-save'));

    expect(await screen.findByText('Parola a fost schimbată.')).toBeTruthy();
    expect(auth.client.signInWithPassword).toHaveBeenCalledWith({
      email: 'review@example.test',
      password: 'ParolaVeche1',
    });
    expect(auth.client.updateUser).toHaveBeenCalledWith({ password: 'ParolaNoua1' });
    expect(auth.client.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect((screen.getByTestId('current-password') as HTMLInputElement).value).toBe('');
  });

  it('refuses a wrong current password without changing anything', async () => {
    const auth = authFixture(makeSession());
    mountApp(auth.client, '/profile');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('current-password'), 'Gresita1A');
    await user.type(screen.getByTestId('new-password'), 'ParolaNoua1');
    await user.click(screen.getByTestId('change-password-save'));

    expect((await screen.findByTestId('current-password-error')).textContent).toBe(
      'Parola curentă nu este corectă.'
    );
    expect(auth.client.updateUser).not.toHaveBeenCalled();
  });

  it('asks for a different password when the new one equals the current one', async () => {
    const auth = signedIn();
    auth.client.updateUser.mockResolvedValue({ error: authError('same_password') });
    mountApp(auth.client, '/profile');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('current-password'), 'ParolaVeche1');
    await user.type(screen.getByTestId('new-password'), 'ParolaVeche1');
    await user.click(screen.getByTestId('change-password-save'));

    expect((await screen.findByTestId('new-password-error')).textContent).toMatch(
      /diferită de cea veche/
    );
  });

  it('applies the password rules to the new password', async () => {
    const auth = signedIn();
    mountApp(auth.client, '/profile');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('current-password'), 'ParolaVeche1');
    await user.type(screen.getByTestId('new-password'), 'scurta');
    await user.click(screen.getByTestId('change-password-save'));

    expect((await screen.findByTestId('new-password-error')).textContent).toContain(
      'cel puțin 8 caractere'
    );
    expect(auth.client.signInWithPassword).not.toHaveBeenCalled();
  });
});
