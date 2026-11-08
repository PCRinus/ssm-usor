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

const noDetails = {
  legalName: null,
  cui: null,
  vatPayer: false,
  tradeRegisterNumber: null,
  countyCode: null,
  locality: null,
  addressLine: null,
  phone: null,
  legalRepresentativeName: null,
  legalRepresentativeRole: null,
  iban: null,
  bankName: null,
};

type Profile = { fullName: string; professionalTitle?: string | null };

function mockApi({
  invitations = [] as unknown[],
  create = () => Response.json({ organization, role: 'owner' }, { status: 201 }),
  profile = null as Profile | null,
  member = false,
  role = 'owner',
  details = noDetails as Record<string, unknown>,
  lookup = () => Response.json({ company: anafCompany }),
  saveDetails = (body: Record<string, unknown>) => Response.json({ companyDetails: body }),
  loadDetails = () => Response.json({ companyDetails: details }),
} = {}) {
  let saved = details;
  let account = profile;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: account && {
          professionalTitle: null,
          ...account,
          termsVersion: null,
          termsAcceptedAt: null,
        },
        membership: member ? { organization, role } : null,
      });
    }
    if (pathname === '/me/invitations') return Response.json({ items: invitations });
    if (pathname === '/me/profile' && method === 'PATCH') {
      account = JSON.parse(init?.body as string) as Profile;
      return Response.json({ ...account, termsVersion: null, termsAcceptedAt: null });
    }
    if (pathname === '/organization' && method === 'POST') {
      const response = create();
      member = response.ok || response.status === 409;
      if (response.ok) account = { fullName: JSON.parse(init?.body as string).fullName };
      return response;
    }
    if (pathname === '/companies/lookup') return lookup();
    if (pathname === '/organization/company-details' && method === 'PUT') {
      const response = saveDetails(JSON.parse(init?.body as string));
      if (response.ok) saved = JSON.parse(init?.body as string);
      return response;
    }
    if (pathname === '/organization/company-details') {
      return saved === details ? loadDetails() : Response.json({ companyDetails: saved });
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

const profileUpdates = () =>
  fetchMock.mock.calls
    .filter(([input, init]) => String(input).endsWith('/me/profile') && init?.method === 'PATCH')
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
    mountApp(auth.client, '/inregistrare');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('register-email'), ' Ion@Example.test ');
    await user.type(screen.getByTestId('register-password'), 'Parola123');
    await user.click(screen.getByTestId('register-submit'));

    expect((await screen.findByTestId('register-sent')).textContent).toContain('Ion@Example.test');
    expect(auth.client.signUp).toHaveBeenCalledWith({
      email: 'Ion@Example.test',
      password: 'Parola123',
      options: { captchaToken: 'turnstile-token-1' },
    });
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'signed_up', {
      method: 'password',
    });
  });

  it('applies the password rules before calling Supabase', async () => {
    const auth = authFixture();
    mountApp(auth.client, '/inregistrare');
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
    mountApp(auth.client, '/inregistrare');
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
    mountApp(authFixture().client, '/autentificare');

    await screen.findByTestId('login-page');
    expect(screen.queryByTestId('login-register')).toBeNull();
  });

  it('is linked from the login page when the build flag is on', async () => {
    vi.stubEnv('VITE_REGISTRATION_LINK', 'true');
    mountApp(authFixture().client, '/autentificare');

    expect((await screen.findByTestId('login-register')).getAttribute('href')).toBe(
      '/inregistrare'
    );
  });
});

describe('confirm email', () => {
  const path = '/confirmare-email?token_hash=hash-abc';

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
    expect(runtime.router.state.location.pathname).toBe('/configurare');
    expect(auth.client.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-abc', type: 'email' });
  });

  it('explains a used or expired link', async () => {
    mountApp(authFixture().client, path);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('confirm-submit'));

    await screen.findByTestId('confirm-email-invalid');
    expect(screen.getByTestId('confirm-go-login').getAttribute('href')).toBe('/autentificare');
  });
});

