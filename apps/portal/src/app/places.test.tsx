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
  useListPortalResponsiblePersons,
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
  useListPortalResponsiblePersons: vi.fn(),
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
  vi.mocked(useListPortalResponsiblePersons).mockReturnValue(queryPending());
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
    expect(screen.getByTestId('training-state-ssm').className).toContain('bg-success');
    expect(screen.getByTestId('training-state-psi').textContent).toBe('Depășită');
    expect(screen.getByTestId('training-due-ssm').textContent).toBe('12 mar. 2027');
    expect(screen.getByTestId('training-last-psi').textContent).toBe('3 feb. 2026');
    expect(screen.getByTestId('training-summary-link').getAttribute('href')).toBe('/instruiri');
    expect(screen.getByTestId('home-position').parentElement?.textContent).toBe(
      'Tâmplar, marca M-17'
    );
  });

  it('says a domain without a training has none recorded yet, and nothing else', async () => {
    vi.mocked(useListPortalTrainingRecords).mockReturnValue(
      queryResult(
        trainingRecords({
          items: [trainingRecords().items[0]!],
          training: {
            ssm: trainingStatus(),
            psi: trainingStatus({ state: 'untrained', dueOn: null }),
          },
        })
      )
    );
    mountPortal(signedIn(), '/');

    const psi = await screen.findByTestId('training-summary-psi');
    expect(within(psi).getByTestId('training-state-psi').textContent).toBe('Neinstruit');
    expect(within(psi).getByTestId('training-untrained-psi').textContent).toBe(
      'Prima instruire PSI nu a fost încă înregistrată.'
    );
    expect(within(psi).queryByRole('term')).toBeNull();
    expect(screen.getByTestId('training-summary-sheet-ssm').textContent).toBe(
      'Fișa individuală SSM, PDF'
    );
  });

  it('sums up the employee data beside the training, with the provider to ask', async () => {
    const data = employeeData();
    data.employee.commuteRoute = null;
    vi.mocked(useGetPortalEmployeeData).mockReturnValue(queryResult(data));
    mountPortal(signedIn(), '/');

    const link = await screen.findByTestId('home-my-data');
    expect(link.getAttribute('href')).toBe('/datele-mele');
    const card = link.closest('section')!;
    expect(within(card).getByText('Traseu de deplasare').nextElementSibling?.textContent).toBe(
      'Necompletat'
    );
    expect(screen.getByRole('heading', { name: 'Ceva nu e corect?' })).toBeTruthy();
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

  it("shows a client administrator the client's responsible persons with their roles", async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({
        participations: [participation({ kind: 'client_administrator', employeeId: null })],
      })
    );
    vi.mocked(useListPortalResponsiblePersons).mockReturnValue(
      queryResult({
        items: [
          {
            id: '6f0c3e43-0c1b-4f4b-8a1e-0000000000b1',
            fullName: 'Radu Stan',
            jobTitle: 'Șef de atelier',
            roles: ['workplace_manager', 'fire_intervention_leader'],
            employeeId: '6f0c3e43-0c1b-4f4b-8a1e-0000000000e3',
            workplace: 'Atelierul din Lugoj',
          },
        ],
      })
    );
    mountPortal(signedIn(), '/');

    const person = await screen.findByTestId('responsible-person');
    expect(person.textContent).toContain('Radu Stan');
    expect(person.textContent).toContain('Șef de atelier, Atelierul din Lugoj');
    expect(within(person).getByTestId('responsible-person-roles').textContent).toBe(
      'Conducător al locului de muncă, Șef echipă de primă intervenție'
    );
  });

  it('says when the client has designated nobody yet', async () => {
    vi.mocked(useGetPortalMe).mockReturnValue(
      queryResult({
        participations: [participation({ kind: 'client_administrator', employeeId: null })],
      })
    );
    vi.mocked(useListPortalResponsiblePersons).mockReturnValue(queryResult({ items: [] }));
    mountPortal(signedIn(), '/');

    expect((await screen.findByTestId('responsible-persons-empty')).textContent).toBe(
      'Nicio persoană responsabilă desemnată încă.'
    );
  });

  it("does not show an employee the client's responsible persons", async () => {
    mountPortal(signedIn(), '/');
    expect(await screen.findByTestId('portal-home')).toBeTruthy();
    expect(screen.queryByTestId('responsible-persons')).toBeNull();
    expect(useListPortalResponsiblePersons).not.toHaveBeenCalled();
  });
});

