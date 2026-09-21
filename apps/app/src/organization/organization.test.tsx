import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect SSM' };

const meAs = (role: 'owner' | 'specialist' | null) => ({
  user: { id: 'user-one', email: 'review@example.test' },
  profile: { fullName: 'Ana Popescu', termsVersion: null, termsAcceptedAt: null },
  membership: role ? { organization, role } : null,
});

const members = [
  {
    userId: 'user-one',
    email: 'review@example.test',
    fullName: 'Ana Popescu',
    role: 'owner',
    joinedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    userId: 'user-two',
    email: 'ion@example.test',
    fullName: null,
    role: 'specialist',
    joinedAt: '2026-09-10T10:00:00.000Z',
  },
];

const invitation = {
  id: '7a0e4c7e-4a59-4f8e-8d1e-3f1f6f0b9a11',
  email: 'maria@example.test',
  role: 'specialist',
  status: 'open',
  sentAt: '2026-09-18T10:00:00.000Z',
  expiresAt: '2026-09-25T10:00:00.000Z',
  createdAt: '2026-09-18T10:00:00.000Z',
};

const legalDetails = {
  legalName: 'S.C. PROTECT SSM S.R.L.',
  cui: '1590082',
  tradeRegisterNumber: 'J35/1234/2015',
  countyCode: 'TM',
  locality: 'Timișoara',
  addressLine: 'Str. Lungă 5',
  legalRepresentativeName: 'Ana Popescu',
  legalRepresentativeRole: null,
};

const conflict = (reason: string) =>
  Response.json({ error: 'conflict', message: 'Conflict', reason }, { status: 409 });

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

const contractDetails = {
  phone: null,
  iban: 'RO49AAAA1B31007593840000',
  bankName: null,
  authorizationCertificateNumber: null,
  authorizationCertificateDate: null,
  authorizationCertificateIssuer: null,
  vatPayer: false,
  fireSafetyTechnicianName: null,
  fireSafetyTechnicianCertificate: null,
};

