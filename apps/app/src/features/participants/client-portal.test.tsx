import type { BillingSmsUsage, PortalAccessState } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { smsUsage } from '@/test/billing-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import { fullText } from '@/test/text';
import { noTests, untrained } from '@/test/training-fixture';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const employeesPath = `/clients/${clientId}/employees`;
const inviteesPath = `/clients/${clientId}/employee-invitees`;
const participantsPath = `/clients/${clientId}/participants`;
const bulkPath = `/clients/${clientId}/employee-participant-invitations`;
const administratorPath = `/clients/${clientId}/participant-invitations`;
const portalPage = `/clienti/${clientId}/portal`;

const sampleClient = {
  id: clientId,
  legalName: 'VELOCE CAFE SRL',
  cui: '1590082',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: null,
  countyCode: 'B',
  locality: 'București',
  addressLine: null,
  legalRepresentativeName: 'Maria Popescu',
  contactName: 'Ioana Dinu',
  contactEmail: 'office@veloce.ro',
  contactPhone: '+40722000111',
  stage: 'client',
  declaredEmployeeCount: 6,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};

const idOf = (n: number) => `7c9e6679-7425-40de-944b-${String(n).padStart(12, '0')}`;
const participantIdOf = (n: number) => `0a1b2c3d-4e5f-4a6b-8c7d-${String(n).padStart(12, '0')}`;
const invitationIdOf = (n: number) => `3f2c1b0a-9e8d-4c7b-a6f5-${String(n).padStart(12, '0')}`;
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const earlier = (minutes: number) => later(-minutes);

const noAccess = {
  state: 'none' as PortalAccessState,
  since: null as string | null,
  expiresAt: null as string | null,
  revokedAt: null as string | null,
  resendableAt: null as string | null,
  channel: null as 'email' | 'sms' | null,
  address: null as string | null,
  language: null as 'ro' | 'en' | null,
  participantId: null as string | null,
  invitationId: null as string | null,
  administrator: false,
};

type Access = typeof noAccess;

const worker = (n: number, lastName: string, portal: Partial<Access> = {}) => ({
  id: idOf(n),
  clientId,
  lastName,
  firstName: 'Ion',
  employeeNumber: null,
  email: `${lastName.toLowerCase()}@example.ro`,
  phone: null,
  jobTitle: 'Barista',
  jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Barista' },
  hiredAt: '2020-03-01',
  status: 'active',
  terminatedAt: null,
  workplace: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  training: untrained,
  tests: noTests,
  signaturesPending: 0,
  portal: { ...noAccess, ...portal },
});

type Worker = ReturnType<typeof worker>;

const mixed = (): Worker[] => [
  worker(1, 'Achim', {
    state: 'active',
    since: '2026-10-10T09:00:00.000Z',
    channel: 'email',
    address: 'achim@example.ro',
    language: 'ro',
    participantId: participantIdOf(1),
    administrator: true,
  }),
  worker(2, 'Avram', {
    state: 'expired',
    since: '2026-10-02T09:00:00.000Z',
    expiresAt: '2026-11-01T09:00:00.000Z',
    resendableAt: '2026-10-02T09:10:00.000Z',
    channel: 'email',
    address: 'avram@example.ro',
    invitationId: invitationIdOf(2),
  }),
  worker(3, 'Bîrsan', {
    state: 'active',
    since: '2026-10-20T09:00:00.000Z',
    channel: 'email',
    address: 'birsan@example.ro',
    language: 'en',
    participantId: participantIdOf(3),
  }),
  worker(4, 'Dobre'),
  worker(5, 'Ene', {
    state: 'revoked',
    revokedAt: '2026-11-05T09:00:00.000Z',
    channel: 'email',
    address: 'ene@example.ro',
  }),
  worker(6, 'Mureșan', {
    state: 'invited',
    since: earlier(2),
    expiresAt: '2026-12-12T09:00:00.000Z',
    resendableAt: later(8),
    channel: 'sms',
    address: '+40752330417',
    invitationId: invitationIdOf(6),
  }),
];

const administrator = {
  id: participantIdOf(1),
  clientId,
  kind: 'client_administrator',
  employeeId: idOf(1),
  fullName: 'Achim Ion',
  channel: 'email',
  address: 'achim@example.ro',
  createdAt: '2026-10-10T09:00:00.000Z',
  revokedAt: null,
  noticeVersion: '1',
  language: 'ro',
};

