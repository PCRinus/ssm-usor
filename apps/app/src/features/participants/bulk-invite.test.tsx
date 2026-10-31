import type { ImportInvitee } from '@ssm-usor/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getListImportPortalInviteesQueryKey } from '@/api/generated/api';
import { createQueryClient } from '@/lib/query-client';
import type { RouterContext } from '@/routes/__root';

import {
  formerEmployeesSentence,
  invitationCount,
  pendingSummary,
  sendLabel,
  sentSummary,
  uninvitedCount,
} from './bulk-invite-format';
import { useBulkInvite } from './use-bulk-invite';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const importId = '3f2c1b0a-9e8d-4c7b-a6f5-e4d3c2b1a090';
const inviteesPath = `/clients/${clientId}/imports/${importId}/portal-invitees`;
const invitePath = `/clients/${clientId}/employee-participant-invitations`;

let serial = 0;
const invitee = (
  lastName: string,
  firstName: string,
  extra: Partial<ImportInvitee> = {}
): ImportInvitee => ({
  employeeId: `7c9e6679-7425-40de-944b-${String(++serial).padStart(12, '0')}`,
  lastName,
  firstName,
  position: 'Brutar',
  email: null,
  phone: null,
  current: true,
  portal: null,
  ...extra,
});

const fetchMock = vi.fn<typeof fetch>();

interface Invitation {
  employeeId: string;
  address: string;
}

function mockApi(
  items: ImportInvitee[],
  answer: (rows: Invitation[]) => Response = (rows) =>
    Response.json({
      results: rows.map((row) => ({
        employeeId: row.employeeId,
        outcome: 'invited',
        reason: null,
        invitation: null,
      })),
    })
) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === inviteesPath) return Response.json({ items });
    if (pathname === invitePath && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { invitations: Invitation[] };
      return answer(body.invitations);
    }
    return Response.json({ error: 'not_found', message: 'Not mocked.' }, { status: 404 });
  });
}

const sent = () =>
  fetchMock.mock.calls
    .filter(([input, init]) => new URL(String(input)).pathname === invitePath && init?.body)
    .map(
      ([, init]) => (JSON.parse(String(init!.body)) as { invitations: Invitation[] }).invitations
    );

function Harness() {
  const { openBulkInvite, bulkInviteDialog } = useBulkInvite(clientId);
  return (
    <>
      <button type="button" onClick={() => openBulkInvite(importId)}>
        Invită în portal angajații din fișe
      </button>
      {bulkInviteDialog}
    </>
  );
}

async function openDialog(cached?: ImportInvitee[]) {
  const queryClient = createQueryClient();
  if (cached) {
    queryClient.setQueryData(getListImportPortalInviteesQueryKey(clientId, importId), {
      items: cached,
    });
  }
  const routeTree = createRootRouteWithContext<RouterContext>()({ component: Harness });
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: {
      auth: {} as RouterContext['auth'],
      queryClient,
      apiRequest: { baseUrl: 'http://localhost:8787', getAccessToken: () => 'user-token' },
    },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Invită în portal/ }));
  const dialog = await screen.findByTestId('bulk-invite-dialog');
  await within(dialog).findAllByTestId('bulk-invite-row');
  return { user, dialog };
}