function mockApi({
  role = 'owner' as 'owner' | 'specialist' | null,
  invitations = [invitation] as unknown[],
  create = (() => Response.json(invitation, { status: 201 })) as Route,
  resend = (() => Response.json(invitation)) as Route,
  revoke = (() => new Response(null, { status: 204 })) as Route,
  changeRole = (() => new Response(null, { status: 204 })) as Route,
  removeMember = (() => new Response(null, { status: 204 })) as Route,
  saveLegalDetails = (() => Response.json({ legalDetails })) as Route,
  saveContractDetails = (() => Response.json({ contractDetails })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') return Response.json(meAs(role));
    if (pathname === '/me/invitations') return Response.json({ items: [] });
    if (pathname === '/organization/members') return Response.json({ items: members });
    if (pathname === '/organization/legal-details') {
      return method === 'PUT' ? saveLegalDetails(init) : Response.json({ legalDetails });
    }
    if (pathname === '/organization/contract-details') {
      return method === 'PUT' ? saveContractDetails(init) : Response.json({ contractDetails });
    }
    if (pathname === '/organization/members/user-two') {
      return method === 'DELETE' ? removeMember(init) : changeRole(init);
    }
    if (pathname === '/organization/invitations') {
      return method === 'POST' ? create(init) : Response.json({ items: invitations });
    }
    if (pathname.endsWith('/resend')) return resend(init);
    if (pathname.endsWith('/revoke')) return revoke(init);
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

const mount = () => mountApp(authFixture(makeSession()).client, '/organization');

async function openInviteDialog() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId('invite-open'));
  return { user, dialog: await screen.findByTestId('invite-dialog') };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('organization page', () => {
  it('shows the organization, its members, and the pending invitations to an owner', async () => {
    mockApi();
    mount();

    const page = await screen.findByTestId('organization-page');
    expect(within(page).getByRole('heading', { level: 1 }).textContent).toBe('Protect SSM');

    const rows = await screen.findAllByTestId('member-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Ana Popescu')).toBeTruthy();
    expect(within(rows[0]!).getByText('(tu)')).toBeTruthy();
    expect(within(rows[0]!).getByText('Administrator')).toBeTruthy();
    expect(within(rows[1]!).getByText('Fără nume')).toBeTruthy();
    expect(within(rows[1]!).getByText('ion@example.test')).toBeTruthy();

    const pending = await screen.findByTestId('invitation-row');
    expect(within(pending).getByText('maria@example.test')).toBeTruthy();
    expect(within(pending).getByText(/Expiră pe 25 sept\. 2026/)).toBeTruthy();
  });

  it('shows a specialist the members, without invitations or the invite button', async () => {
    mockApi({ role: 'specialist' });
    mount();

    await screen.findAllByTestId('member-row');
    expect(screen.queryByTestId('invite-open')).toBeNull();
    expect(screen.queryByTestId('invitations-card')).toBeNull();
    expect(screen.getByText(/Doar administratorii pot invita membri noi/)).toBeTruthy();
    expect(requests('/organization/invitations')).toHaveLength(0);
  });

  it('sends an account without an organization to onboarding', async () => {
    mockApi({ role: null });
    const runtime = mount();

    await screen.findByTestId('onboarding-page');
    expect(runtime.router.state.location.pathname).toBe('/onboarding');
    expect(requests('/organization/members')).toHaveLength(0);
  });

  it('marks an expired invitation', async () => {
    mockApi({ invitations: [{ ...invitation, status: 'expired' }] });
    mount();

    expect(within(await screen.findByTestId('invitation-row')).getByText('Expirată')).toBeTruthy();
  });
});

describe('inviting a member', () => {
  it('sends the address and the chosen role, confirms with a toast, and refreshes the list', async () => {
    mockApi();
    mount();
    const { user, dialog } = await openInviteDialog();

    await user.type(within(dialog).getByTestId('invite-email'), 'Maria@Example.test');
    await user.selectOptions(within(dialog).getByTestId('invite-role'), 'owner');
    await user.click(within(dialog).getByTestId('invite-submit'));

    expect(await screen.findByText('Invitația a fost trimisă la maria@example.test.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('invite-dialog')).toBeNull());
    const [, init] = requests('/organization/invitations', 'POST')[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'Maria@Example.test',
      role: 'owner',
    });
    await waitFor(() => expect(requests('/organization/invitations')).toHaveLength(2));
  });

  it('validates the address before calling the API', async () => {
    mockApi();
    mount();
    const { user, dialog } = await openInviteDialog();

    await user.type(within(dialog).getByTestId('invite-email'), 'nu-este-email');
    await user.click(within(dialog).getByTestId('invite-submit'));

    expect((await screen.findByTestId('invite-email-error')).textContent).toBe(
      'Adresa de email nu este validă.'
    );
    expect(requests('/organization/invitations', 'POST')).toHaveLength(0);
  });

  it.each([
    ['already_member', 'invite-email-error', /aparține deja unui membru/],
    ['sent_recently', 'invite-email-error', /în ultimele 10 minute/],
    ['too_many_open_invitations', 'invite-error', /20 de invitații în așteptare/],
  ])(
    'words the %s conflict next to its cause and keeps the dialog open',
    async (reason, testId, text) => {
      mockApi({ create: () => conflict(reason) });
      mount();
      const { user, dialog } = await openInviteDialog();

      await user.type(within(dialog).getByTestId('invite-email'), 'ion@example.test');
      await user.click(within(dialog).getByTestId('invite-submit'));

      expect((await screen.findByTestId(testId)).textContent).toMatch(text);
      expect(screen.getByTestId('invite-dialog')).toBeTruthy();
    }
  );

  it('says so when the email could not be sent', async () => {
    mockApi({
      create: () =>
        Response.json({ error: 'service_unavailable', message: 'Mail down' }, { status: 503 }),
    });
    mount();
    const { user, dialog } = await openInviteDialog();

    await user.type(within(dialog).getByTestId('invite-email'), 'ion@example.test');
    await user.click(within(dialog).getByTestId('invite-submit'));

    expect((await screen.findByTestId('invite-error')).textContent).toMatch(
      /nu a putut fi trimisă pe email/
    );
  });
});

describe('pending invitation actions', () => {
  it('resends and confirms with a toast', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('invitation-resend'));

    expect(await screen.findByText('Am retrimis invitația la maria@example.test.')).toBeTruthy();
    expect(requests(`/organization/invitations/${invitation.id}/resend`, 'POST')).toHaveLength(1);
  });

  it('reports a resend made too soon inline', async () => {
    mockApi({ resend: () => conflict('sent_recently') });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('invitation-resend'));

    expect((await screen.findByTestId('invitations-error')).textContent).toMatch(
      /maria@example\.test în ultimele 10 minute/
    );
  });

  it('revokes, confirms with a toast, and refreshes the list', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('invitation-revoke'));

    expect(
      await screen.findByText('Invitația pentru maria@example.test a fost revocată.')
    ).toBeTruthy();
    expect(requests(`/organization/invitations/${invitation.id}/revoke`, 'POST')).toHaveLength(1);
    await waitFor(() => expect(requests('/organization/invitations')).toHaveLength(2));
  });
});