const administratorInvitation = {
  id: invitationIdOf(100),
  clientId,
  kind: 'client_administrator',
  employeeId: null,
  fullName: 'Maria Popescu',
  channel: 'email',
  address: 'maria@veloce.ro',
  status: 'open',
  lastSentAt: '2026-11-12T09:00:00.000Z',
  resendableAt: '2026-11-12T09:10:00.000Z',
  expiresAt: '2026-12-12T09:00:00.000Z',
  createdAt: '2026-11-12T09:00:00.000Z',
};

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  workers = mixed(),
  client = sampleClient,
  participants = [administrator] as unknown[],
  invitations = [] as unknown[],
  invitees,
  sms,
  signatures = [] as unknown[],
}: {
  workers?: Worker[];
  client?: typeof sampleClient;
  participants?: unknown[];
  invitations?: unknown[];
  invitees?: (url: URL) => Response;
  sms?: BillingSmsUsage;
  signatures?: unknown[];
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const { pathname, searchParams } = url;
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        smsThisMonth: sms ?? null,
      });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === participantsPath) return Response.json({ participants, invitations });
    if (pathname === employeesPath && method === 'GET') {
      const states = searchParams.getAll('portal');
      const rows = workers.filter(
        (row) => states.length === 0 || states.includes(row.portal.state)
      );
      const page = Number(searchParams.get('page') ?? 1);
      const size = Number(searchParams.get('pageSize') ?? 25);
      return Response.json({
        items: rows.slice((page - 1) * size, page * size),
        page,
        pageSize: size,
        total: rows.length,
        unfilteredTotal: workers.length,
      });
    }
    if (pathname === inviteesPath) {
      if (invitees) return invitees(url);
      const states = searchParams.getAll('portal');
      const rows = workers.filter(
        (row) => states.length === 0 || states.includes(row.portal.state)
      );
      return Response.json({
        items: rows.map((row) => ({
          employeeId: row.id,
          lastName: row.lastName,
          firstName: row.firstName,
          position: row.jobPosition.name,
          email: row.email,
          phone: row.phone,
          current: true,
          portal: null,
        })),
        total: rows.length,
      });
    }
    if (pathname === bulkPath && method === 'POST') {
      const body = JSON.parse(String(init!.body)) as {
        invitations: { employeeId: string; address: string }[];
      };
      return Response.json({
        results: body.invitations.map((row) => ({
          employeeId: row.employeeId,
          outcome: 'invited',
          reason: null,
          invitation: null,
        })),
      });
    }
    if (pathname.endsWith('/participant-invitations') && pathname.includes('/employees/')) {
      return Response.json(
        { ...administratorInvitation, kind: 'employee', employeeId: pathname.split('/')[4] },
        { status: 201 }
      );
    }
    if (pathname === administratorPath && method === 'POST') {
      return Response.json(administratorInvitation, { status: 201 });
    }
    if (pathname.endsWith('/resend') && method === 'POST') {
      return Response.json(administratorInvitation);
    }
    if (pathname.endsWith('/revoke') && method === 'POST') {
      return new Response(null, { status: 204 });
    }
    if (pathname === `/clients/${clientId}/signature-requests`) {
      return Response.json({ items: signatures });
    }
    if (pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: [] });
    }
    if (pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: [] });
    return Response.json({ error: 'not_found', message: 'Not mocked.' }, { status: 404 });
  });
}

