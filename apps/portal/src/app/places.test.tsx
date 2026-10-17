import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPortalTrainingSheet,
  useGetPortalEmployeeData,
  useGetPortalEmployeeTrainingSheets,
  useGetPortalMe,
  useGetPortalTrainingSheets,
  useListPortalClientEmployees,
  useListPortalEmployeeTrainingRecords,
  useListPortalTrainingRecords,
} from '@/api/generated/api';
import {
  disposeRuntimes,
  employeeData,
  fakeAuthClient,
  fakeSession,
  mountPortal,
  participation,
  queryPending,
  queryResult,
  trainingRecords,
  trainingStatus,
} from '@/test/portal';

vi.mock('@/api/generated/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/generated/api')>()),
  useGetPortalMe: vi.fn(),
  useListPortalTrainingRecords: vi.fn(),
  useGetPortalEmployeeData: vi.fn(),
  useGetPortalTrainingSheets: vi.fn(),
  getPortalTrainingSheet: vi.fn(),
  useListPortalClientEmployees: vi.fn(),
  useListPortalEmployeeTrainingRecords: vi.fn(),
  useGetPortalEmployeeTrainingSheets: vi.fn(),
}));

const sheetsReady = { ssm: { ready: true, missing: [] }, psi: { ready: true, missing: [] } };

beforeEach(() => {
  vi.mocked(useGetPortalMe).mockReturnValue(queryResult({ participations: [participation()] }));
  vi.mocked(useListPortalTrainingRecords).mockReturnValue(queryResult(trainingRecords()));
  vi.mocked(useGetPortalEmployeeData).mockReturnValue(queryResult(employeeData()));
  vi.mocked(useGetPortalTrainingSheets).mockReturnValue(queryResult(sheetsReady));
  vi.mocked(useListPortalClientEmployees).mockReturnValue(queryPending());
  vi.mocked(useListPortalEmployeeTrainingRecords).mockReturnValue(queryPending());
  vi.mocked(useGetPortalEmployeeTrainingSheets).mockReturnValue(queryPending());
});

afterEach(disposeRuntimes);

const signedIn = (user?: { email?: string; phone?: string }) => fakeAuthClient(fakeSession(user));

describe('Acasă', () => {
  it('shows the employee, the client, the position, nothing to sign and the training per domain', async () => {
    mountPortal(signedIn(), '/');
    const home = await screen.findByTestId('portal-home');

    expect(within(home).getByRole('heading', { level: 1 }).textContent).toBe('Pop Ana');
    expect(home.textContent).toContain('Mobilă Bună S.A.');
    expect(screen.getByTestId('home-position').textContent).toBe('Tâmplar');
    expect(screen.getByTestId('home-todo').textContent).toContain('Nimic de semnat deocamdată');
    expect(screen.getByTestId('training-state-ssm').textContent).toBe('La zi');
    expect(screen.getByTestId('training-state-psi').textContent).toBe('Depășită');
    expect(screen.getByTestId('training-due-ssm').textContent).toBe('12 martie 2027');
    expect(screen.getByTestId('training-last-psi').textContent).toBe('3 februarie 2026');
    expect(screen.getByTestId('training-summary-link').getAttribute('href')).toBe('/instruiri');
  });

  it('shows a client administrator the employees with how many are due and overdue', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({
        participations: [participation({ kind: 'client_administrator', employeeId: null })],
      })
    );
    const employee = (id: string, ssm: string, psi: string) => ({
      id,
      lastName: 'Pop',
      firstName: id,
      position: 'Tâmplar',
      workplace: null,
      training: {
        ssm: trainingStatus({ state: ssm as 'current' }),
        psi: trainingStatus({ state: psi as 'current' }),
      },
    });
    vi.mocked(useListPortalClientEmployees).mockReturnValue(
      queryResult({
        items: [
          employee('a', 'current', 'current'),
          employee('b', 'due', 'current'),
          employee('c', 'due', 'overdue'),
        ],
      })
    );
    mountPortal(signedIn(), '/');

    expect((await screen.findByTestId('home-employees')).getAttribute('href')).toBe('/angajati');
    expect(screen.getByTestId('home-employees-count').textContent).toBe('3');
    expect(screen.getByTestId('home-employees-due').textContent).toBe('1');
    expect(screen.getByTestId('home-employees-overdue').textContent).toBe('1');
    expect(screen.queryByTestId('training-summary-ssm')).toBeNull();
  });
});

