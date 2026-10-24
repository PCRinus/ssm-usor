import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const captured = vi.hoisted(() => vi.fn());
vi.mock('@/app/observability/posthog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/observability/posthog')>()),
  captureAsMember: captured,
}));

const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM SRL' };

const fetchMock = vi.fn<typeof fetch>();

const anafCompany = {
  cui: '1590082',
  legalName: 'OMV PETROM SA',
  vatPayer: true,
  caenCode: '0610',
  tradeRegisterNumber: 'J1997008302407',
  countyCode: 'B',
  locality: 'Sector 1 Mun. București',
  addressLine: 'Str. Coralilor, nr. 22',
  registrationStatus: 'INREGISTRAT din data 23.10.1997',
  inactive: false,
};

function mockApi({
  invitations = [] as unknown[],
  create = () => Response.json({ organization, role: 'owner' }, { status: 201 }),
  profile = null as { fullName: string } | null,
  lookup = () => Response.json({ company: anafCompany }),
  saveDetails = (body: unknown) => Response.json({ companyDetails: body }),
} = {}) {
  let member = false;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: profile && { ...profile, termsVersion: null, termsAcceptedAt: null },
        membership: member ? { organization, role: 'owner' } : null,
      });
    }
    if (pathname === '/me/invitations') return Response.json({ items: invitations });
    if (pathname === '/organization' && method === 'POST') {
      const response = create();
      member = response.ok || response.status === 409;
      return response;
    }
    if (pathname === '/companies/lookup') return lookup();
    if (pathname === '/organization/company-details' && method === 'PUT') {
      return saveDetails(JSON.parse(init?.body as string));
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const created = () =>
  fetchMock.mock.calls
    .filter(([input, init]) => String(input).endsWith('/organization') && init?.method === 'POST')
    .map(([, init]) => JSON.parse(init?.body as string));

const savedDetails = () =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        String(input).endsWith('/organization/company-details') && init?.method === 'PUT'
    )
    .map(([, init]) => JSON.parse(init?.body as string));

const authError = (code: string) => ({ message: code, code });

beforeEach(() => {
  captured.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mockApi();
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('register', () => {
  it('signs up with Supabase and says to check the email, whoever the address belongs to', async () => {
    const auth = authFixture();
    mountApp(auth.client, '/register');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('register-email'), ' Ion@Example.test ');
    await user.type(screen.getByTestId('register-password'), 'Parola123');
    await user.click(screen.getByTestId('register-submit'));

    expect((await screen.findByTestId('register-sent')).textContent).toContain('Ion@Example.test');
    expect(auth.client.signUp).toHaveBeenCalledWith({
      email: 'Ion@Example.test',
      password: 'Parola123',
    });
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'signed_up', {
      method: 'password',
    });
  });

  it('applies the password rules before calling Supabase', async () => {
    const auth = authFixture();
    mountApp(auth.client, '/register');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('register-email'), 'ion@example.test');
    await user.type(screen.getByTestId('register-password'), 'faramajuscule1');
    await user.click(screen.getByTestId('register-submit'));

    expect((await screen.findByTestId('register-password-error')).textContent).toContain(
      'literă mare'
    );
    expect(auth.client.signUp).not.toHaveBeenCalled();
  });

  it('says so when registration is switched off', async () => {
    const auth = authFixture();
    auth.client.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: authError('signup_disabled'),
    });
    mountApp(auth.client, '/register');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('register-email'), 'ion@example.test');
    await user.type(screen.getByTestId('register-password'), 'Parola123');
    await user.click(screen.getByTestId('register-submit'));

    expect((await screen.findByTestId('register-error')).textContent).toMatch(
      /nu este disponibilă momentan/
    );
    expect(captured).not.toHaveBeenCalled();
  });

  it('is not linked from the login page unless the build flag is on', async () => {
    mountApp(authFixture().client, '/login');

    await screen.findByTestId('login-page');
    expect(screen.queryByTestId('login-register')).toBeNull();
  });

  it('is linked from the login page when the build flag is on', async () => {
    vi.stubEnv('VITE_REGISTRATION_LINK', 'true');
    mountApp(authFixture().client, '/login');

    expect((await screen.findByTestId('login-register')).getAttribute('href')).toBe('/register');
  });
});