const calls = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
    )
    .map(([input, init]) => ({
      url: new URL(String(input)),
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : null,
    }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

const mountPortal = (path = portalPage) => mountApp(authFixture(makeSession()).client, path);
const roster = () => screen.findByTestId('portal-roster');
const rows = async () => within(await roster()).findAllByTestId('portal-roster-row');
const primaryButtons = () =>
  Array.from(
    screen.getByTestId('client-portal-page').querySelectorAll('[data-variant="default"]')
  ).map((button) => button.textContent);

describe("the client's Portal tab", () => {
  it('shows the administrator as a summary, every current worker with their access, and one forest action', async () => {
    mockApi();
    const runtime = mountPortal();
    const page = await screen.findByTestId('client-portal-page');
    await waitFor(() => expect(document.title).toBe('Portal — VELOCE CAFE SRL — SSM Ușor'));
    expect(screen.getAllByTestId('client-section').at(-1)!.textContent).toBe('Portal');
    expect(runtime.router.state.location.pathname).toBe(portalPage);

    const panel = within(page).getByTestId('client-administrator-panel');
    expect(within(panel).getByTestId('administrator-name').textContent).toBe('Achim Ion');
    expect(within(panel).getByTestId('administrator-employee').textContent).toBe(
      'și lucrător al firmei: Achim Ion'
    );
    expect(
      within(panel).getByTestId('administrator-employee').querySelector('a')!.getAttribute('href')
    ).toBe(`/clienti/${clientId}/angajati/${idOf(1)}`);
    const access = within(panel).getByTestId('administrator-access-row');
    expect(access.textContent).toContain('Are acces');
    expect(access.textContent).toContain('din 10 oct. 2026');
    expect(within(access).getByTestId('participant-revoke').dataset.variant).toBe('secondary');
    expect(within(panel).getByTestId('administrator-address-row').textContent).toContain(
      'prin email · portal în română'
    );
    expect(within(page).queryByTestId('administrator-invite')).toBeNull();
    expect(within(page).queryByTestId('portal-getting-started')).toBeNull();

    const people = await rows();
    expect(people.map((row) => within(row).getByTestId('portal-roster-open').textContent)).toEqual([
      'Achim Ion',
      'Avram Ion',
      'Bîrsan Ion',
      'Dobre Ion',
      'Ene Ion',
      'Mureșan Ion',
    ]);
    const states = people.map(
      (row) => within(row).getByTestId('portal-access-state').dataset.state
    );
    expect(states).toEqual(['active', 'expired', 'active', 'none', 'revoked', 'invited']);
    expect(within(people[0]!).getByTestId('portal-access-state').className).toContain('bg-success');
    expect(within(people[1]!).getByTestId('portal-access-state').className).toContain('bg-warning');
    expect(within(people[1]!).getByTestId('portal-access-date').textContent).toBe(
      'a expirat pe 1 nov. 2026'
    );
    expect(within(people[4]!).getByTestId('portal-access-date').textContent).toBe('pe 5 nov. 2026');
    expect(within(people[5]!).getByTestId('portal-access-date').textContent).toBe(
      'expiră pe 12 dec. 2026'
    );
    expect(within(people[0]!).getByTestId('portal-access-channel').textContent).toBe(
      'prin email · administratorul clientului'
    );
    expect(within(people[2]!).getByTestId('portal-access-channel').textContent).toBe(
      'prin email · portal în engleză'
    );
    expect(people[5]!.textContent).toContain('0752 330 417');

    const actionsOf = (row: HTMLElement) => ({
      invite: within(row).queryByTestId('portal-roster-invite') !== null,
      resend: within(row).queryByTestId('portal-roster-resend') !== null,
      menu: within(row).queryByTestId('portal-access-menu') !== null,
    });
    expect(people.map(actionsOf)).toEqual([
      { invite: false, resend: false, menu: true },
      { invite: false, resend: true, menu: true },
      { invite: false, resend: false, menu: true },
      { invite: true, resend: false, menu: false },
      { invite: true, resend: false, menu: false },
      { invite: false, resend: true, menu: true },
    ]);
    expect(within(people[3]!).getByTestId('portal-roster-invite').dataset.variant).toBe(
      'secondary'
    );
    expect(
      (within(people[5]!).getByTestId('portal-roster-resend') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (within(people[1]!).getByTestId('portal-roster-resend') as HTMLButtonElement).disabled
    ).toBe(false);

    expect((await screen.findByTestId('portal-roster-count')).textContent).toBe(
      '2 cu acces, din 6 lucrători'
    );
    expect(primaryButtons()).toEqual(['Invită lucrători']);
    const cards = Array.from(page.querySelectorAll(':scope > [data-testid]')).map((card) =>
      card.getAttribute('data-testid')
    );
    expect(cards).toEqual([
      'client-administrator-panel',
      'portal-roster',
      'client-signature-requests',
    ]);
  });

  it('starts with two equal steps while nobody has access, and leaves the forest action to them', async () => {
    mockApi({ workers: mixed().map((row) => ({ ...row, portal: noAccess })), participants: [] });
    const user = userEvent.setup();
    mountPortal();
    const start = await screen.findByTestId('portal-getting-started');
    expect(within(start).getByRole('heading').textContent).toBe(
      'Pornește portalul pentru acest client'
    );
    expect(screen.queryByTestId('client-administrator-panel')).toBeNull();
    expect(screen.queryByTestId('portal-invite-uninvited')).toBeNull();
    expect((await screen.findByTestId('portal-roster-count')).textContent).toBe(
      'Niciunul cu acces, din 6 lucrători'
    );
    await waitFor(() => expect(calls(`/clients/${clientId}/signature-requests`)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId('client-signature-requests')).toBeNull());
    await rows();
    expect(primaryButtons()).toEqual(['Invită administratorul', 'Invită lucrătorii']);

    await user.click(within(start).getByTestId('portal-start-administrator'));
    const dialog = await screen.findByTestId('administrator-invite-dialog');
    expect((within(dialog).getByTestId('administrator-name') as HTMLInputElement).value).toBe(
      'Maria Popescu'
    );
  });

  it('keeps the steps while workers are only invited', async () => {
    mockApi({
      workers: mixed().map((row, index) => (index === 5 ? row : { ...row, portal: noAccess })),
      participants: [],
    });
    mountPortal();
    expect(await screen.findByTestId('portal-getting-started')).toBeTruthy();
  });

  it('drops the steps once a worker has access, inviting the administrator from their panel', async () => {
    mockApi({ participants: [] });
    mountPortal();
    const panel = await screen.findByTestId('client-administrator-panel');
    expect(screen.queryByTestId('portal-getting-started')).toBeNull();
    expect(within(panel).getByTestId('client-administrator-empty').textContent).toBe(
      'Administratorul clientului nu a fost invitat în portal.'
    );
    expect(within(panel).getByTestId('administrator-invite').dataset.variant).toBe('secondary');
  });

  it('sends a client without workers to the Lucrători tab', async () => {
    mockApi({ workers: [], participants: [] });
    mountPortal();
    const empty = await screen.findByTestId('portal-no-workers');
    expect(empty.textContent).toContain('Clientul nu are încă lucrători');
    expect(within(empty).getByRole('link').getAttribute('href')).toBe(
      `/clienti/${clientId}/angajati`
    );
    expect(screen.queryByTestId('portal-roster')).toBeNull();
    expect(screen.queryByTestId('portal-getting-started')).toBeNull();
  });

  it('offers resending and revoking an invited administrator, and no second invitation', async () => {
    mockApi({ participants: [], invitations: [administratorInvitation] });
    const user = userEvent.setup();
    mountPortal();
    const panel = await screen.findByTestId('client-administrator-panel');
    const access = within(panel).getByTestId('administrator-access-row');
    expect(access.textContent).toContain('Invitat');
    expect(access.textContent).toContain('expiră pe 12 dec. 2026');
    expect(screen.queryByTestId('administrator-invite')).toBeNull();
    expect(screen.queryByTestId('portal-getting-started')).toBeNull();

    await user.click(within(access).getByTestId('participant-invitation-resend'));
    await waitFor(() =>
      expect(calls(`/participant-invitations/${invitationIdOf(100)}/resend`, 'POST')).toHaveLength(
        1
      )
    );
    await user.click(within(access).getByTestId('participant-invitation-revoke'));
    const dialog = await screen.findByTestId('participant-invitation-revoke-dialog');
    await user.click(within(dialog).getByTestId('participant-invitation-revoke-confirm'));
    await waitFor(() =>
      expect(calls(`/participant-invitations/${invitationIdOf(100)}/revoke`, 'POST')).toHaveLength(
        1
      )
    );
  });

  it('reads an archived client: no choice, no invitation, no resend, revoking only from the menu', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-11-10T09:00:00+00:00' } });
    const user = userEvent.setup();
    mountPortal();
    const people = await rows();
    const table = screen.getByTestId('portal-roster-table');
    expect(within(table).queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByTestId('portal-roster-invite')).toBeNull();
    expect(screen.queryByTestId('portal-roster-resend')).toBeNull();
    expect(screen.queryByTestId('portal-invite-uninvited')).toBeNull();
    expect(primaryButtons()).toEqual([]);
    const expired = within(people[1]!).getByTestId('portal-access-state');
    expect(expired.className).not.toContain('bg-warning');
    expect(expired.className).toContain('bg-secondary');

    const panel = screen.getByTestId('client-administrator-panel');
    expect(within(panel).queryByTestId('participant-revoke')).toBeNull();
    await user.click(within(panel).getByTestId('portal-access-menu'));
    await user.click(await screen.findByTestId('portal-access-menu-revoke'));
    const dialog = await screen.findByTestId('participant-revoke-dialog');
    await user.click(within(dialog).getByTestId('participant-revoke-confirm'));
    await waitFor(() =>
      expect(calls(`/client-participants/${participantIdOf(1)}/revoke`, 'POST')).toHaveLength(1)
    );
  });

  it('revokes a worker from the row menu and resends an expired invitation from its row', async () => {
    mockApi();
    const user = userEvent.setup();
    mountPortal();
    const people = await rows();
    await user.click(within(people[1]!).getByTestId('portal-roster-resend'));
    await waitFor(() =>
      expect(calls(`/participant-invitations/${invitationIdOf(2)}/resend`, 'POST')).toHaveLength(1)
    );
    await user.click(within(people[2]!).getByTestId('portal-access-menu'));
    await user.click(await screen.findByTestId('portal-access-menu-revoke'));
    await user.click(
      within(await screen.findByTestId('participant-revoke-dialog')).getByTestId(
        'participant-revoke-confirm'
      )
    );
    await waitFor(() =>
      expect(calls(`/client-participants/${participantIdOf(3)}/revoke`, 'POST')).toHaveLength(1)
    );
  });

  it('invites one worker from their row with the dialog of their page', async () => {
    mockApi();
    const user = userEvent.setup();
    mountPortal();
    const people = await rows();
    await user.click(within(people[3]!).getByTestId('portal-roster-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    expect(within(dialog).getAllByTestId('participant-invite-option')[0]!.textContent).toBe(
      'dobre@example.roEmail'
    );
  });

  it('invites the workers chosen by their boxes, through the batch dialog', async () => {
    mockApi();
    const user = userEvent.setup();
    mountPortal();
    const people = await rows();
    await user.click(within(people[3]!).getByTestId('portal-roster-select'));
    await user.click(within(people[4]!).getByTestId('portal-roster-select'));
    const bar = await screen.findByTestId('portal-selection');
    expect(bar.textContent).toContain('2 lucrători aleși');
    expect(screen.queryByTestId('portal-roster-toolbar')).toBeNull();
    expect(primaryButtons()).toEqual(['Invită selectați (2)']);

    await user.click(within(bar).getByTestId('portal-invite-chosen'));
    const dialog = await screen.findByTestId('bulk-invite-dialog');
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(
      'Invită în portal lucrătorii aleși'
    );
    await user.click(within(dialog).getByTestId('bulk-invite-submit'));
    await waitFor(() =>
      expect(calls(bulkPath, 'POST').map((call) => call.body)).toEqual([
        {
          invitations: [
            { employeeId: idOf(4), address: 'dobre@example.ro' },
            { employeeId: idOf(5), address: 'ene@example.ro' },
          ],
        },
      ])
    );
    await user.click(await within(dialog).findByTestId('bulk-invite-done'));
    await waitFor(() => expect(screen.queryByTestId('portal-selection')).toBeNull());
  });

  it('clears the choice with Deselectează tot', async () => {
    mockApi();
    const user = userEvent.setup();
    mountPortal();
    const people = await rows();
    await user.click(within(people[3]!).getByTestId('portal-roster-select'));
    const bar = await screen.findByTestId('portal-selection');
    await user.click(within(bar).getByTestId('portal-clear-selection'));
    expect(screen.queryByTestId('portal-selection')).toBeNull();
    expect(screen.getByTestId('portal-roster-toolbar')).toBeTruthy();
  });

  it('starts the choice again when the filters change, so nothing hidden is invited', async () => {
    mockApi();
    const user = userEvent.setup();
    const runtime = mountPortal();
    const people = await rows();
    await user.click(within(people[3]!).getByTestId('portal-roster-select'));
    expect(await screen.findByTestId('portal-selection')).toBeTruthy();
    await runtime.router.navigate({
      to: '/clienti/$clientId/portal',
      params: { clientId },
      search: { portal: ['none'] },
    });
    await waitFor(() => expect(screen.queryByTestId('portal-selection')).toBeNull());
    await runtime.router.navigate({ to: '/clienti/$clientId/portal', params: { clientId } });
    await rows();
    expect(screen.queryByTestId('portal-selection')).toBeNull();
  });

  it('offers no way to add workers to an archived client without any', async () => {
    mockApi({
      workers: [],
      participants: [],
      client: { ...sampleClient, archivedAt: '2026-11-10T09:00:00+00:00' },
    });
    mountPortal();
    const empty = await screen.findByTestId('portal-no-workers');
    expect(within(empty).queryByRole('link')).toBeNull();
  });

  it('drops a chosen worker once their row comes back invited', async () => {
    const workers = mixed();
    mockApi({ workers });
    const user = userEvent.setup();
    mountPortal();
    const people = await rows();
    await user.click(within(people[3]!).getByTestId('portal-roster-select'));
    await user.click(within(people[4]!).getByTestId('portal-roster-select'));
    expect((await screen.findByTestId('portal-selection')).textContent).toContain(
      '2 lucrători aleși'
    );

    workers[3] = { ...workers[3]!, portal: { ...workers[3]!.portal, state: 'invited' } };
    await user.click(within(people[3]!).getByTestId('portal-roster-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    await user.click(within(dialog).getByTestId('participant-invite-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('portal-selection').textContent).toContain('1 lucrător ales')
    );
  });

  it('reads the standing again as the batch opens, setting apart whoever a colleague invited', async () => {
    const workers = mixed();
    mockApi({
      workers,
      invitees: () =>
        Response.json({
          items: [3, 4].map((index) => ({
            employeeId: workers[index]!.id,
            lastName: workers[index]!.lastName,
            firstName: 'Ion',
            position: 'Barista',
            email: workers[index]!.email,
            phone: null,
            current: true,
            portal: index === 3 ? 'invited' : null,
          })),
          total: 2,
        }),
    });
    const user = userEvent.setup();
    mountPortal();
    const people = await rows();
    await user.click(within(people[3]!).getByTestId('portal-roster-select'));
    await user.click(within(people[4]!).getByTestId('portal-roster-select'));
    await user.click(await screen.findByTestId('portal-invite-chosen'));
    const dialog = await screen.findByTestId('bulk-invite-dialog');
    expect(within(dialog).getByTestId('bulk-invite-on-portal').textContent).toContain('Dobre Ion');
    expect(within(dialog).getByTestId('bulk-invite-with-address').textContent).toContain('Ene Ion');
    expect(within(dialog).getByTestId('bulk-invite-with-address').textContent).not.toContain(
      'Dobre'
    );
  });

  it('says when nobody is left without an invitation, keeping the list as it was', async () => {
    mockApi({ workers: mixed().filter((row) => row.portal.state !== 'none') });
    const user = userEvent.setup();
    const runtime = mountPortal();
    await rows();
    await user.click(screen.getByTestId('portal-invite-uninvited'));
    expect((await screen.findByTestId('portal-choose-nobody')).textContent).toContain(
      'Toți lucrătorii au deja acces sau o invitație.'
    );
    expect(runtime.router.state.location.search).not.toHaveProperty('portal');
    expect(screen.queryByTestId('portal-selection')).toBeNull();
  });

  it('shows in the row when an invitation can be sent again', async () => {
    mockApi();
    mountPortal();
    const people = await rows();
    expect(within(people[5]!).getByTestId('portal-resend-hint').textContent).toMatch(
      /^Poți retrimite după ora \d{2}:\d{2}\.$/
    );
    expect(within(people[1]!).queryByTestId('portal-resend-hint')).toBeNull();
  });

  it('applies Fără invitație and chooses every worker it matches, past the page', async () => {
    const many = Array.from({ length: 30 }, (_, index) => worker(10 + index, `Zidar${index}`));
    mockApi({ workers: [...mixed(), ...many] });
    const user = userEvent.setup();
    const runtime = mountPortal();
    await rows();
    await user.click(screen.getByTestId('portal-invite-uninvited'));
    const bar = await screen.findByTestId('portal-selection');
    expect(bar.textContent).toContain('31 de lucrători aleși');
    expect([runtime.router.state.location.search.portal].flat()).toEqual(['none']);
    const [request] = calls(inviteesPath);
    expect(request!.url.searchParams.getAll('portal')).toEqual(['none']);
    expect(within(bar).getByTestId('portal-invite-chosen').textContent).toBe(
      'Invită selectați (31)'
    );
  });

  it('says when the choice stopped at the limit', async () => {
    mockApi({
      invitees: () =>
        Response.json({
          items: [
            {
              employeeId: idOf(4),
              lastName: 'Dobre',
              firstName: 'Ion',
              position: 'Barista',
              email: null,
              phone: null,
              current: true,
              portal: null,
            },
          ],
          total: 1200,
        }),
    });
    const user = userEvent.setup();
    mountPortal();
    await rows();
    await user.click(screen.getByTestId('portal-invite-uninvited'));
    expect((await screen.findByTestId('portal-selection-capped')).textContent).toContain(
      'Se aleg odată cel mult 1000 de lucrători'
    );
  });

  it('filters by access from the address and sorts by access', async () => {
    mockApi();
    const user = userEvent.setup();
    mountPortal(`${portalPage}?portal=active&portal=invited`);
    await rows();
    const listed = calls(employeesPath).filter(
      (call) => call.url.searchParams.get('pageSize') === '25'
    );
    expect(listed.at(-1)!.url.searchParams.getAll('portal')).toEqual(['active', 'invited']);
    expect((await screen.findByTestId('portal-roster-count')).textContent).toBe(
      '3 din 6 lucrători'
    );
    expect(screen.getByTestId('portal-roster-applied-filters').textContent).toContain(
      'Are acces, Invitat'
    );

    await user.click(screen.getByTestId('sort-portal'));
    await waitFor(() =>
      expect(
        calls(employeesPath)
          .filter((call) => call.url.searchParams.get('pageSize') === '25')
          .at(-1)!
          .url.searchParams.get('sort')
      ).toBe('portal')
    );
  });

  it('offers the Filtre groups of the tab, without the training ones', async () => {
    mockApi();
    const user = userEvent.setup();
    mountPortal();
    await rows();
    await user.click(screen.getByTestId('portal-roster-filters'));
    const panel = await screen.findByRole('dialog');
    expect(panel.textContent).toContain('Acces la portal');
    expect(panel.textContent).toContain('Fără invitație');
    expect(panel.textContent).toContain('Post de lucru');
    expect(panel.textContent).not.toContain('Instruire SSM');
  });

  it('says when nobody matches, and clears the filters', async () => {
    mockApi({ workers: mixed().filter((row) => row.portal.state !== 'invited') });
    const user = userEvent.setup();
    const runtime = mountPortal(`${portalPage}?portal=invited`);
    const empty = await screen.findByTestId('portal-roster-empty-filtered');
    expect(empty.textContent).toContain('Niciun lucrător nu se potrivește');
    expect((await screen.findByTestId('portal-roster-count')).textContent).toBe(
      '0 din 5 lucrători'
    );
    await user.click(within(empty).getByTestId('portal-roster-empty-filtered-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).not.toHaveProperty('portal'));
    expect(await rows()).toHaveLength(5);
  });

  it('keeps SMS off for the client administrator during a trial', async () => {
    mockApi({ participants: [], sms: smsUsage({ state: 'none', included: 0 }) });
    mountPortal();
    const panel = await screen.findByTestId('client-administrator-panel');
    await userEvent.click(within(panel).getByTestId('administrator-invite'));
    const dialog = await screen.findByTestId('administrator-invite-dialog');
    const sms = within(dialog).getByRole<HTMLInputElement>('radio', {
      name: 'SMS, după ce alegi un plan',
    });
    expect(sms.disabled).toBe(true);
  });

  it("proposes the representative's name and the contact's address, and invites the administrator", async () => {
    mockApi({ participants: [] });
    const user = userEvent.setup();
    mountPortal();
    const panel = await screen.findByTestId('client-administrator-panel');
    await user.click(within(panel).getByTestId('administrator-invite'));
    const dialog = await screen.findByTestId('administrator-invite-dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Email' }));
    await user.click(within(dialog).getByTestId('administrator-invite-submit'));
    await waitFor(() =>
      expect(calls(administratorPath, 'POST').map((call) => call.body)).toEqual([
        { channel: 'email', address: 'office@veloce.ro', fullName: 'Maria Popescu' },
      ])
    );
    expect(
      await screen.findByText(fullText('Invitația a fost trimisă pe office@veloce.ro.'))
    ).toBeTruthy();
  });
});
