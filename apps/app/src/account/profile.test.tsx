import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM' };

const fetchMock = vi.fn<typeof fetch>();

// The profile the API holds; a successful PATCH changes it, as the real one would.
function mockApi({ fullName = 'Ana Popescu' as string | null, failSave = false } = {}) {
  let saved = fullName;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: saved ? { fullName: saved, termsVersion: null, termsAcceptedAt: null } : null,
        membership: { organization, role: 'specialist' },
      });
    }
    if (pathname === '/me/profile' && init?.method === 'PATCH') {
      if (failSave)
        return Response.json({ error: 'internal_error', message: 'x' }, { status: 500 });
      saved = (JSON.parse(init.body as string) as { fullName: string }).fullName;
      return Response.json({ fullName: saved, termsVersion: null, termsAcceptedAt: null });
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${pathname}`);
  });
}

const saves = () =>
  fetchMock.mock.calls
    .filter(([input, init]) => String(input).endsWith('/me/profile') && init?.method === 'PATCH')
    .map(([, init]) => JSON.parse(init?.body as string));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('profile page', () => {
  it('shows the name, the read-only email, and the organization with the role', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/profile');

    const name = (await screen.findByTestId('profile-full-name')) as HTMLInputElement;
    expect(name.value).toBe('Ana Popescu');
    const email = screen.getByTestId('profile-email') as HTMLInputElement;
    expect(email.value).toBe('review@example.test');
    expect(email.readOnly).toBe(true);
    expect(screen.getByText('Rol: Specialist')).toBeTruthy();
    expect((screen.getByTestId('profile-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves a new name, confirms with a toast, and updates the account menu', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/profile');
    const user = userEvent.setup();

    const name = await screen.findByTestId('profile-full-name');
    await user.clear(name);
    await user.type(name, '  Ana Maria Popescu ');
    await user.click(screen.getByTestId('profile-save'));

    expect(await screen.findByText('Profilul a fost salvat.')).toBeTruthy();
    expect(saves()).toEqual([{ fullName: 'Ana Maria Popescu' }]);
    await waitFor(() =>
      expect(screen.getByTestId('account-name').textContent).toBe('Ana Maria Popescu')
    );
  });

  it('lets an account without a profile name itself', async () => {
    mockApi({ fullName: null });
    mountApp(authFixture(makeSession()).client, '/profile');
    const user = userEvent.setup();

    const name = (await screen.findByTestId('profile-full-name')) as HTMLInputElement;
    expect(name.value).toBe('');
    expect(screen.getByTestId('account-name').textContent).toBe('Contul meu');
    await user.type(name, 'Ion Ionescu');
    await user.click(screen.getByTestId('profile-save'));

    await waitFor(() => expect(screen.getByTestId('account-name').textContent).toBe('Ion Ionescu'));
  });

  it('rejects a name that is too short without calling the API', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/profile');
    const user = userEvent.setup();

    const name = await screen.findByTestId('profile-full-name');
    await user.clear(name);
    await user.type(name, 'A');
    await user.click(screen.getByTestId('profile-save'));

    expect((await screen.findByTestId('profile-full-name-error')).textContent).toBe(
      'Completează numele și prenumele.'
    );
    expect(saves()).toEqual([]);
  });

  it('reports a failed save inline and keeps what was typed', async () => {
    mockApi({ failSave: true });
    mountApp(authFixture(makeSession()).client, '/profile');
    const user = userEvent.setup();

    const name = (await screen.findByTestId('profile-full-name')) as HTMLInputElement;
    await user.clear(name);
    await user.type(name, 'Ana M. Popescu');
    await user.click(screen.getByTestId('profile-save'));

    expect((await screen.findByTestId('profile-error')).textContent).toMatch(
      /Nu am putut salva profilul/
    );
    expect(name.value).toBe('Ana M. Popescu');
  });
});

describe('account menu', () => {
  it('shows the name and the organization, and links to the profile and the organization', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/profile');
    const user = userEvent.setup();

    await waitFor(() =>
      expect(screen.getByTestId('account-organization').textContent).toBe('Protect SSM')
    );
    expect(screen.getByTestId('account-name').textContent).toBe('Ana Popescu');

    await user.click(screen.getByTestId('account-menu'));
    expect((await screen.findByTestId('account-menu-organization')).textContent).toBe(
      'Protect SSM'
    );
    expect(screen.getByTestId('account-profile').getAttribute('href')).toBe('/profile');
    expect(screen.getByTestId('account-organization-link').getAttribute('href')).toBe(
      '/organization'
    );
  });
});
