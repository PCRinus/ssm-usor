import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useGetPortalEmployeeData,
  useGetPortalMe,
  useGetPortalTrainingSheets,
  useListPortalTrainingRecords,
  useSetPortalLanguage,
} from '@/api/generated/api';
import {
  disposeRuntimes,
  employeeData,
  fakeAuthClient,
  fakeSession,
  mountPortal,
  participation,
  queryResult,
  trainingRecords,
} from '@/test/portal';

import { browserLocale } from './locale';

vi.mock('@/api/generated/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/generated/api')>()),
  useGetPortalMe: vi.fn(),
  useListPortalTrainingRecords: vi.fn(),
  useGetPortalEmployeeData: vi.fn(),
  useGetPortalTrainingSheets: vi.fn(),
  useSetPortalLanguage: vi.fn(),
}));

const mutate = vi.fn();

beforeEach(() => {
  vi.mocked(useGetPortalMe).mockReturnValue(queryResult({ participations: [participation()] }));
  vi.mocked(useListPortalTrainingRecords).mockReturnValue(queryResult(trainingRecords()));
  vi.mocked(useGetPortalEmployeeData).mockReturnValue(queryResult(employeeData()));
  vi.mocked(useGetPortalTrainingSheets).mockReturnValue(
    queryResult({ ssm: { ready: true, missing: [] }, psi: { ready: true, missing: [] } })
  );
  mutate.mockReset();
  vi.mocked(useSetPortalLanguage).mockReturnValue({ mutate } as never);
});

afterEach(disposeRuntimes);

const browserSays = (...languages: string[]) =>
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);

const signedIn = () => fakeAuthClient(fakeSession());

describe('the browser rule', () => {
  it('is Romanian when any of the languages is Romanian, English otherwise', () => {
    expect(browserLocale(['ro-RO'])).toBe('ro');
    expect(browserLocale(['en-US', 'RO'])).toBe('ro');
    expect(browserLocale(['de-DE', 'en-GB'])).toBe('en');
    expect(browserLocale(['hu-HU'])).toBe('en');
  });

  it('opens the sign-in page in English for a browser without Romanian', async () => {
    browserSays('en-US', 'en');
    mountPortal(fakeAuthClient(), '/sign-in');

    expect(await screen.findByRole('heading', { name: 'Sign in to the portal' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('SSM Ușor portal');
    expect(screen.getByTestId('language-en').getAttribute('aria-pressed')).toBe('true');
  });

  it('lets a choice made on the sign-in page win over the browser', async () => {
    browserSays('en-US');
    localStorage.setItem('ssm-usor.portal.language', 'ro');
    mountPortal(fakeAuthClient(), '/sign-in');

    expect(await screen.findByRole('heading', { name: 'Intră în portal' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('ro');
  });

  it("lets the participation's language win over the sign-in choice", async () => {
    localStorage.setItem('ssm-usor.portal.language', 'ro');
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({ participations: [participation({ language: 'en' })] })
    );
    mountPortal(signedIn(), '/');

    const summary = await screen.findByTestId('training-summary-ssm');
    expect(within(summary).getByRole('heading').textContent).toBe('SSM training');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('the switch', () => {
  it('in the header saves the language on the participation and shows the portal in English', async () => {
    const person = userEvent.setup();
    mountPortal(signedIn(), '/');
    await screen.findByTestId('portal-home');
    expect(screen.getByTestId('training-due-ssm').textContent).toBe('12 mar. 2027');

    const header = screen.getByTestId('portal-bar').closest('header')!;
    const group = within(header).getByRole('group', { name: 'Limba' });
    await person.click(within(group).getByRole('button', { name: 'English' }));

    expect(mutate).toHaveBeenCalledWith(
      { participantId: participation().participantId, data: { language: 'en' } },
      expect.anything()
    );
    await waitFor(() =>
      expect(screen.getByTestId('training-due-ssm').textContent).toBe('12 Mar 2027')
    );
    expect(screen.getByRole('heading', { name: 'Your training' })).toBeTruthy();
    expect(screen.getByTestId('training-state-psi').textContent).toBe('Overdue');
    expect(screen.getByTestId('portal-bar-home').textContent).toBe('Home');
    expect(within(header).getByRole('group', { name: 'Language' })).toBeTruthy();
    expect(
      within(group).getByRole('button', { name: 'English' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(localStorage.getItem('ssm-usor.portal.language')).toBe('en');
  });

  it('on Contul meu does the same, for the phone', async () => {
    const person = userEvent.setup();
    mountPortal(signedIn(), '/contul-meu');

    const row = await screen.findByTestId('account-language');
    expect(within(row).getByText('Limba')).toBeTruthy();
    await person.click(within(row).getByRole('button', { name: 'English' }));

    expect(mutate).toHaveBeenCalledWith(
      { participantId: participation().participantId, data: { language: 'en' } },
      expect.anything()
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'My account' })).toBeTruthy();
    expect(within(row).getByText('Language')).toBeTruthy();
    expect(screen.getByText('You sign in with')).toBeTruthy();
  });

  it('on the sign-in page keeps the address typed and the code step', async () => {
    const person = userEvent.setup();
    mountPortal(fakeAuthClient(), '/sign-in');

    await person.type(await screen.findByTestId('sign-in-address'), 'ana@example.ro');
    await person.click(screen.getByRole('button', { name: 'English' }));

    expect(await screen.findByRole('heading', { name: 'Sign in to the portal' })).toBeTruthy();
    expect(screen.getByTestId('sign-in-address')).toHaveProperty('value', 'ana@example.ro');
    expect(localStorage.getItem('ssm-usor.portal.language')).toBe('en');
    expect(mutate).not.toHaveBeenCalled();

    await person.click(screen.getByTestId('sign-in-request'));
    expect(
      await screen.findByRole('heading', { name: 'Enter the code you received' })
    ).toBeTruthy();
    await person.type(screen.getByTestId('sign-in-code'), '123');
    await person.click(screen.getByRole('button', { name: 'Română' }));

    expect(await screen.findByRole('heading', { name: 'Scrie codul primit' })).toBeTruthy();
    expect(screen.getByTestId('sign-in-code-target').textContent).toBe('ana@example.ro');
    expect(screen.getByTestId('sign-in-code')).toHaveProperty('value', '123');
  });
});