describe('managing members', () => {
  async function openMenu() {
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('member-actions'));
    return user;
  }

  it('offers the menu to an owner for everyone but themselves', async () => {
    mockApi();
    mount();

    const rows = await screen.findAllByTestId('member-row');
    expect(within(rows[0]!).queryByTestId('member-actions')).toBeNull();
    expect(within(rows[1]!).getByTestId('member-actions')).toBeTruthy();
  });

  it('offers no menu to a specialist', async () => {
    mockApi({ role: 'specialist' });
    mount();

    await screen.findAllByTestId('member-row');
    expect(screen.queryByTestId('member-actions')).toBeNull();
  });

  it('switches a specialist to administrator and refreshes the list', async () => {
    mockApi();
    mount();
    const user = await openMenu();

    await user.click(await screen.findByTestId('member-switch-role'));

    expect(await screen.findByText('ion@example.test este acum administrator.')).toBeTruthy();
    const [, init] = requests('/organization/members/user-two', 'PATCH')[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({ role: 'owner' });
    await waitFor(() => expect(requests('/organization/members')).toHaveLength(2));
  });

  it('removes a member only after confirmation', async () => {
    mockApi();
    mount();
    const user = await openMenu();

    await user.click(await screen.findByTestId('member-remove'));
    const dialog = await screen.findByTestId('member-remove-dialog');
    expect(dialog.textContent).toContain('ion@example.test');
    expect(requests('/organization/members/user-two', 'DELETE')).toHaveLength(0);

    await user.click(within(dialog).getByTestId('member-remove-confirm'));

    expect(
      await screen.findByText('ion@example.test nu mai face parte din organizație.')
    ).toBeTruthy();
    expect(requests('/organization/members/user-two', 'DELETE')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('member-remove-dialog')).toBeNull());
  });

  it('leaves the member alone when the confirmation is declined', async () => {
    mockApi();
    mount();
    const user = await openMenu();

    await user.click(await screen.findByTestId('member-remove'));
    const dialog = await screen.findByTestId('member-remove-dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Renunță' }));

    await waitFor(() => expect(screen.queryByTestId('member-remove-dialog')).toBeNull());
    expect(requests('/organization/members/user-two', 'DELETE')).toHaveLength(0);
  });

  it('reports a member who is already gone inline and refreshes the list', async () => {
    mockApi({
      changeRole: () => Response.json({ error: 'not_found', message: 'No' }, { status: 404 }),
    });
    mount();
    const user = await openMenu();

    await user.click(await screen.findByTestId('member-switch-role'));

    expect((await screen.findByTestId('members-error')).textContent).toBe(
      'ion@example.test nu mai face parte din organizație.'
    );
    await waitFor(() => expect(requests('/organization/members')).toHaveLength(2));
  });
});