describe('Instruiri', () => {
  it('lists the records newest first with phase, material, trainer and duration', async () => {
    mountPortal(signedIn(), '/instruiri');

    const records = await screen.findAllByTestId('training-record');
    expect(records).toHaveLength(2);
    expect(records[0]!.textContent).toContain('12 septembrie 2026');
    expect(records[0]!.textContent).toContain('Periodică');
    expect(records[0]!.textContent).toContain('Radu Stan, Șef de atelier');
    expect(records[0]!.textContent).toContain('1 h 30 min');
    expect(within(records[1]!).getByTestId('training-record-domain').textContent).toBe('PSI');
    expect(records[1]!.textContent).toContain('8 h');
  });

  it('says when no training is recorded yet', async () => {
    vi.mocked(useListPortalTrainingRecords).mockReturnValue(
      queryResult(trainingRecords({ items: [] }))
    );
    mountPortal(signedIn(), '/instruiri');
    expect((await screen.findByTestId('training-records-empty')).textContent).toBe(
      'Nicio instruire înregistrată încă.'
    );
  });

  it('says what a sheet that is not ready lacks, for the specialist to fill', async () => {
    vi.mocked(useGetPortalTrainingSheets).mockReturnValue(
      queryResult({
        ssm: { ready: false, missing: ['employee.commute_route', 'employee.workplace'] },
        psi: { ready: false, missing: ['employee.workplace'] },
      })
    );
    mountPortal(signedIn(), '/instruiri');

    expect((await screen.findByTestId('training-sheet-ssm-missing')).textContent).toBe(
      'Fișa nu poate fi întocmită încă: lipsesc traseul de deplasare și punctul de lucru; spune-i specialistului.'
    );
    expect(screen.getByTestId('training-sheet-psi-missing').textContent).toBe(
      'Fișa nu poate fi întocmită încă: lipsește punctul de lucru; spune-i specialistului.'
    );
    expect(screen.queryByTestId('training-sheet-ssm-open')).toBeNull();
  });

  it('opens a ready sheet as a PDF in a tab opened before the request', async () => {
    const tab = {
      document: { write: vi.fn(), close: vi.fn(), title: '' },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as never);
    URL.createObjectURL = vi.fn(() => 'blob:sheet');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(getPortalTrainingSheet).mockResolvedValue(new Blob(['%PDF']));
    mountPortal(signedIn(), '/instruiri');

    await userEvent.click(await screen.findByTestId('training-sheet-psi-open'));

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(getPortalTrainingSheet).toHaveBeenCalledWith(
      participation().participantId,
      'psi',
      expect.objectContaining({ baseUrl: 'http://localhost:8787' })
    );
    expect(tab.location.replace).toHaveBeenCalledWith('blob:sheet');
    open.mockRestore();
  });
});

describe('Datele mele', () => {
  it('shows the identification data as the sheets print it and who corrects it', async () => {
    mountPortal(signedIn(), '/datele-mele');

    const data = await screen.findByTestId('my-data');
    const fact = (label: string) =>
      within(data).getByText(label).nextElementSibling?.textContent ?? '';
    expect(fact('Nume și prenume')).toBe('Pop Ana');
    expect(fact('Număr matricol')).toBe('M-17');
    expect(fact('Locul de muncă')).toBe('Atelierul din Lugoj');
    expect(fact('Data și locul nașterii')).toBe('4 mai 1990, Timișoara');
    expect(fact('Grupa sanguină și Rh')).toBe('A(II), Rh pozitiv');
    expect(fact('Autorizații')).toBe('Necompletat');
    expect(fact('Durata deplasării')).toBe('15 min');
    expect(fact('Data angajării')).toBe('15 februarie 2024');
    expect(screen.getByTestId('my-data-correction').textContent).toBe(
      'Ceva nu e corect? Spune-i specialistului: Prevenție Vest S.R.L., 0722 000 111.'
    );
    expect(screen.getByRole('link', { name: '0722 000 111' }).getAttribute('href')).toBe(
      'tel:0722000111'
    );
  });
});

