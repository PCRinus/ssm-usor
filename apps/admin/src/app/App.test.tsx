import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthClient } from '@/features/auth/auth-store';
import {
  adminSession,
  fetchMock,
  installAdminFetch,
  mockAdminApi,
  mountAdmin,
} from '@/test/admin-app';

function fakeClient(initial: Session | null, afterSignIn: Session, afterVerify: Session) {
  let current = initial;
  let emit: (event: AuthChangeEvent, session: Session | null) => void = () => {};
  const client = {
    getSession: vi.fn(async () => ({ data: { session: current }, error: null })),
    onAuthStateChange: vi.fn((callback: typeof emit) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn<AuthClient['signInWithPassword']>(async ({ password }) => {
      if (password !== 'right password') {
        return {
          data: { session: null },
          error: { message: 'Invalid login credentials', status: 400 },
        };
      }
      current = afterSignIn;
      return { data: { session: current }, error: null };
    }),
    signOut: vi.fn(async () => {
      current = null;
      return { error: null };
    }),
    mfa: {
      listFactors: vi.fn<AuthClient['mfa']['listFactors']>(async () => ({
        data: { all: current?.user.factors ?? [] },
        error: null,
      })),
      unenroll: vi.fn(async () => ({ error: null })),
      enroll: vi.fn<AuthClient['mfa']['enroll']>(async () => ({
        data: {
          id: 'factor-2',
          totp: { qr_code: 'data:image/svg+xml;utf-8,<svg></svg>', secret: 'JBSWY3DPEHPK3PXP' },
        },
        error: null,
      })),
      challengeAndVerify: vi.fn<AuthClient['mfa']['challengeAndVerify']>(async ({ code }) => {
        if (code !== '123456') return { data: null, error: { message: 'Invalid', status: 422 } };
        current = afterVerify;
        emit('MFA_CHALLENGE_VERIFIED', current);
        return { data: {}, error: null };
      }),
    },
  } satisfies AuthClient;
  return client;
}

installAdminFetch();

beforeEach(() => mockAdminApi(() => undefined));

describe('the admin sign-in', () => {
  it('enrols an authenticator after the first password sign-in, then opens the home page', async () => {
    mockAdminApi((url) =>
      url.pathname === '/api/me'
        ? Response.json({ id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'mircea@example.ro' })
        : undefined
    );
    const client = fakeClient(null, adminSession('aal1'), adminSession('aal2', 'verified'));
    mountAdmin('/', client);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('email'), 'mircea@example.ro');
    await user.type(screen.getByTestId('password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByTestId('sign-in-error')).textContent).toContain('not right');

    await user.clear(screen.getByTestId('password'));
    await user.type(screen.getByTestId('password'), 'right password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(client.signInWithPassword).toHaveBeenLastCalledWith({
      email: 'mircea@example.ro',
      password: 'right password',
      options: { captchaToken: 'turnstile-token-2' },
    });

    expect((await screen.findByTestId('enrol-secret')).textContent).toContain('JBSWY3DPEHPK3PXP');
    expect(client.mfa.enroll).toHaveBeenCalledTimes(1);

    await user.type(screen.getByTestId('code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    await screen.findByTestId('code-error');

    await user.type(screen.getByTestId('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));
    expect(client.mfa.challengeAndVerify).toHaveBeenLastCalledWith({
      factorId: 'factor-2',
      code: '123456',
    });

    expect((await screen.findByTestId('admin-email')).textContent).toContain('mircea@example.ro');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:5176/api/me');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Bearer ${adminSession('aal2').access_token}`
    );
    expect(init?.credentials).toBe('same-origin');
  });

  it('removes a factor left unverified before enrolling again', async () => {
    const client = fakeClient(
      adminSession('aal1', 'unverified'),
      adminSession('aal1'),
      adminSession('aal2')
    );
    mountAdmin('/enrol', client);

    await screen.findByTestId('enrol-qr');
    expect(client.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
  });

  it('asks for a code when the account already has an authenticator', async () => {
    mockAdminApi((url) =>
      url.pathname === '/api/me'
        ? Response.json({ id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'mircea@example.ro' })
        : undefined
    );
    const client = fakeClient(
      adminSession('aal1', 'verified'),
      adminSession('aal1', 'verified'),
      adminSession('aal2', 'verified')
    );
    mountAdmin('/', client);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect((await screen.findByTestId('admin-email')).textContent).toContain('mircea@example.ro');
    expect(client.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-1',
      code: '123456',
    });
    expect(client.mfa.enroll).not.toHaveBeenCalled();
  });

  it('keeps an aal1 session away from the home page', async () => {
    const client = fakeClient(
      adminSession('aal1', 'verified'),
      adminSession('aal1', 'verified'),
      adminSession('aal2', 'verified')
    );
    const runtime = mountAdmin('/', client);

    await screen.findByTestId('verify-page');
    expect(runtime.router.state.location.pathname).toBe('/verify');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tells an account without the admin claim that it has no access', async () => {
    mockAdminApi((url) =>
      url.pathname === '/api/me'
        ? Response.json({ error: 'forbidden', message: 'Admins only.' }, { status: 403 })
        : undefined
    );
    const client = fakeClient(
      adminSession('aal2', 'verified'),
      adminSession('aal1'),
      adminSession('aal2')
    );
    mountAdmin('/', client);
    const user = userEvent.setup();

    expect((await screen.findByTestId('no-admin-access')).textContent).toContain(
      'This account has no admin access'
    );

    await user.click(screen.getByTestId('sign-out'));
    await screen.findByTestId('sign-in-page');
    expect(client.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('the admin sections', () => {
  const emptyPage = { items: [], page: 1, pageSize: 25, total: 0 };

  it.each([
    ['imports', 'No import matches these filters.', ['nav-imports']],
    ['legislation', 'No change matches these filters.', ['nav-legislation', 'tab-changes']],
    ['members', 'No members yet.', ['nav-members']],
  ])('opens %s from the home page and marks it current', async (section, empty, current) => {
    mockAdminApi((url) => {
      if (url.pathname === '/api/legislation/changes') return Response.json({ items: [] });
      if (['/api/imports', '/api/members', '/api/impersonations'].includes(url.pathname)) {
        return Response.json(emptyPage);
      }
      return undefined;
    });
    const runtime = mountAdmin('/');

    await userEvent.setup().click(await screen.findByTestId(`home-${section}`));
    await screen.findByText(empty);
    expect(runtime.router.state.location.pathname).toBe(`/${section}`);
    for (const testId of current) {
      expect(screen.getByTestId(testId).getAttribute('aria-current')).toBe('page');
    }
  });
});

it('shows the sign-in as unavailable when the build has no Supabase settings', async () => {
  mountAdmin('/', null as unknown as AuthClient);
  await waitFor(() =>
    expect(screen.getByTestId('auth-unavailable').textContent).toContain('Sign-in is unavailable')
  );
});