describe('Instruiri', () => {
  it('lists the records newest first by year, with phase, material, trainer and duration', async () => {
    vi.mocked(useListPortalTrainingRecords).mockReturnValue(
      queryResult(
        trainingRecords({
          items: [
            ...trainingRecords().items,
            {
              ...trainingRecords().items[0]!,
              id: '6f0c3e43-0c1b-4f4b-8a1e-0000000000a3',
              phase: 'workplace',
              heldOn: '2025-07-01',
              durationMinutes: 61,
              admission: { admittedOn: '2025-07-01', name: 'Radu Stan', jobTitle: 'Șef' },
            },
          ],
        })
      )
    );
    mountPortal(signedIn(), '/instruiri');

    const records = await screen.findAllByTestId('training-record');
    expect(records).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Fișele tale',
      '2026',
      '2025',
    ]);
    expect(records[0]!.textContent).toContain('12 sept. 2026');
    expect(records[0]!.textContent).toContain('Instruire periodică');
    expect(records[0]!.textContent).toContain(
      'Instructor Radu Stan, Șef de atelier. 1 oră și 30 de minute.'
    );
    expect(within(records[1]!).getByTestId('training-record-domain').textContent).toBe('PSI');
    expect(records[1]!.textContent).toContain('8 ore.');
    expect(records[2]!.textContent).toContain('Instruire la locul de muncă, admis la lucru');
    expect(records[2]!.textContent).toContain('1 oră și 1 minut.');
  });

  it('counts the records of a ready sheet and says when it was last updated', async () => {
    mountPortal(signedIn(), '/instruiri');
    expect((await screen.findByTestId('training-sheet-ssm')).textContent).toContain(
      '1 instruire, actualizată 12 sept. 2026'
    );
  });

  it('says a sheet without a training of its domain comes with the first one', async () => {
    vi.mocked(useListPortalTrainingRecords).mockReturnValue(
      queryResult(trainingRecords({ items: [trainingRecords().items[0]!] }))
    );
    mountPortal(signedIn(), '/instruiri');

    expect((await screen.findByTestId('training-sheet-psi-untrained')).textContent).toBe(
      'Se întocmește după prima instruire PSI.'
    );
    expect(screen.queryByTestId('training-sheet-psi-open')).toBeNull();
    expect(screen.getByTestId('training-sheet-ssm-open')).toBeTruthy();
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
    const pending = document.createElement('p');
    const tab = {
      document: { write: vi.fn(), close: vi.fn(), title: '', querySelector: () => pending },
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
    expect(tab.document.title).toBe('Fișa individuală PSI');
    expect(pending.textContent).toBe('Se pregătește fișa…');
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
    expect(
      within(data)
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(['La locul de muncă', 'Date personale', 'Traseul de deplasare']);
    expect(fact('Nume și prenume')).toBe('Pop Ana');
    expect(fact('Marca')).toBe('M-17');
    expect(fact('Punct de lucru')).toBe('Atelierul din Lugoj');
    expect(fact('Angajat din')).toBe('15 februarie 2024');
    expect(fact('Data și locul nașterii')).toBe('4 mai 1990, Timișoara');
    expect(fact('Grupa sanguină')).toBe('A(II), Rh pozitiv');
    expect(fact('Autorizații')).toBe('Necompletat');
    expect(fact('Ruta')).toBe('Pe jos, pe strada Lungă');
    expect(fact('Durata')).toBe('15 minute');
    expect(data.textContent).toContain('accident de muncă');

    const correction = screen.getByTestId('my-data-correction');
    expect(correction.textContent).toContain('Ceva nu e corect?');
    expect(correction.textContent).toContain(
      'Spune-i specialistului SSM: Prevenție Vest S.R.L., 0722 000 111.'
    );
    expect(within(correction).getByRole('link', { name: '0722 000 111' })).toHaveProperty(
      'href',
      'tel:0722000111'
    );
  });

  it('marks an empty commute as not filled, since the SSM sheet needs it', async () => {
    const data = employeeData();
    data.employee.commuteRoute = null;
    data.employee.commuteMinutes = 25;
    vi.mocked(useGetPortalEmployeeData).mockReturnValue(queryResult(data));
    mountPortal(signedIn(), '/datele-mele');

    const facts = await screen.findByTestId('my-data');
    expect(within(facts).getByText('Ruta').nextElementSibling?.textContent).toBe('Necompletat');
    expect(within(facts).getByText('Durata').nextElementSibling?.textContent).toBe('25 de minute');
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
    expect(row.textContent).toContain('Șofer, Depozit');
    expect(within(row).getByTestId('employee-state-ssm').textContent).toBe('Scadentă');
    expect(row.textContent).toContain('până la 1 noiembrie 2026');
    expect(within(row).getByTestId('employee-state-psi').textContent).toBe('Neinstruit');
    expect(row.getAttribute('href')).toBe('/angajati/6f0c3e43-0c1b-4f4b-8a1e-0000000000e2');
  });

  it('finds an employee by name, without diacritics', async () => {
    vi.mocked(useListPortalClientEmployees).mockReturnValue(
      queryResult({
        items: ['Ionescu Dan', 'Țăran Ștefan', 'Popa Ana'].map((name, index) => ({
          id: `6f0c3e43-0c1b-4f4b-8a1e-0000000000f${index}`,
          lastName: name.split(' ')[0]!,
          firstName: name.split(' ')[1]!,
          position: 'Șofer',
          workplace: null,
          training: { ssm: trainingStatus(), psi: trainingStatus() },
        })),
      })
    );
    mountPortal(signedIn(), '/angajati');

    await userEvent.type(await screen.findByTestId('employees-search'), 'stefan tar');
    const rows = screen.getAllByTestId('employee-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('Țăran Ștefan');

    await userEvent.clear(screen.getByTestId('employees-search'));
    await userEvent.type(screen.getByTestId('employees-search'), 'Zamfir');
    expect(screen.getByTestId('employees-no-match').textContent).toBe(
      'Niciun angajat cu acest nume.'
    );
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