const field = (dialog: HTMLElement, name: string) =>
  within(dialog).getByLabelText(`Email sau telefon pentru ${name}`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inviting the people of an employee import to the portal', () => {
  it('lists the current people by whether the sheet gave an address, and says what they meet in the portal', async () => {
    mockApi([
      invitee('Lazăr', 'Radu', { phone: '+40744318207' }),
      invitee('Coman', 'Daniela', { email: 'daniela.coman@yahoo.com', phone: '+40742000001' }),
      invitee('Dobre', 'Cristian', { position: 'Patiser' }),
      invitee('Bârsan', 'Vasile', { current: false }),
      invitee('Badea', 'Ion', { portal: 'participant' }),
    ]);
    const { dialog } = await openDialog();

    const steps = within(dialog).getByTestId('bulk-invite-steps');
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((step) => step.textContent)
    ).toEqual([
      expect.stringContaining('Cum le folosim datele'),
      expect.stringContaining('Actul adițional privind semnarea electronică'),
      expect.stringContaining('Instruirile de acum înainte'),
    ]);
    expect(within(dialog).queryByRole('checkbox')).toBeNull();

    const withAddress = within(dialog).getByTestId('bulk-invite-with-address');
    expect(withAddress.textContent).toContain('Primesc invitația2');
    expect((field(dialog, 'Lazăr Radu') as HTMLInputElement).value).toBe('+40744318207');
    expect((field(dialog, 'Coman Daniela') as HTMLInputElement).value).toBe(
      'daniela.coman@yahoo.com'
    );
    expect(withAddress.textContent).toContain('din datele angajatului');
    const without = within(dialog).getByTestId('bulk-invite-without-address');
    expect(without.textContent).toContain('Fără email sau telefon pe fișă1');
    expect((field(dialog, 'Dobre Cristian') as HTMLInputElement).value).toBe('');
    expect(within(dialog).getByTestId('bulk-invite-on-portal').textContent).toContain(
      'Badea IonBrutarÎn portal'
    );
    expect(within(dialog).queryByLabelText(/Bârsan Vasile/)).toBeNull();
    expect(within(dialog).getByTestId('bulk-invite-saved-note').textContent).toContain(
      'Bârsan Vasile nu apare: e fost angajat.'
    );
    expect(within(dialog).getByTestId('bulk-invite-count').textContent).toBe(
      '2 invitații, 1 rămâne neinvitat'
    );
    expect(within(dialog).getByTestId('bulk-invite-sms').textContent).toContain(
      'O invitație pleacă prin SMS.'
    );
    expect(within(dialog).getByTestId('bulk-invite-submit').textContent).toBe(
      'Trimite 2 invitații'
    );
  });

  it('takes the channel from what is typed, counts the SMS, and sends only the rows with an address', async () => {
    const dobre = invitee('Dobre', 'Cristian');
    const ene = invitee('Ene', 'Bogdan');
    const matei = invitee('Matei', 'Sorin');
    mockApi([dobre, ene, matei]);
    const { user, dialog } = await openDialog();
    const submit = within(dialog).getByTestId('bulk-invite-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toBe('Trimite invitațiile');
    expect(within(dialog).getByTestId('bulk-invite-count').textContent).toBe(
      'Nicio invitație de trimis'
    );

    await user.type(field(dialog, 'Dobre Cristian'), '0742 115 980');
    await user.type(field(dialog, 'Ene Bogdan'), 'ene.bogdan@gmail.com');
    const rows = within(dialog).getAllByTestId('bulk-invite-row');
    expect(rows[0]!.textContent).toContain('SMS');
    expect(rows[1]!.textContent).toContain('Email');
    expect(rows[2]!.textContent).toContain('Neinvitat');
    expect(within(dialog).getByTestId('bulk-invite-count').textContent).toBe(
      '2 invitații, 1 rămâne neinvitat'
    );
    expect(within(dialog).getByTestId('bulk-invite-sms').textContent).toContain(
      'O invitație pleacă prin SMS.'
    );

    await user.click(within(dialog).getByTestId('bulk-invite-submit'));

    expect((await within(dialog).findByTestId('bulk-invite-summary')).textContent).toContain(
      'Am trimis 2 invitații.'
    );
    expect(sent()).toEqual([
      [
        { employeeId: dobre.employeeId, address: '0742 115 980' },
        { employeeId: ene.employeeId, address: 'ene.bogdan@gmail.com' },
      ],
    ]);
    const after = within(dialog).getAllByTestId('bulk-invite-row');
    expect(after[0]!.textContent).toContain('Trimisă');
    expect(after[2]!.textContent).not.toContain('Trimisă');
    expect((field(dialog, 'Dobre Cristian') as HTMLInputElement).disabled).toBe(true);
  });

  it('names an address that is neither, or one typed twice, on its row and leaves that person out', async () => {
    mockApi([invitee('Dobre', 'Cristian'), invitee('Ene', 'Bogdan'), invitee('Pop', 'Elena')]);
    const { user, dialog } = await openDialog();

    await user.type(field(dialog, 'Dobre Cristian'), '0742');
    await user.type(field(dialog, 'Ene Bogdan'), 'pop@example.ro');
    await user.type(field(dialog, 'Pop Elena'), 'POP@example.ro');
    await user.tab();

    expect(field(dialog, 'Dobre Cristian').getAttribute('aria-invalid')).toBe('true');
    expect(
      within(dialog)
        .getAllByTestId('bulk-invite-row-message')
        .map((message) => message.textContent)
    ).toEqual([
      'Scrie un email sau un număr de telefon valid.',
      'Aceeași adresă e scrisă și la Ene Bogdan.',
    ]);
    expect(within(dialog).getByTestId('bulk-invite-submit').textContent).toBe('Trimite invitația');
  });

  it('shows each row the answer it got, a refusal included, and sends a long list in turns', async () => {
    const people = Array.from({ length: 12 }, (_, index) =>
      invitee('Angajat', `${index + 1}`, { email: `angajat${index + 1}@example.ro` })
    );
    mockApi(people, (rows) =>
      Response.json({
        results: rows.map((row) =>
          row.employeeId === people[1]!.employeeId
            ? {
                employeeId: row.employeeId,
                outcome: 'failed',
                reason: 'address_invited_for_another_person',
                invitation: null,
              }
            : { employeeId: row.employeeId, outcome: 'invited', reason: null, invitation: null }
        ),
      })
    );
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Arată încă 4' }));

    await user.click(within(dialog).getByTestId('bulk-invite-submit'));

    expect((await within(dialog).findByTestId('bulk-invite-summary')).textContent).toContain(
      'Am trimis 11 invitații. Pentru un angajat nu a mers: vezi rândul lui.'
    );
    expect(sent().map((rows) => rows.length)).toEqual([10, 2]);
    expect(within(dialog).getAllByTestId('bulk-invite-row')[1]!.textContent).toContain(
      'La această adresă există deja o invitație deschisă pentru altă persoană a clientului.'
    );
  });

  it('marks the rows of a request refused as a whole not sent', async () => {
    mockApi([invitee('Dobre', 'Cristian', { phone: '+40742115980' })], () =>
      Response.json(
        { error: 'conflict', message: 'archived', reason: 'client_archived' },
        { status: 409 }
      )
    );
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByTestId('bulk-invite-submit'));

    expect((await within(dialog).findByTestId('bulk-invite-summary')).textContent).toContain(
      'Nicio invitație nu a plecat.'
    );
    expect(within(dialog).getByTestId('bulk-invite-row-message').textContent).toBe(
      'Clientul este arhivat; nu i se mai trimit invitații în portal.'
    );
  });

  it('goes on with the next request after one fails', async () => {
    const people = Array.from({ length: 12 }, (_, index) =>
      invitee('Angajat', `${index + 1}`, { email: `angajat${index + 1}@example.ro` })
    );
    let request = 0;
    mockApi(people, (rows) =>
      request++ === 0
        ? Response.json({ error: 'internal', message: 'Something failed.' }, { status: 500 })
        : Response.json({
            results: rows.map((row) => ({
              employeeId: row.employeeId,
              outcome: 'invited',
              reason: null,
              invitation: null,
            })),
          })
    );
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Arată încă 4' }));

    await user.click(within(dialog).getByTestId('bulk-invite-submit'));

    expect((await within(dialog).findByTestId('bulk-invite-summary')).textContent).toContain(
      'Am trimis 2 invitații. Pentru 10 angajați nu a mers: vezi rândurile lor.'
    );
    expect(sent().map((rows) => rows.length)).toEqual([10, 2]);
    const rows = within(dialog).getAllByTestId('bulk-invite-row');
    expect(rows[9]!.textContent).toContain('Netrimisă');
    expect(rows[10]!.textContent).toContain('Trimisă');
  });

  it("names a duplicate address from the employees' rows at once and does not offer to send it", async () => {
    mockApi([
      invitee('Coman', 'Daniela', { email: 'familia.coman@yahoo.com' }),
      invitee('Coman', 'Mihai', { email: 'familia.coman@yahoo.com' }),
    ]);
    const { dialog } = await openDialog();

    const rows = within(dialog).getAllByTestId('bulk-invite-row');
    expect(rows[0]!.textContent).toContain('Email');
    expect(rows[1]!.textContent).toContain('Aceeași adresă e scrisă și la Coman Daniela.');
    expect(rows[1]!.textContent).toContain('Neinvitat');
    expect(rows[1]!.textContent).not.toMatch(/Email(?! sau telefon)/);
    expect(field(dialog, 'Coman Mihai').getAttribute('aria-invalid')).toBe('true');
    expect(within(dialog).getByTestId('bulk-invite-count').textContent).toBe(
      'O invitație, 1 rămâne neinvitat'
    );
  });

  it('lists the people as they are now, not as an earlier visit left them', async () => {
    const dobre = invitee('Dobre', 'Cristian', { phone: '+40742115980' });
    const ene = invitee('Ene', 'Bogdan', { email: 'ene.bogdan@gmail.com' });
    mockApi([dobre, { ...ene, portal: 'invited' }]);
    const { dialog } = await openDialog([dobre, ene]);

    expect(within(dialog).getAllByTestId('bulk-invite-row')).toHaveLength(1);
    expect(within(dialog).queryByLabelText('Email sau telefon pentru Ene Bogdan')).toBeNull();
    expect(within(dialog).getByTestId('bulk-invite-on-portal').textContent).toContain(
      'Ene BogdanBrutarInvitat'
    );
    expect(within(dialog).getByTestId('bulk-invite-count').textContent).toBe('O invitație');
  });
});

