import { currentPrivacyNoticeVersion } from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useGetPortalEmployeeData,
  useGetPortalMe,
  useGetPortalTrainingSheets,
  useListPortalClientEmployees,
  useListPortalResponsiblePersons,
  useListPortalTrainingRecords,
  useRecordPortalNotice,
} from '@/api/generated/api';
import {
  disposeRuntimes,
  fakeAuthClient,
  fakeSession,
  mountPortal,
  participation,
  queryFailure,
  queryPending,
  queryResult,
} from '@/test/portal';

vi.mock('@/api/generated/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/generated/api')>()),
  useGetPortalMe: vi.fn(),
  useRecordPortalNotice: vi.fn(),
  useListPortalTrainingRecords: vi.fn(),
  useGetPortalEmployeeData: vi.fn(),
  useGetPortalTrainingSheets: vi.fn(),
  useListPortalClientEmployees: vi.fn(),
  useListPortalResponsiblePersons: vi.fn(),
}));

const recordNotice = vi.fn();

beforeEach(() => {
  vi.mocked(useGetPortalMe).mockReturnValue(queryResult({ participations: [participation()] }));
  vi.mocked(useRecordPortalNotice).mockReturnValue({
    mutate: recordNotice,
    isPending: false,
    isError: false,
  } as never);
  vi.mocked(useListPortalTrainingRecords).mockReturnValue(queryPending());
  vi.mocked(useGetPortalEmployeeData).mockReturnValue(queryPending());
  vi.mocked(useGetPortalTrainingSheets).mockReturnValue(queryPending());
  vi.mocked(useListPortalClientEmployees).mockReturnValue(queryPending());
  vi.mocked(useListPortalResponsiblePersons).mockReturnValue(queryPending());
});

afterEach(() => {
  disposeRuntimes();
  recordNotice.mockReset();
});

const signedIn = () => fakeAuthClient(fakeSession());

const barEntries = async () =>
  within(await screen.findByTestId('portal-bar'))
    .getAllByRole('link')
    .map((link) => link.textContent);

