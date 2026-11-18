import type { BillingSmsUsage } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiHttpError } from '@/api/http';
import { impersonationRefusedMessage } from '@/features/impersonation/refusal';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { smsUsage } from '@/test/billing-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import { fullText } from '@/test/text';
import { noTests, untrained } from '@/test/training-fixture';

import { participantFailure } from './participant-errors';
import { formatTime } from './participant-format';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const employeePath = `/clients/${clientId}/employees/${employeeId}`;
const employeePage = `/clienti/${clientId}/angajati/${employeeId}`;
const statePath = `${employeePath}/participant`;
const invitePath = `${employeePath}/participant-invitations`;
const listPath = `/clients/${clientId}/participants`;
const invitationId = '3f2c1b0a-9e8d-4c7b-a6f5-e4d3c2b1a090';
const participantId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

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

const sampleEmployee = {
  id: employeeId,
  clientId,
  lastName: 'Popescu',
  firstName: 'Ion',
  cnp: null,
  employeeNumber: null,
  email: 'ion.popescu@example.com' as string | null,
  phone: '+40721000000' as string | null,
  jobTitle: 'Barista',
  jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Barista' },
  hiredAt: '2020-03-01',
  status: 'active',
  terminatedAt: null,
  birthDate: null,
  birthPlace: null,
  homeAddress: null,
  bloodGroup: null,
  rhFactor: null,
  notes: null,
  workplace: null,
  qualification: null,
  education: null,
  authorizations: null,
  commuteRoute: null,
  commuteMeans: [],
  commuteMeansOther: null,
  commuteMinutes: null,
  training: untrained,
  tests: noTests,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const invitation = (overrides: Record<string, unknown> = {}) => ({
  id: invitationId,
  clientId,
  kind: 'employee',
  employeeId,
  fullName: 'Popescu Ion',
  channel: 'email',
  address: 'ion.popescu@example.com',
  status: 'open',
  lastSentAt: '2026-10-17T09:00:00.000Z',
  resendableAt: minutesFromNow(8),
  expiresAt: '2026-11-16T09:00:00.000Z',
  createdAt: '2026-10-17T09:00:00.000Z',
  ...overrides,
});

const participant = (overrides: Record<string, unknown> = {}) => ({
  id: participantId,
  clientId,
  kind: 'employee',
  employeeId,
  fullName: 'Popescu Ion',
  channel: 'sms',
  address: '+40721000000',
  createdAt: '2026-10-10T09:00:00.000Z',
  revokedAt: null,
  noticeVersion: null,
  language: null,
  ...overrides,
});

const conflict = (reason: string, status = 409) =>
  Response.json({ error: 'conflict', message: reason, reason }, { status });

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi(
  routes: Partial<
    Record<
      'state' | 'invite' | 'list' | 'administrator' | 'resend' | 'revoke' | 'revokeAccess',
      Route
    >
  > & {
    client?: typeof sampleClient;
    employee?: typeof sampleEmployee;
    sms?: BillingSmsUsage;
  } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        smsThisMonth: routes.sms ?? null,
      });
    }
    if (pathname === `/clients/${clientId}`) {
      return Response.json({ client: routes.client ?? sampleClient });
    }
    if (pathname === employeePath) {
      return Response.json({ employee: routes.employee ?? sampleEmployee });
    }
    if (pathname === statePath) {
      return routes.state?.(init) ?? Response.json({ participant: null, invitation: null });
    }
    if (pathname === invitePath && method === 'POST') {
      return routes.invite?.(init) ?? Response.json(invitation(), { status: 201 });
    }
    if (pathname === listPath) {
      return routes.list?.(init) ?? Response.json({ participants: [], invitations: [] });
    }
    if (pathname === `/clients/${clientId}/participant-invitations` && method === 'POST') {
      return (
        routes.administrator?.(init) ??
        Response.json(invitation({ kind: 'client_administrator', employeeId: null }), {
          status: 201,
        })
      );
    }
    if (pathname === `/participant-invitations/${invitationId}/resend`) {
      return routes.resend?.(init) ?? Response.json(invitation());
    }
    if (pathname === `/participant-invitations/${invitationId}/revoke`) {
      return routes.revoke?.(init) ?? new Response(null, { status: 204 });
    }
    if (pathname === `/client-participants/${participantId}/revoke`) {
      return routes.revokeAccess?.(init) ?? new Response(null, { status: 204 });
    }
    if (pathname === `/clients/${clientId}/employees`) {
      return Response.json({ items: [sampleEmployee], page: 1, pageSize: 100, total: 1 });
    }
    if (pathname === `/clients/${clientId}/signature-requests`) {
      return Response.json({ items: [] });
    }
    return Response.json({ error: 'not_found', message: 'Not mocked.' }, { status: 404 });
  });
}

