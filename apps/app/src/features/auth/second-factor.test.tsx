import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession, withFactor } from '@/test/auth-fixture';
import { quietSummary } from '@/test/dashboard-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) =>
    new URL(String(input)).pathname === '/dashboard/summary'
      ? Response.json(quietSummary)
      : Response.json({
          user: { id: 'user-one', email: 'review@example.test' },
          profile: { fullName: 'Ana Popescu', termsVersion: null, termsAcceptedAt: null },
          membership: {
            organization: { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM' },
            role: 'owner',
          },
        })
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

// Like the real client, signing in saves the session and announces it before answering.
function signsInAs(auth: ReturnType<typeof authFixture>, session = makeSession()) {
  auth.client.signInWithPassword.mockImplementation(async () => {
    auth.emit('SIGNED_IN', session);
    return { data: { session }, error: null };
  });
}

async function signIn() {
  const user = userEvent.setup();
  await user.type(await screen.findByTestId('login-email'), 'review@example.test');
  await user.type(screen.getByTestId('login-password'), 'ParolaCorecta1');
  await user.click(screen.getByTestId('login-submit'));
  return user;
}

describe('the second factor in the member app', () => {
  it('asks an account with an authenticator for its code after the password, then opens the app', async () => {
    const auth = authFixture();
    signsInAs(auth, withFactor(makeSession()));
    const runtime = mountApp(auth.client, '/autentificare');

    const user = await signIn();

    await screen.findByTestId('second-factor-page');
    expect(runtime.router.state.location.pathname).toBe('/verificare-cod');
    expect(screen.queryByTestId('dashboard-page')).toBeNull();
    await user.type(screen.getByTestId('second-factor-code'), '123456');
    await user.click(screen.getByTestId('second-factor-submit'));

    await screen.findByTestId('dashboard-page');
    expect(auth.client.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-one',
      code: '123456',
    });
  });

  it('lets an account without one straight through', async () => {
    const auth = authFixture();
    signsInAs(auth);
    mountApp(auth.client, '/autentificare');

    await signIn();

    await screen.findByTestId('dashboard-page');
    expect(screen.queryByTestId('second-factor-page')).toBeNull();
    expect(auth.client.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('keeps a session that has only the password out of the app, and returns to the page asked for', async () => {
    const auth = authFixture(withFactor(makeSession()));
    const runtime = mountApp(auth.client, '/dashboard?tab=azi');
    const user = userEvent.setup();

    await screen.findByTestId('second-factor-page');
    expect(runtime.router.state.location.search).toEqual({ redirect: '/dashboard?tab=azi' });
    await user.type(screen.getByTestId('second-factor-code'), '123456');
    await user.click(screen.getByTestId('second-factor-submit'));

    await screen.findByTestId('dashboard-page');
    expect(runtime.router.state.location.href).toBe('/dashboard?tab=azi');
  });

  it('explains a wrong code and lets the person try again', async () => {
    const auth = authFixture(withFactor(makeSession()));
    const runtime = mountApp(auth.client, '/dashboard');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('second-factor-code'), '000000');
    await user.click(screen.getByTestId('second-factor-submit'));

    expect((await screen.findByTestId('second-factor-code-error')).textContent).toBe(
      'Codul nu este corect sau a expirat. Introdu codul afișat acum în aplicație.'
    );
    expect(runtime.router.state.location.pathname).toBe('/verificare-cod');
    expect((screen.getByTestId('second-factor-code') as HTMLInputElement).value).toBe('');

    await user.type(screen.getByTestId('second-factor-code'), '123456');
    await user.click(screen.getByTestId('second-factor-submit'));
    await screen.findByTestId('dashboard-page');
  });

  it('never continues to another site', async () => {
    const auth = authFixture(withFactor(makeSession()));
    const runtime = mountApp(auth.client, '/verificare-cod?redirect=//evil.example/');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('second-factor-code'), '123456');
    await user.click(screen.getByTestId('second-factor-submit'));

    await screen.findByTestId('dashboard-page');
    expect(runtime.router.state.location.pathname).toBe('/dashboard');
  });

  it('after a recovery link, asks for the code before the new password is saved', async () => {
    const auth = authFixture();
    const recovered = withFactor(makeSession());
    auth.client.verifyOtp.mockImplementation(async () => {
      auth.emit('SIGNED_IN', recovered);
      return { data: { session: recovered }, error: null };
    });
    const runtime = mountApp(auth.client, '/resetare-parola?token_hash=hash-abc');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('reset-password'), 'ParolaNoua1');
    await user.click(screen.getByTestId('reset-submit'));

    await screen.findByTestId('second-factor-page');
    expect(auth.client.updateUser).not.toHaveBeenCalled();
    await user.type(screen.getByTestId('second-factor-code'), '123456');
    await user.click(screen.getByTestId('second-factor-submit'));

    await screen.findByTestId('reset-password-page');
    expect(runtime.router.state.location.pathname).toBe('/resetare-parola');
    await user.type(screen.getByTestId('reset-password'), 'ParolaNoua1');
    await user.click(screen.getByTestId('reset-submit'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(auth.client.verifyOtp).toHaveBeenCalledOnce();
    expect(auth.client.updateUser).toHaveBeenCalledWith({ password: 'ParolaNoua1' });
  });

  it('still knows the link was used when the code page is reloaded during a reset', async () => {
    const auth = authFixture();
    const recovered = withFactor(makeSession());
    auth.client.verifyOtp.mockImplementation(async () => {
      auth.emit('SIGNED_IN', recovered);
      return { data: { session: recovered }, error: null };
    });
    mountApp(auth.client, '/resetare-parola?token_hash=hash-abc');
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('reset-password'), 'ParolaNoua1');
    await user.click(screen.getByTestId('reset-submit'));
    await screen.findByTestId('second-factor-page');

    disposeRuntimes();
    cleanup();
    const reloaded = authFixture(recovered);
    const runtime = mountApp(reloaded.client, '/verificare-cod?redirect=/resetare-parola');
    await user.type(await screen.findByTestId('second-factor-code'), '123456');
    await user.click(screen.getByTestId('second-factor-submit'));

    await screen.findByTestId('reset-password-page');
    await user.type(screen.getByTestId('reset-password'), 'ParolaNoua1');
    await user.click(screen.getByTestId('reset-submit'));
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(reloaded.client.verifyOtp).not.toHaveBeenCalled();
    expect(reloaded.client.updateUser).toHaveBeenCalledWith({ password: 'ParolaNoua1' });
    expect(sessionStorage.length).toBe(0);
  });

  it('tells a person whose session ended to sign in again, and sends them there once it is gone', async () => {
    const auth = authFixture(withFactor(makeSession()));
    auth.client.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: { message: 'Session not found', code: 'session_not_found', status: 403 },
    });
    const runtime = mountApp(auth.client, '/dashboard');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('second-factor-code'), '123456');
    await user.click(screen.getByTestId('second-factor-submit'));

    expect((await screen.findByTestId('second-factor-code-error')).textContent).toBe(
      'Sesiunea ta a expirat. Autentifică-te din nou pentru a continua.'
    );
    auth.emit('SIGNED_OUT', null);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/autentificare'));
  });

  it('does not let a signed-in session set a password on the reset page without a link', async () => {
    const auth = authFixture(makeSession());
    mountApp(auth.client, '/resetare-parola');

    await screen.findByTestId('reset-password-invalid');
  });
});