describe('legal details', () => {
  it('shows an owner the saved details and replaces them on save, clearing emptied fields', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    const name = await screen.findByTestId<HTMLInputElement>('legal-legalName');
    expect(name.value).toBe('S.C. PROTECT SSM S.R.L.');
    expect(screen.getByTestId<HTMLButtonElement>('legal-details-save').disabled).toBe(true);

    await user.type(screen.getByTestId('legal-legalRepresentativeRole'), 'Administrator');
    await user.clear(screen.getByTestId('legal-addressLine'));
    await user.click(screen.getByTestId('legal-details-save'));

    await waitFor(() => expect(requests('/organization/legal-details', 'PUT')).toHaveLength(1));
    const [, init] = requests('/organization/legal-details', 'PUT')[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      ...legalDetails,
      addressLine: null,
      legalRepresentativeRole: 'Administrator',
    });
    expect(await screen.findByText('Datele juridice au fost salvate.')).toBeTruthy();
  });

  it('refuses a CUI with a wrong control digit without calling the API', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    const cui = await screen.findByTestId('legal-cui');
    await user.clear(cui);
    await user.type(cui, '1590083');
    await user.click(screen.getByTestId('legal-details-save'));

    expect((await screen.findByTestId('legal-cui-error')).textContent).toContain('CUI invalid');
    expect(requests('/organization/legal-details', 'PUT')).toHaveLength(0);
  });

  it('shows a specialist the details read-only, without save or lookup', async () => {
    mockApi({ role: 'specialist' });
    mount();

    const name = await screen.findByTestId<HTMLInputElement>('legal-legalName');
    expect(name.disabled).toBe(true);
    expect(screen.queryByTestId('legal-details-save')).toBeNull();
    expect(screen.queryByTestId('legal-lookup')).toBeNull();
  });

  it('reports a failed save inline and keeps what was typed', async () => {
    mockApi({ saveLegalDetails: () => new Response(null, { status: 500 }) });
    mount();
    const user = userEvent.setup();

    const locality = await screen.findByTestId<HTMLInputElement>('legal-locality');
    await user.clear(locality);
    await user.type(locality, 'Lugoj');
    await user.click(screen.getByTestId('legal-details-save'));

    expect((await screen.findByTestId('legal-details-error')).textContent).toContain(
      'Nu am putut salva'
    );
    expect(locality.value).toBe('Lugoj');
  });

  it('keeps what contracts print about the provider, for owners only', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();
    const form = await screen.findByTestId('contract-details-form');
    const iban = within(form).getByTestId('contract-iban') as HTMLInputElement;
    expect(iban.value).toBe('RO49 AAAA 1B31 0075 9384 0000');
    expect(within(form).getByTestId('contract-details-save')).toHaveProperty('disabled', true);

    await user.clear(iban);
    await user.type(iban, 'RO48 AAAA 1B31 0075 9384 0000');
    await user.click(within(form).getByTestId('contract-details-save'));
    expect((await screen.findByTestId('contract-iban-error')).textContent).toContain(
      'IBAN invalid'
    );
    expect(requests('/organization/contract-details', 'PUT')).toHaveLength(0);

    await user.clear(iban);
    await user.type(iban, 'ro49aaaa1b31007593840000');
    await user.type(within(form).getByTestId('contract-bankName'), 'Banca Transilvania');
    await user.type(
      within(form).getByTestId('contract-authorizationCertificateDate'),
      '30.09.2022'
    );
    await user.click(within(form).getByTestId('contract-vatPayer'));
    await user.click(within(form).getByTestId('contract-details-save'));
    expect(await screen.findByText('Datele pentru contracte au fost salvate.')).toBeTruthy();
    expect(
      JSON.parse(String(requests('/organization/contract-details', 'PUT')[0]![1]?.body))
    ).toEqual({
      ...contractDetails,
      iban: 'ro49aaaa1b31007593840000',
      bankName: 'Banca Transilvania',
      authorizationCertificateDate: '2022-09-30',
      vatPayer: true,
    });
  });

  it('shows a specialist no contract details, and asks the API for none', async () => {
    mockApi({ role: 'specialist' });
    mount();
    await screen.findByTestId('legal-details-form');
    expect(screen.queryByTestId('contract-details-card')).toBeNull();
    expect(requests('/organization/contract-details')).toHaveLength(0);
  });
});