describe('confirm email', () => {
  const path = '/confirm-email?token_hash=hash-abc';

  it('does not use the token when the link is merely opened', async () => {
    const auth = authFixture();
    mountApp(auth.client, path);

    await screen.findByTestId('confirm-email-page');
    expect(auth.client.verifyOtp).not.toHaveBeenCalled();
  });

  it('confirms on the button, which signs in and opens onboarding', async () => {
    const auth = authFixture();
    auth.client.verifyOtp.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const runtime = mountApp(auth.client, path);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('confirm-submit'));

    await screen.findByTestId('onboarding-page');
    expect(runtime.router.state.location.pathname).toBe('/onboarding');
    expect(auth.client.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-abc', type: 'email' });
  });

  it('explains a used or expired link', async () => {
    mountApp(authFixture().client, path);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('confirm-submit'));

    await screen.findByTestId('confirm-email-invalid');
    expect(screen.getByTestId('confirm-go-login').getAttribute('href')).toBe('/login');
  });
});

describe('onboarding', () => {
  const mount = () => mountApp(authFixture(makeSession()).client, '/onboarding');

  async function fill(
    user: ReturnType<typeof userEvent.setup>,
    { accept = true, cui = '', lookup = false, name = 'Protect SSM SRL' } = {}
  ) {
    await user.type(await screen.findByTestId('onboarding-full-name'), 'Ana Popescu');
    if (cui) await user.type(screen.getByTestId('onboarding-cui'), cui);
    if (lookup) {
      await user.click(screen.getByTestId('onboarding-lookup'));
      await screen.findByTestId('onboarding-lookup-status');
    }
    if (name) await user.type(screen.getByTestId('onboarding-organization'), name);
    if (accept) await user.click(screen.getByTestId('onboarding-terms'));
    await user.click(screen.getByTestId('onboarding-submit'));
  }

  it('creates the organization with the accepted terms version and opens the app', async () => {
    const runtime = mount();
    const user = userEvent.setup();

    await fill(user);

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(created()).toEqual([
      { fullName: 'Ana Popescu', organizationName: 'Protect SSM SRL', termsVersion: '2026-09-23' },
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('account-organization').textContent).toBe('Protect SSM SRL')
    );
    expect(savedDetails()).toEqual([]);
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'organization_created', {
      with_cui: false,
      details_from_anaf: false,
    });
  });

  it('names the organization after the ANAF record and saves what ANAF gives', async () => {
    const runtime = mount();
    const user = userEvent.setup();

    await fill(user, { cui: 'RO1590082', lookup: true, name: '' });

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(created()).toEqual([
      { fullName: 'Ana Popescu', organizationName: 'OMV PETROM SA', termsVersion: '2026-09-23' },
    ]);
    expect(savedDetails()).toEqual([
      {
        cui: '1590082',
        legalName: 'OMV PETROM SA',
        vatPayer: true,
        tradeRegisterNumber: 'J1997008302407',
        countyCode: 'B',
        locality: 'Sector 1 Mun. București',
        addressLine: 'Str. Coralilor, nr. 22',
        phone: null,
        legalRepresentativeName: null,
        legalRepresentativeRole: null,
        iban: null,
        bankName: null,
      },
    ]);
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'organization_created', {
      with_cui: true,
      details_from_anaf: true,
    });
  });

  it('keeps the name the person edits after the lookup', async () => {
    mount();
    const user = userEvent.setup();

    await fill(user, { cui: '1590082', lookup: true, name: ' Energie' });

    await waitFor(() => expect(created()).toHaveLength(1));
    expect(created()[0].organizationName).toBe('OMV PETROM SA Energie');
  });

  it('saves the CUI alone when ANAF has no record of it', async () => {
    mockApi({
      lookup: () => Response.json({ error: 'not_found', message: 'x' }, { status: 404 }),
    });
    const runtime = mount();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('onboarding-cui'), '1590082');
    await user.click(screen.getByTestId('onboarding-lookup'));
    expect((await screen.findByTestId('onboarding-lookup-status')).textContent).toMatch(
      /Nu am găsit nicio companie/
    );
    await fill(user);

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(savedDetails()).toEqual([
      expect.objectContaining({ cui: '1590082', legalName: null, vatPayer: false, locality: null }),
    ]);
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'organization_created', {
      with_cui: true,
      details_from_anaf: false,
    });
  });

  it('ignores a lookup made for another CUI than the one submitted', async () => {
    mount();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('onboarding-cui'), '1590082');
    await user.click(screen.getByTestId('onboarding-lookup'));
    await screen.findByTestId('onboarding-lookup-status');
    await user.clear(screen.getByTestId('onboarding-cui'));
    await user.type(screen.getByTestId('onboarding-cui'), '14399840');
    await fill(user);

    await waitFor(() => expect(savedDetails()).toHaveLength(1));
    expect(savedDetails()[0]).toMatchObject({ cui: '14399840', legalName: null });
    expect(screen.queryByTestId('onboarding-lookup-status')).toBeNull();
  });

  it('rejects an invalid CUI', async () => {
    mount();
    const user = userEvent.setup();

    await fill(user, { cui: '1590083' });

    expect((await screen.findByTestId('onboarding-cui-error')).textContent).toMatch(/CUI invalid/);
    expect(created()).toEqual([]);
  });

  it('opens the app and points to the firm details when saving them fails', async () => {
    mockApi({
      saveDetails: () => Response.json({ error: 'internal_error', message: 'x' }, { status: 500 }),
    });
    const runtime = mount();
    const user = userEvent.setup();

    await fill(user, { cui: '1590082', lookup: true, name: '' });

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(
      await screen.findByText(/nu am putut salva datele firmei/, { exact: false })
    ).toBeTruthy();
    expect(created()).toHaveLength(1);
  });

  it('does not touch the details of an organization the account already belongs to', async () => {
    mockApi({
      create: () =>
        Response.json(
          { error: 'conflict', message: 'x', reason: 'already_in_organization' },
          { status: 409 }
        ),
    });
    const runtime = mount();
    const user = userEvent.setup();

    await fill(user, { cui: '1590082', lookup: true });

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(savedDetails()).toEqual([]);
    expect(captured).not.toHaveBeenCalled();
  });

  it('requires the terms to be accepted', async () => {
    mount();
    const user = userEvent.setup();

    await fill(user, { accept: false });

    expect((await screen.findByTestId('onboarding-terms-error')).textContent).toMatch(
      /trebuie să accepți termenii/
    );
    expect(created()).toEqual([]);
  });

  it('points out a pending invitation before an organization is created', async () => {
    mockApi({
      invitations: [
        {
          organizationName: 'Alt SSM SRL',
          inviterName: 'Ion Ionescu',
          role: 'specialist',
          expiresAt: '2026-09-25T10:00:00.000Z',
        },
      ],
    });
    mount();

    const notice = await screen.findByTestId('onboarding-invitations');
    expect(notice.textContent).toContain('Alt SSM SRL');
    expect(notice.textContent).toContain('de la Ion Ionescu');
    expect(notice.textContent).toContain('linkul din emailul de invitație');
  });

  it('prefills the name of an account that already has a profile', async () => {
    mockApi({ profile: { fullName: 'Ana Popescu' } });
    mount();

    expect(((await screen.findByTestId('onboarding-full-name')) as HTMLInputElement).value).toBe(
      'Ana Popescu'
    );
  });

  it('reports a failure inline and keeps what was typed', async () => {
    mockApi({
      create: () => Response.json({ error: 'internal_error', message: 'x' }, { status: 500 }),
    });
    mount();
    const user = userEvent.setup();

    await fill(user);

    expect((await screen.findByTestId('onboarding-error-message')).textContent).toMatch(
      /Nu am putut crea organizația/
    );
    expect((screen.getByTestId('onboarding-organization') as HTMLInputElement).value).toBe(
      'Protect SSM SRL'
    );
  });

  it('lets the person sign out instead', async () => {
    const auth = authFixture(makeSession());
    const runtime = mountApp(auth.client, '/onboarding');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('onboarding-sign-out'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/login'));
    expect(auth.client.signOut).toHaveBeenCalled();
  });

  it('sends a signed-out visitor to login', async () => {
    const runtime = mountApp(authFixture().client, '/onboarding');

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/login'));
  });
});