describe('bulk invitation wording', () => {
  it.each([
    [0, '0 invitații'],
    [1, 'o invitație'],
    [4, '4 invitații'],
    [20, '20 de invitații'],
    [101, '101 invitații'],
  ])('counts %i as %s', (count, label) => {
    expect(invitationCount(count)).toBe(label);
  });

  it('says what was sent and for how many it did not work', () => {
    expect(sentSummary(0, 20)).toBe(
      'Nicio invitație nu a plecat. Pentru 20 de angajați nu a mers: vezi rândurile lor.'
    );
    expect(sentSummary(3, 1)).toBe(
      'Am trimis 3 invitații. Pentru un angajat nu a mers: vezi rândul lui.'
    );
    expect(sentSummary(21, 0)).toBe('Am trimis 21 de invitații.');
  });

  it('says how many invitations are ready to go, and none when there are none', () => {
    expect(pendingSummary(0, 3)).toBe('Nicio invitație de trimis');
    expect(pendingSummary(3, 0)).toBe('3 invitații');
    expect(pendingSummary(1, 2)).toBe('O invitație, 2 rămân neinvitați');
    expect(sendLabel(0)).toBe('Trimite invitațiile');
    expect(sendLabel(1)).toBe('Trimite invitația');
    expect(sendLabel(20)).toBe('Trimite 20 de invitații');
  });

  it('says how many stay uninvited', () => {
    expect(uninvitedCount(1)).toBe('1 rămâne neinvitat');
    expect(uninvitedCount(35)).toBe('35 rămân neinvitați');
  });

  it('names a few former employees and counts many', () => {
    const formers = ['Bârsan', 'Pop', 'Rusu', 'Toma'].map((name) =>
      invitee(name, 'Ion', { current: false })
    );
    expect(formerEmployeesSentence(formers.slice(0, 2))).toBe(
      'Bârsan Ion și Pop Ion nu apar: sunt foști angajați.'
    );
    expect(formerEmployeesSentence(formers)).toBe('4 foști angajați nu apar.');
  });
});