describe('onboarding', () => {
  const mount = () => mountApp(authFixture(makeSession()).client, '/configurare');

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
    if (accept) {
      await user.click(screen.getByTestId('onboarding-dpa'));
      await user.click(screen.getByTestId('onboarding-terms'));
    }
    await user.click(screen.getByTestId('onboarding-submit'));
  }

  it('creates the organization with the accepted terms version and goes on to who signs', async () => {
    const runtime = mount();
    const user = userEvent.setup();

    await fill(user);

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/configurare/cine-semneaza')
    );
    expect(created()).toEqual([
      {
        fullName: 'Ana Popescu',
        organizationName: 'Protect SSM SRL',
        termsVersion: '2026-11-01',
        acceptsSpecialClauses: true,
      },
    ]);
    expect((await screen.findByTestId('onboarding-created')).textContent).toContain(
      'Protect SSM SRL'
    );
    expect(savedDetails()).toEqual([]);
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'organization_created', {
      with_cui: false,
      details_from_anaf: false,
    });
  });

  it('names the organization after the ANAF record and saves what ANAF gives', async () => {
    mockApi({
      lookup: () =>
        Response.json({
          company: { ...anafCompany, phone: '0256 000 111', iban: 'RO92BTRLRONCRT0581930101' },
        }),
    });
    const runtime = mount();
    const user = userEvent.setup();

    await fill(user, { cui: 'RO1590082', lookup: true, name: '' });

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/configurare/cine-semneaza')
    );
    expect(created()).toEqual([
      {
        fullName: 'Ana Popescu',
        organizationName: 'OMV PETROM SA',
        termsVersion: '2026-11-01',
        acceptsSpecialClauses: true,
      },
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
        phone: '0256 000 111',
        legalRepresentativeName: null,
        legalRepresentativeRole: null,
        iban: 'RO92BTRLRONCRT0581930101',
        bankName: 'Banca Transilvania',
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

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/configurare/cine-semneaza')
    );
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

  it('goes on and points to the firm details when saving them fails', async () => {
    mockApi({
      saveDetails: () => Response.json({ error: 'internal_error', message: 'x' }, { status: 500 }),
    });
    const runtime = mount();
    const user = userEvent.setup();

    await fill(user, { cui: '1590082', lookup: true, name: '' });

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/configurare/cine-semneaza')
    );
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

  it('requires the data processing agreement to be accepted on its own', async () => {
    mount();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('onboarding-full-name'), 'Ana Popescu');
    await user.type(screen.getByTestId('onboarding-organization'), 'Protect SSM SRL');
    await user.click(screen.getByTestId('onboarding-terms'));
    await user.click(screen.getByTestId('onboarding-submit'));

    expect((await screen.findByTestId('onboarding-dpa-error')).textContent).toMatch(
      /acordul de prelucrare a datelor/
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
    const runtime = mountApp(auth.client, '/configurare');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('onboarding-sign-out'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/autentificare'));
    expect(auth.client.signOut).toHaveBeenCalled();
  });

  it('sends a signed-out visitor to login', async () => {
    const runtime = mountApp(authFixture().client, '/configurare');

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/autentificare'));
  });
});

describe('onboarding search', () => {
  const mount = () => mountApp(authFixture(makeSession()).client, '/configurare');

  it('leads with the ANAF search until it runs, then with creating the organization', async () => {
    mount();
    const user = userEvent.setup();

    const lookup = await screen.findByTestId('onboarding-lookup');
    expect(lookup.getAttribute('data-variant')).toBe('default');
    expect(screen.getByTestId('onboarding-submit').getAttribute('data-variant')).toBe('outline');

    await user.type(screen.getByTestId('onboarding-cui'), '1590082');
    await user.click(lookup);
    const status = await screen.findByTestId('onboarding-lookup-status');

    expect(lookup.textContent).toBe('Caută din nou');
    expect(lookup.getAttribute('data-variant')).toBe('outline');
    expect(screen.getByTestId('onboarding-submit').getAttribute('data-variant')).toBe('default');
    expect(status.textContent).toContain(
      'Am preluat de la ANAF denumirea, sediul și numărul de la registrul comerțului pentru OMV PETROM SA.'
    );
    expect(status.textContent).toContain(
      'Reprezentantul legal și contul bancar nu sunt la ANAF. Le completezi în pașii următori.'
    );
  });

  it('names the phone and the account when ANAF has them', async () => {
    mockApi({
      lookup: () =>
        Response.json({
          company: { ...anafCompany, phone: '0256 000 111', iban: 'RO92BTRLRONCRT0581930101' },
        }),
    });
    mount();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('onboarding-cui'), '1590082');
    await user.click(screen.getByTestId('onboarding-lookup'));
    const status = await screen.findByTestId('onboarding-lookup-status');

    expect(status.textContent).toContain(
      'numărul de la registrul comerțului, telefonul și contul bancar'
    );
    expect(status.textContent).toContain('Reprezentantul legal nu este la ANAF.');
  });
});

describe('onboarding steps', () => {
  const anafDetails = {
    ...noDetails,
    cui: '1590082',
    legalName: 'PROTECT SSM SRL',
    countyCode: 'TM',
    locality: 'Timișoara',
    addressLine: 'Str. Florilor 1',
    phone: '0256 000 111',
  };

  const mountStep = (path: string, options: Parameters<typeof mockApi>[0] = {}) => {
    mockApi({
      member: true,
      profile: { fullName: 'Ana Popescu' },
      details: anafDetails,
      ...options,
    });
    return mountApp(authFixture(makeSession()).client, path);
  };

  it('fills the representative with the person, and empties it when they are not', async () => {
    mountStep('/configurare/cine-semneaza');
    const user = userEvent.setup();

    const name = await screen.findByTestId<HTMLInputElement>('onboarding-representative-name');
    const isMe = screen.getByTestId('onboarding-representative-is-me');
    expect(name.value).toBe('Ana Popescu');
    expect(isMe.getAttribute('aria-checked')).toBe('true');

    await user.click(isMe);
    expect(name.value).toBe('');
    await user.click(isMe);
    expect(name.value).toBe('Ana Popescu');

    await user.type(name, 'x');
    expect(isMe.getAttribute('aria-checked')).toBe('false');
  });

  it('saves the representative over what step 1 saved, and the title on the profile', async () => {
    const runtime = mountStep('/configurare/cine-semneaza');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('onboarding-representative-role'), 'Administrator');
    await user.type(screen.getByTestId('onboarding-professional-title'), 'Inspector SSM');
    await user.click(screen.getByTestId('onboarding-continue'));

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/configurare/contract')
    );
    expect(savedDetails()).toEqual([
      {
        ...anafDetails,
        legalRepresentativeName: 'Ana Popescu',
        legalRepresentativeRole: 'Administrator',
      },
    ]);
    expect(profileUpdates()).toEqual([
      { fullName: 'Ana Popescu', professionalTitle: 'Inspector SSM' },
    ]);
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'onboarding_step_completed', {
      step: 2,
      skipped_rest: false,
    });
  });

  it('shows a field error only on Continuă, and saves nothing when skipped', async () => {
    const runtime = mountStep('/configurare/cine-semneaza');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('onboarding-representative-role'), 'A');
    expect(screen.queryByTestId('onboarding-representative-role-error')).toBeNull();
    await user.click(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByTestId('onboarding-representative-role-error')).toBeTruthy();

    await user.click(screen.getByTestId('onboarding-later'));

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/configurare/contract')
    );
    expect(savedDetails()).toEqual([]);
    expect(profileUpdates()).toEqual([]);
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'onboarding_step_skipped', {
      step: 2,
      skipped_rest: false,
    });
  });

  it('enters the app from step 2 when the rest is skipped', async () => {
    const runtime = mountStep('/configurare/cine-semneaza');
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('onboarding-skip-rest'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(savedDetails()).toEqual([]);
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'onboarding_step_skipped', {
      step: 2,
      skipped_rest: true,
    });
  });

  it('prefills the phone from ANAF, names the bank from the IBAN, and keeps the rest', async () => {
    const runtime = mountStep('/configurare/contract', {
      details: { ...anafDetails, legalRepresentativeName: 'Ana Popescu' },
    });
    const user = userEvent.setup();

    expect((await screen.findByTestId<HTMLInputElement>('onboarding-phone')).value).toBe(
      '0256 000 111'
    );
    expect(screen.getByTestId('onboarding-contract-page').textContent).toContain(
      'telefonul l-am găsit, contul bancar nu'
    );
    await user.type(screen.getByTestId('onboarding-iban'), 'RO92 BTRL RONC RT05 8193 0101');
    expect(screen.getByTestId<HTMLInputElement>('onboarding-bank').value).toBe(
      'Banca Transilvania'
    );
    await user.click(screen.getByTestId('onboarding-continue'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(savedDetails()).toEqual([
      {
        ...anafDetails,
        legalRepresentativeName: 'Ana Popescu',
        iban: 'RO92 BTRL RONC RT05 8193 0101',
        bankName: 'Banca Transilvania',
      },
    ]);
    expect(captured).toHaveBeenCalledExactlyOnceWith('user-one', 'onboarding_step_completed', {
      step: 3,
      skipped_rest: false,
    });
  });

  it('keeps a reload on the step instead of sending the member to the app', async () => {
    const runtime = mountStep('/configurare/contract');

    expect(await screen.findByTestId('onboarding-contract-page')).toBeTruthy();
    expect(runtime.router.state.location.pathname).toBe('/configurare/contract');
  });

  it('sends a specialist who opens a step to the app', async () => {
    const runtime = mountStep('/configurare/cine-semneaza', { role: 'specialist' });

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
  });

  it('sends an account without an organization to step 1', async () => {
    const runtime = mountApp(authFixture(makeSession()).client, '/configurare/contract');

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/configurare'));
  });

  it('still sends a member who opens step 1 to the app', async () => {
    const runtime = mountStep('/configurare');

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
  });
});
