import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const invitation = {
  organizationName: 'Protect SSM',
  email: 'ion@example.test',
  role: 'specialist',
  status: 'open',
  inviterName: 'Ana Popescu',
  accountExists: false,
  expiresAt: '2026-09-25T10:00:00.000Z',
};

const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM' };

const conflict = (reason: string) =>
  Response.json({ error: 'conflict', message: 'Conflict', reason }, { status: 409 });

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  lookup = () => Response.json(invitation),
  accept = () =>
    Response.json({ organizationId: organization.id, email: invitation.email }, { status: 201 }),
  join = () => Response.json({ organizationId: organization.id, email: invitation.email }),
  profile = null as { fullName: string } | null,
}: {
  lookup?: () => Response;
  accept?: () => Response;
  join?: () => Response;
  profile?: { fullName: string } | null;
} = {}) {
  let member = false;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/invitations/lookup') return lookup();
    if (pathname === '/invitations/accept') {
      const response = accept();
      member = response.ok;
      return response;
    }
    if (pathname === '/invitations/join') {
      const response = join();
      member = response.ok;
      return response;
    }
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-ion', email: invitation.email },
        profile: profile && { ...profile, termsVersion: null, termsAcceptedAt: null },
        membership: member ? { organization, role: 'specialist' } : null,
      });
    }
    if (pathname === '/organization/members') return Response.json({ items: [] });
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${pathname}`);
  });
}

const bodies = (pathname: string) =>
  fetchMock.mock.calls
    .filter(([input]) => new URL(String(input)).pathname === pathname)
    .map(([, init]) => JSON.parse(init?.body as string));

const path = '/accept-invitation?token=tok-123';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('accept invitation: a person without an account', () => {
  it('describes the invitation without accepting anything', async () => {
    mockApi();
    mountApp(authFixture().client, path);

    // The page is looked up after the form shows: the loading state is a different element.
    await screen.findByTestId('accept-submit');
    const page = screen.getByTestId('accept-invitation-page');
    expect(page.textContent).toContain('Alătură-te echipei Protect SSM');
    expect(page.textContent).toContain('Ana Popescu te invită');
    expect(page.textContent).toContain('ca specialist');
    expect(page.textContent).toContain('25 sept. 2026');
    expect((screen.getByTestId('accept-email') as HTMLInputElement).value).toBe('ion@example.test');
    expect(bodies('/invitations/lookup')).toEqual([{ token: 'tok-123' }]);
    expect(bodies('/invitations/accept')).toEqual([]);
  });

  it('creates the account, signs in with the typed password, and opens the app', async () => {
    mockApi();
    const auth = authFixture();
    auth.client.signInWithPassword.mockResolvedValue({
      data: { session: makeSession('user-ion', invitation.email) },
      error: null,
    });
    const runtime = mountApp(auth.client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('accept-full-name'), 'Ion Ionescu');
    await user.type(screen.getByTestId('accept-password'), 'Parola123');
    await user.click(screen.getByTestId('accept-submit'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(bodies('/invitations/accept')).toEqual([
      { token: 'tok-123', fullName: 'Ion Ionescu', password: 'Parola123', termsVersion: '2026-09' },
    ]);
    expect(auth.client.signInWithPassword).toHaveBeenCalledWith({
      email: 'ion@example.test',
      password: 'Parola123',
    });
  });

  it.each([
    ['parolamea1', 'literă mare'],
    ['Ab1', 'cel puțin 8 caractere'],
    ['FaraCifre', 'o cifră'],
  ])('rejects the weak password %s before calling the API', async (password, message) => {
    mockApi();
    mountApp(authFixture().client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('accept-full-name'), 'Ion Ionescu');
    await user.type(screen.getByTestId('accept-password'), password);
    await user.click(screen.getByTestId('accept-submit'));

    expect((await screen.findByTestId('accept-password-error')).textContent).toContain(message);
    expect(bodies('/invitations/accept')).toEqual([]);
  });

  it('explains an invitation that was revoked while the form was open', async () => {
    mockApi({ accept: () => conflict('invitation_revoked') });
    mountApp(authFixture().client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('accept-full-name'), 'Ion Ionescu');
    await user.type(screen.getByTestId('accept-password'), 'Parola123');
    await user.click(screen.getByTestId('accept-submit'));

    expect((await screen.findByTestId('accept-error')).textContent).toMatch(/revocată între timp/);
  });

  it('sends the person to login when the account exists but signing in failed', async () => {
    mockApi();
    const runtime = mountApp(authFixture().client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('accept-full-name'), 'Ion Ionescu');
    await user.type(screen.getByTestId('accept-password'), 'Parola123');
    await user.click(screen.getByTestId('accept-submit'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/login'));
  });
});

describe('accept invitation: links that cannot be accepted', () => {
  it.each([
    ['expired', 'Invitația a expirat'],
    ['revoked', 'Invitația a fost revocată'],
    ['accepted', 'Invitația a fost deja acceptată'],
  ])('explains an %s invitation and shows no form', async (status, title) => {
    mockApi({ lookup: () => Response.json({ ...invitation, status }) });
    mountApp(authFixture().client, path);

    expect(await screen.findByRole('heading', { name: title })).toBeTruthy();
    expect(screen.queryByTestId('accept-submit')).toBeNull();
  });

  it('explains an unknown token', async () => {
    mockApi({
      lookup: () => Response.json({ error: 'not_found', message: 'No' }, { status: 404 }),
    });
    mountApp(authFixture().client, path);

    expect(await screen.findByRole('heading', { name: 'Link de invitație invalid' })).toBeTruthy();
  });

  it('explains a link without a token, without calling the API', async () => {
    mockApi();
    mountApp(authFixture().client, '/accept-invitation');

    expect(await screen.findByRole('heading', { name: 'Link de invitație invalid' })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('accept invitation: a person who already has an account', () => {
  it('sends them to login carrying the token, and login brings them back', async () => {
    mockApi({ lookup: () => Response.json({ ...invitation, accountExists: true }) });
    const auth = authFixture();
    auth.client.signInWithPassword.mockResolvedValue({
      data: { session: makeSession('user-ion', invitation.email) },
      error: null,
    });
    const runtime = mountApp(auth.client, path);
    const user = userEvent.setup();

    await screen.findByTestId('accept-has-account');
    expect(screen.queryByTestId('accept-password')).toBeNull();
    await user.click(screen.getByTestId('accept-login'));

    await user.type(await screen.findByTestId('login-email'), invitation.email);
    await user.type(screen.getByTestId('login-password'), 'Parola123');
    await user.click(screen.getByTestId('login-submit'));

    await screen.findByTestId('accept-join');
    expect(runtime.router.state.location.pathname).toBe('/accept-invitation');
    expect(runtime.router.state.location.search).toEqual({ token: 'tok-123' });
  });

  it('joins with the signed-in account, asking for a name only without a profile', async () => {
    mockApi({ lookup: () => Response.json({ ...invitation, accountExists: true }) });
    const runtime = mountApp(authFixture(makeSession('user-ion', invitation.email)).client, path);
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('accept-full-name'), 'Ion Ionescu');
    await user.click(screen.getByTestId('accept-join'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/organization'));
    expect(bodies('/invitations/join')).toEqual([
      { token: 'tok-123', termsVersion: '2026-09', fullName: 'Ion Ionescu' },
    ]);
  });

  it('does not ask for a name when the account has a profile', async () => {
    mockApi({
      lookup: () => Response.json({ ...invitation, accountExists: true }),
      profile: { fullName: 'Ion Ionescu' },
    });
    mountApp(authFixture(makeSession('user-ion', invitation.email)).client, path);
    const user = userEvent.setup();

    const join = await screen.findByTestId('accept-join');
    await waitFor(() => expect((join as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByTestId('accept-full-name')).toBeNull();
    await user.click(join);

    await waitFor(() =>
      expect(bodies('/invitations/join')).toEqual([{ token: 'tok-123', termsVersion: '2026-09' }])
    );
  });

  it('explains that an account can belong to one organization only', async () => {
    mockApi({
      lookup: () => Response.json({ ...invitation, accountExists: true }),
      join: () => conflict('already_in_organization'),
      profile: { fullName: 'Ion Ionescu' },
    });
    mountApp(authFixture(makeSession('user-ion', invitation.email)).client, path);
    const user = userEvent.setup();

    const join = await screen.findByTestId('accept-join');
    await waitFor(() => expect((join as HTMLButtonElement).disabled).toBe(false));
    await user.click(join);

    expect((await screen.findByTestId('accept-error')).textContent).toMatch(
      /poate aparține uneia singure/
    );
  });

  it('asks someone signed in with another address to sign out first', async () => {
    mockApi();
    const auth = authFixture(makeSession('user-one', 'Altcineva@example.test'));
    mountApp(auth.client, path);
    const user = userEvent.setup();

    const signOut = await screen.findByTestId('accept-sign-out');
    expect(screen.getByTestId('accept-invitation-page').textContent).toContain(
      'altcineva@example.test'
    );
    expect(screen.queryByTestId('accept-submit')).toBeNull();
    await user.click(signOut);

    await screen.findByTestId('accept-submit');
    expect(auth.client.signOut).toHaveBeenCalled();
  });
});