const requests = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
    )
    .map(([, init]) => (init?.body ? (JSON.parse(String(init.body)) as unknown) : null));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

const mountEmployee = () => mountApp(authFixture(makeSession()).client, employeePage);
const portalCard = () => screen.findByTestId('employee-portal-card');

describe("the employee's portal access", () => {
  it('shows both addresses, proposes the email, and invites at the phone when picked', async () => {
    let invited = false;
    mockApi({
      state: () => Response.json({ participant: null, invitation: invited ? invitation() : null }),
      invite: () => {
        invited = true;
        return Response.json(invitation({ channel: 'sms', address: '+40721000000' }), {
          status: 201,
        });
      },
    });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await within(card).findByTestId('participant-none');
    expect(card.textContent).toContain('ion.popescu@example.com');
    expect(card.textContent).toContain('+40721000000');

    await user.click(within(card).getByTestId('participant-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    const options = within(dialog).getAllByRole('radio');
    expect(options).toHaveLength(2);
    expect(
      (within(dialog).getByRole('radio', { name: /ion\.popescu@example\.com/ }) as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(
      (within(dialog).getByRole('radio', { name: /\+40721000000/ }) as HTMLInputElement).checked
    ).toBe(false);

    await user.click(within(dialog).getByRole('radio', { name: /\+40721000000/ }));
    await user.click(within(dialog).getByTestId('participant-invite-submit'));
    await waitFor(() =>
      expect(requests(invitePath, 'POST')).toEqual([{ channel: 'sms', address: '+40721000000' }])
    );
    await waitFor(() => expect(screen.queryByTestId('participant-invite-dialog')).toBeNull());
    expect(
      await screen.findByText(fullText('Invitația a fost trimisă pe +40721000000.'))
    ).toBeTruthy();
    expect((await within(card).findByTestId('participant-invitation-text')).textContent).toContain(
      'Invitat pe ion.popescu@example.com prin email la'
    );
  });

  it('invites at the proposed email without a pick', async () => {
    mockApi();
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await user.click(await within(card).findByTestId('participant-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    await user.click(within(dialog).getByTestId('participant-invite-submit'));
    await waitFor(() =>
      expect(requests(invitePath, 'POST')).toEqual([
        { channel: 'email', address: 'ion.popescu@example.com' },
      ])
    );
  });

  it('offers the email only during a trial, and says why', async () => {
    mockApi({ sms: smsUsage({ state: 'none', included: 0 }) });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await user.click(await within(card).findByTestId('participant-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    const phone = within(dialog).getByRole<HTMLInputElement>('radio', { name: /\+40721000000/ });
    expect(phone.disabled).toBe(true);
    expect(within(dialog).getByTestId('participant-invite-blocked').textContent).toBe(
      'SMS, după ce alegi un plan'
    );
    expect(within(dialog).getByTestId('participant-invite-sms-notice').textContent).toBe(
      'În perioada de probă nu trimitem SMS. Invitația și codurile de semnare pleacă pe email; SMS-urile pornesc când alegi un plan.'
    );
    await user.click(within(dialog).getByTestId('participant-invite-submit'));
    await waitFor(() =>
      expect(requests(invitePath, 'POST')).toEqual([
        { channel: 'email', address: 'ion.popescu@example.com' },
      ])
    );
  });

  it('asks for an email when the employee has only a number from outside Romania', async () => {
    mockApi({ employee: { ...sampleEmployee, email: null, phone: '+37369412507' } });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await user.click(await within(card).findByTestId('participant-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    expect(within(dialog).getByTestId('participant-invite-blocked').textContent).toBe(
      'SMS doar spre numere din România'
    );
    expect(within(dialog).getByTestId('participant-invite-sms-notice').textContent).toContain(
      'Lucrătorul are doar un număr din Republica Moldova, iar SMS trimitem doar spre numere din România.'
    );
    expect(within(dialog).getByRole('link', { name: 'Modifică datele' })).toBeTruthy();
    expect(within(dialog).queryByTestId('participant-invite-submit')).toBeNull();
  });

  it('picks the only address the employee has', async () => {
    mockApi({ employee: { ...sampleEmployee, phone: null } });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await user.click(await within(card).findByTestId('participant-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    const options = within(dialog).getAllByRole('radio');
    expect(options).toHaveLength(1);
    expect((options[0] as HTMLInputElement).checked).toBe(true);
  });

  it('asks for an email or a phone first when the employee has neither', async () => {
    mockApi({ employee: { ...sampleEmployee, email: null, phone: null } });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await user.click(await within(card).findByTestId('participant-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    const notice = within(dialog).getByTestId('participant-invite-no-address');
    expect(notice.textContent).toContain('nu are email sau telefon');
    expect(within(notice).getByRole('link', { name: 'Modifică datele' }).getAttribute('href')).toBe(
      `${employeePage}/editare`
    );
    expect(within(dialog).queryByTestId('participant-invite-submit')).toBeNull();
  });

  it('words a refused invitation in the dialog', async () => {
    mockApi({ invite: () => conflict('employee_already_invited') });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await user.click(await within(card).findByTestId('participant-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    await user.click(within(dialog).getByRole('radio', { name: /ion\.popescu/ }));
    await user.click(within(dialog).getByTestId('participant-invite-submit'));
    expect((await within(dialog).findByTestId('participant-invite-error')).textContent).toContain(
      'are deja o invitație deschisă la cealaltă adresă'
    );
  });

  it('says a saved invitation whose message failed can be resent', async () => {
    mockApi({ invite: () => conflict('participant_message_not_sent', 503) });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await user.click(await within(card).findByTestId('participant-invite'));
    const dialog = await screen.findByTestId('participant-invite-dialog');
    await user.click(within(dialog).getByRole('radio', { name: /ion\.popescu/ }));
    await user.click(within(dialog).getByTestId('participant-invite-submit'));
    await waitFor(() => expect(screen.queryByTestId('participant-invite-dialog')).toBeNull());
    expect((await within(card).findByTestId('employee-portal-message')).textContent).toContain(
      'Invitația a fost salvată'
    );
  });

  it('keeps the resend closed until the 10 minutes are over', async () => {
    const resendableAt = minutesFromNow(8);
    mockApi({
      state: () => Response.json({ participant: null, invitation: invitation({ resendableAt }) }),
    });
    mountEmployee();
    const card = await portalCard();
    const resend = await within(card).findByTestId('participant-invitation-resend');
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    expect(within(card).getByTestId('participant-invitation-hint').textContent).toBe(
      `Poți retrimite după ora ${formatTime(resendableAt)}.`
    );
    expect(within(card).getByTestId('participant-invitation-text').textContent).toContain(
      'Invitația expiră pe'
    );
    expect(within(card).queryByTestId('participant-invite')).toBeNull();
  });

  it('resends an expired invitation', async () => {
    mockApi({
      state: () =>
        Response.json({
          participant: null,
          invitation: invitation({ status: 'expired', resendableAt: minutesFromNow(-60) }),
        }),
    });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    expect((await within(card).findByTestId('participant-invitation-text')).textContent).toContain(
      'a expirat pe'
    );
    await user.click(within(card).getByTestId('participant-invitation-resend'));
    await waitFor(() =>
      expect(requests(`/participant-invitations/${invitationId}/resend`, 'POST')).toHaveLength(1)
    );
    expect(
      await screen.findByText(fullText('Am retrimis invitația pe ion.popescu@example.com.'))
    ).toBeTruthy();
  });

  it('revokes an open invitation after confirming', async () => {
    let revoked = false;
    mockApi({
      state: () => Response.json({ participant: null, invitation: revoked ? null : invitation() }),
      revoke: () => {
        revoked = true;
        return new Response(null, { status: 204 });
      },
    });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    await user.click(await within(card).findByTestId('participant-invitation-revoke'));
    await user.click(await screen.findByTestId('participant-invitation-revoke-dialog-confirm'));
    expect(await within(card).findByTestId('participant-none')).toBeTruthy();
    expect(requests(`/participant-invitations/${invitationId}/revoke`, 'POST')).toHaveLength(1);
  });

  it('shows an active participant and revokes their access, keeping the records', async () => {
    let revoked = false;
    mockApi({
      state: () => Response.json({ participant: revoked ? null : participant(), invitation: null }),
      revokeAccess: () => {
        revoked = true;
        return new Response(null, { status: 204 });
      },
    });
    const user = userEvent.setup();
    mountEmployee();
    const card = await portalCard();
    expect((await within(card).findByTestId('participant-active-text')).textContent).toMatch(
      /^Are acces la portal cu \+40721000000 din /
    );
    await user.click(within(card).getByTestId('participant-revoke'));
    const dialog = await screen.findByTestId('participant-revoke-dialog');
    expect(dialog.textContent).toContain('Instruirile, fișele și celelalte date rămân');
    await user.click(within(dialog).getByTestId('participant-revoke-dialog-confirm'));
    expect(await within(card).findByTestId('participant-none')).toBeTruthy();
    expect(within(card).getByTestId('participant-invite')).toBeTruthy();
  });

  it('offers no invitation at an archived client', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-10-01T10:00:00+00:00' } });
    mountEmployee();
    const card = await portalCard();
    await within(card).findByTestId('participant-none');
    expect(within(card).queryByTestId('participant-invite')).toBeNull();
  });
});

describe('the training tab', () => {
  it('no longer shows the client administrator, who is on the Portal tab', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/instruire`);
    await screen.findByTestId('training-page');
    await screen.findByTestId('responsible-persons-card');
    expect(screen.queryByTestId('client-administrator-panel')).toBeNull();
  });
});

describe('participant failures', () => {
  it('says when a message can be resent', () => {
    const resendableAt = '2026-10-17T09:10:00.000Z';
    expect(
      participantFailure(new ApiHttpError(409, { reason: 'sent_recently' }), resendableAt).message
    ).toBe(
      `Am trimis deja un mesaj la această adresă în ultimele 10 minute. Poți retrimite după ora ${formatTime(resendableAt)}.`
    );
  });

  it('words each refusal in Romanian', () => {
    const message = (reason: string, status = 409) =>
      participantFailure(new ApiHttpError(status, { reason })).message;
    expect(message('employee_has_participant')).toBe('Lucrătorul are deja acces la portal.');
    expect(message('address_has_participant')).toContain('aparține deja unui participant');
    expect(message('address_not_of_employee')).toContain('nu mai este cea din datele lucrătorului');
    expect(message('invalid_address')).toContain('nu poate primi o invitație');
    expect(message('client_archived')).toContain('arhivat');
    expect(message('client_is_lead')).toContain('ofertă');
    expect(message('sms_trial')).toBe(
      'În perioada de probă nu trimitem SMS. Trimite invitația pe email; SMS-urile pornesc când se alege un plan.'
    );
    expect(message('sms_foreign_number', 422)).toBe(
      'SMS trimitem doar spre numere din România (+40). Trimite invitația pe email.'
    );
    expect(participantFailure(new ApiHttpError(409, { reason: 'sms_trial' })).aboutAddress).toBe(
      true
    );
    expect(
      participantFailure(new ApiHttpError(503, { reason: 'participant_account_unavailable' }))
    ).toMatchObject({ saved: true, message: expect.stringContaining('salvată') });
  });

  it('gives an impersonation refusal its own reason, not a failed connection', () => {
    expect(
      participantFailure(new ApiHttpError(403, { reason: 'impersonation_refused' }))
    ).toMatchObject({ message: impersonationRefusedMessage, saved: false, aboutAddress: false });
  });
});