describe('the participant shell', () => {
  it('sends a signed-out visitor from the home page to the sign-in page', async () => {
    mountPortal(fakeAuthClient(), '/');
    expect(await screen.findByTestId('sign-in-page')).toBeTruthy();
  });

  it('sends a signed-out deep link to the sign-in page', async () => {
    const runtime = mountPortal(fakeAuthClient(), '/instruiri');
    expect(await screen.findByTestId('sign-in-page')).toBeTruthy();
    expect(runtime.router.state.location.pathname).toBe('/sign-in');
  });

  it('sends a signed-in participant away from the sign-in page', async () => {
    mountPortal(signedIn(), '/sign-in');
    expect(await screen.findByTestId('portal-home')).toBeTruthy();
  });

  it('tells an account that is a participant nowhere that it has no access, and signs it out', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(queryFailure(403));
    const client = signedIn();
    mountPortal(client, '/');

    expect(await screen.findByTestId('portal-no-access')).toBeTruthy();
    expect(screen.queryByTestId('portal-bar')).toBeNull();
    await userEvent.click(screen.getByTestId('sign-out'));
    expect(client.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await screen.findByTestId('sign-in-page')).toBeTruthy();
  });

  it('offers a retry when the participations could not be loaded', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(queryFailure(500));
    mountPortal(signedIn(), '/');
    expect(await screen.findByTestId('portal-load-error')).toBeTruthy();
  });

  it('shows the privacy notice first, naming the employer and the provider', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({ participations: [participation({ noticeVersion: null })] })
    );
    mountPortal(signedIn(), '/instruiri');

    const notice = await screen.findByTestId('privacy-notice');
    expect(notice.textContent).toContain('Mobilă Bună S.A. este angajatorul tău');
    expect(notice.textContent).toContain('Prevenție Vest S.R.L.');
    expect(notice.textContent).toContain('Legea nr. 319/2006');
    expect(
      within(notice).getByRole('link', { name: 'politica de confidențialitate' })
    ).toHaveProperty('href', 'https://ssmusor.ro/confidentialitate');
    expect(within(notice).queryByRole('checkbox')).toBeNull();
    expect(screen.queryByTestId('portal-bar')).toBeNull();

    await userEvent.click(screen.getByTestId('privacy-notice-accept'));
    expect(recordNotice).toHaveBeenCalledWith(
      {
        participantId: participation().participantId,
        data: { version: currentPrivacyNoticeVersion },
      },
      expect.anything()
    );
  });

  it("tells a client administrator they see the employees on the employer's behalf", async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({
        participations: [
          participation({ kind: 'client_administrator', employeeId: null, noticeVersion: null }),
        ],
      })
    );
    mountPortal(signedIn(), '/');

    const notice = await screen.findByTestId('privacy-notice');
    expect(notice.textContent).toContain('Ai acces la portal pentru Mobilă Bună S.A.');
    expect(notice.textContent).not.toContain('angajatorul tău');
    expect(screen.getByTestId('privacy-notice-administrator').textContent).toContain(
      'în numele angajatorului'
    );
    expect(notice.textContent).toContain('Legea nr. 319/2006');
    expect(within(notice).queryByRole('checkbox')).toBeNull();
    expect(screen.getByTestId('privacy-notice-accept').textContent).toBe('Am înțeles');
  });

  it('shows the notice again when it was accepted in an older version', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({ participations: [participation({ noticeVersion: '2020-01-01' })] })
    );
    mountPortal(signedIn(), '/');
    expect(await screen.findByTestId('privacy-notice')).toBeTruthy();
  });

  it('gives an employee the four places and marks the current one', async () => {
    mountPortal(signedIn(), '/instruiri');
    expect(await barEntries()).toEqual(['Acasă', 'Instruiri', 'Datele mele', 'Contul meu']);
    expect(screen.getByTestId('portal-bar-instruiri').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('portal-bar-home').getAttribute('aria-current')).toBeNull();
  });

  it('leaves Contul meu to the account menu from 640 px, where the header holds the places', async () => {
    mountPortal(signedIn(), '/');
    const account = (await screen.findByTestId('portal-bar-contul-meu')).closest('li');
    expect(account?.className).toContain('sm:hidden');
    expect(screen.getByTestId('portal-bar-home').closest('li')?.className ?? '').not.toContain(
      'sm:hidden'
    );
  });

  it('opens the account menu with the name, the client, Contul meu and signing out', async () => {
    const client = signedIn();
    mountPortal(client, '/');

    const trigger = await screen.findByTestId('account-menu');
    expect(trigger.textContent).toContain('PA');
    expect(trigger.textContent).toContain('Pop Ana');
    expect(trigger.textContent).toContain('Mobilă Bună S.A.');
    await userEvent.click(trigger);
    expect((await screen.findByTestId('account-menu-account')).getAttribute('href')).toBe(
      '/contul-meu'
    );
    expect(screen.queryByTestId('account-menu-switch')).toBeNull();

    await userEvent.click(screen.getByTestId('account-menu-sign-out'));
    expect(client.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await screen.findByTestId('sign-in-page')).toBeTruthy();
  });

  it('offers to switch the client from the account menu when there are several', async () => {
    const other = participation({ participantId: '6f0c3e43-0c1b-4f4b-8a1e-000000000002' });
    localStorage.setItem('ssm-usor.portal.participant.user-1', participation().participantId);
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({ participations: [participation(), other] })
    );
    mountPortal(signedIn(), '/');

    await userEvent.click(await screen.findByTestId('account-menu'));
    expect((await screen.findByTestId('account-menu-switch')).getAttribute('href')).toBe('/alege');
  });

  it('names the provider in the footer and links the notice and the privacy policy', async () => {
    mountPortal(signedIn(), '/');
    const footer = await screen.findByTestId('portal-footer');
    expect(footer.textContent).toContain('Prestator SSM: Prevenție Vest S.R.L.');
    expect(within(footer).getByTestId('footer-privacy-notice').getAttribute('href')).toBe(
      '/informare'
    );
    expect(
      within(footer).getByRole('link', { name: 'Politica de confidențialitate' })
    ).toHaveProperty('href', 'https://ssmusor.ro/confidentialitate');
    expect(within(footer).getByTestId('commit-version').textContent).toMatch(/^Versiune \S+$/);
  });

  it('gives a client administrator without an employee row three places', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({
        participations: [participation({ kind: 'client_administrator', employeeId: null })],
      })
    );
    mountPortal(signedIn(), '/');
    expect(await barEntries()).toEqual(['Acasă', 'Angajați', 'Contul meu']);
  });

  it('gives a client administrator who is an employee their own trainings and data from Acasă', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({ participations: [participation({ kind: 'client_administrator' })] })
    );
    mountPortal(signedIn(), '/');
    expect(await barEntries()).toEqual(['Acasă', 'Angajați', 'Instruiri', 'Contul meu']);
    expect(screen.getByTestId('home-my-data')).toBeTruthy();
  });

  it('asks an account with several participations which client to open and remembers it', async () => {
    const other = participation({
      participantId: '6f0c3e43-0c1b-4f4b-8a1e-000000000002',
      clientName: 'Brutăria Veche S.R.L.',
      kind: 'client_administrator',
      employeeId: null,
    });
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({ participations: [participation(), other] })
    );
    const runtime = mountPortal(signedIn(), '/instruiri');

    const options = await screen.findAllByTestId('participation-option');
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('Mobilă Bună S.A.'),
      expect.stringContaining('Brutăria Veche S.R.L.'),
    ]);
    await userEvent.click(options[1]!);

    expect(await screen.findByTestId('portal-home')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Brutăria Veche S.R.L.');
    expect(localStorage.getItem('ssm-usor.portal.participant.user-1')).toBe(other.participantId);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/'));
  });

  it('opens the remembered client straight away', async () => {
    const other = participation({
      participantId: '6f0c3e43-0c1b-4f4b-8a1e-000000000002',
      clientName: 'Brutăria Veche S.R.L.',
    });
    localStorage.setItem('ssm-usor.portal.participant.user-1', other.participantId);
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({ participations: [participation(), other] })
    );
    mountPortal(signedIn(), '/');

    const home = await screen.findByTestId('portal-home');
    expect(within(home).getByText('Brutăria Veche S.R.L.')).toBeTruthy();
  });
});