describe('Contul meu', () => {
  it('shows the address signed in with, the client and the provider', async () => {
    mountPortal(signedIn({ email: '', phone: '40721234567' }), '/contul-meu');

    expect((await screen.findByTestId('account-address')).textContent).toBe('+40721234567');
    expect(screen.getByTestId('account-client').textContent).toBe('Mobilă Bună S.A.');
    expect(screen.getByTestId('account-provider').textContent).toBe('Prevenție Vest S.R.L.');
    expect(screen.queryByTestId('account-switch')).toBeNull();
    expect(screen.getByTestId('account-privacy-notice').getAttribute('href')).toBe('/informare');
    expect(screen.getByTestId('sign-out')).toBeTruthy();
  });

  it('offers to switch the client when there are several', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({
        participations: [
          participation(),
          participation({ participantId: '6f0c3e43-0c1b-4f4b-8a1e-000000000002' }),
        ],
      })
    );
    localStorage.setItem('ssm-usor.portal.participant.user-1', participation().participantId);
    mountPortal(signedIn(), '/contul-meu');

    expect((await screen.findByTestId('account-switch')).getAttribute('href')).toBe('/alege');
  });

  it('shows the privacy notice again, read-only', async () => {
    mountPortal(signedIn(), '/informare');
    expect((await screen.findByTestId('privacy-notice-text')).textContent).toContain(
      'Mobilă Bună S.A. este angajatorul tău'
    );
    expect(screen.queryByTestId('privacy-notice-accept')).toBeNull();
  });
});

describe('Angajați', () => {
  beforeEach(() => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({
        participations: [participation({ kind: 'client_administrator', employeeId: null })],
      })
    );
    vi.mocked(useListPortalClientEmployees).mockReturnValue(
      queryResult({
        items: [
          {
            id: '6f0c3e43-0c1b-4f4b-8a1e-0000000000e2',
            lastName: 'Ionescu',
            firstName: 'Dan',
            position: 'Șofer',
            workplace: 'Depozit',
            training: {
              ssm: trainingStatus({ state: 'due', dueOn: '2026-11-01' }),
              psi: trainingStatus({ state: 'untrained', dueOn: null }),
            },
          },
        ],
      })
    );
  });

  it('lists the client employees with their two training states', async () => {
    mountPortal(signedIn(), '/angajati');

    const row = await screen.findByTestId('employee-row');
    expect(row.textContent).toContain('Ionescu Dan');
    expect(row.textContent).toContain('Șofer · Depozit');
    expect(within(row).getByTestId('employee-state-ssm').textContent).toBe('Scadentă');
    expect(row.textContent).toContain('până la 1 noiembrie 2026');
    expect(within(row).getByTestId('employee-state-psi').textContent).toBe('Neinstruit');
    expect(row.getAttribute('href')).toBe('/angajati/6f0c3e43-0c1b-4f4b-8a1e-0000000000e2');
  });

  it("opens an employee's records and sheets", async () => {
    vi.mocked(useListPortalEmployeeTrainingRecords).mockReturnValue(queryResult(trainingRecords()));
    vi.mocked(useGetPortalEmployeeTrainingSheets).mockReturnValue(queryResult(sheetsReady));
    mountPortal(signedIn(), '/angajati/6f0c3e43-0c1b-4f4b-8a1e-0000000000e2');

    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Ionescu Dan');
    expect(screen.getAllByTestId('training-record')).toHaveLength(2);
    expect(screen.getByTestId('training-sheet-ssm-open')).toBeTruthy();
    expect(useListPortalEmployeeTrainingRecords).toHaveBeenCalledWith(
      participation().participantId,
      '6f0c3e43-0c1b-4f4b-8a1e-0000000000e2',
      expect.anything()
    );
  });

  it('keeps an employee out of the administrator pages', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(queryResult({ participations: [participation()] }));
    const runtime = mountPortal(signedIn(), '/angajati');
    expect(await screen.findByTestId('portal-home')).toBeTruthy();
    expect(runtime.router.state.location.pathname).toBe('/');
  });
});
