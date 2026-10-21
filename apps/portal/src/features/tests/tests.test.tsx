import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answerPortalTestAttempt,
  finishPortalTestAttempt,
  getPortalMaterial,
  getPortalTestSheet,
  type PortalTestsResponse,
  startPortalTestAttempt,
  type TestAttemptOutcome,
  type TestAttemptResponseAttempt,
  useGetPortalEmployeeData,
  useGetPortalMe,
  useGetPortalSigningAgreementState,
  useGetPortalTests,
  useGetPortalTestStudyCard,
  useGetPortalTrainingSheets,
  useListPortalClientSignatureRequests,
  useListPortalSignatureRequests,
  useListPortalSigningAgreements,
  useListPortalTrainingRecords,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import {
  disposeRuntimes,
  employeeData,
  fakeAuthClient,
  fakeSession,
  mountPortal,
  participation,
  portalTests,
  queryResult,
  testStatus,
  trainingRecords,
} from '@/test/portal';

vi.mock('@/api/generated/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/generated/api')>()),
  useGetPortalMe: vi.fn(),
  useListPortalTrainingRecords: vi.fn(),
  useGetPortalEmployeeData: vi.fn(),
  useGetPortalTrainingSheets: vi.fn(),
  useListPortalSignatureRequests: vi.fn(),
  useListPortalClientSignatureRequests: vi.fn(),
  useListPortalSigningAgreements: vi.fn(),
  useGetPortalSigningAgreementState: vi.fn(),
  useGetPortalTests: vi.fn(),
  useGetPortalTestStudyCard: vi.fn(),
  startPortalTestAttempt: vi.fn(),
  answerPortalTestAttempt: vi.fn(),
  finishPortalTestAttempt: vi.fn(),
  getPortalMaterial: vi.fn(),
  getPortalTestSheet: vi.fn(),
}));

const { participantId } = participation();
const signedIn = () => fakeAuthClient(fakeSession());

type Attempt = TestAttemptResponseAttempt;

function attempt(id: string, answered = 0, prefix = 'Întrebarea'): Attempt {
  return {
    id,
    domain: 'ssm',
    test: 'hiring',
    startedAt: '2026-10-21T08:00:00Z',
    total: 10,
    questions: Array.from({ length: 10 }, (_, index) => ({
      questionId: `6f0c3e43-0c1b-4f4b-8a1e-00000000q${String(index).padStart(3, '0')}`,
      text: `${prefix} ${index + 1}: ce faci la locul de muncă?`,
      options: [{ text: 'Varianta A' }, { text: 'Varianta B' }, { text: 'Varianta C' }],
      chosen: index < answered ? [0] : [],
    })),
  };
}

const firstAttempt = attempt('6f0c3e43-0c1b-4f4b-8a1e-0000000a0001');

const outcome = (overrides: Partial<TestAttemptOutcome> = {}): TestAttemptOutcome => ({
  id: firstAttempt.id,
  domain: 'ssm',
  test: 'hiring',
  finishedAt: '2026-10-21T08:10:00Z',
  score: 7,
  total: 10,
  passed: true,
  mistakes: [],
  ...overrides,
});

const awaitingSsm = () =>
  portalTests({ ssm: { status: testStatus({ state: 'pending', awaitingTest: 'hiring' }) } });

const studyCard = {
  explanations: [
    'Legea 319/2006 este legea securității și sănătății în muncă.',
    'Echipamentul de protecție primit se poartă întotdeauna.',
  ],
  material: {
    revisionId: '6f0c3e43-0c1b-4f4b-8a1e-0000000d0001',
    title: 'Materialul de instruire introductiv-generală',
    issuedAt: '2026-10-01T09:00:00Z',
  },
};

beforeEach(() => {
  vi.mocked(useGetPortalMe).mockReturnValue(queryResult({ participations: [participation()] }));
  vi.mocked(useListPortalTrainingRecords).mockReturnValue(queryResult(trainingRecords()));
  vi.mocked(useGetPortalEmployeeData).mockReturnValue(queryResult(employeeData()));
  vi.mocked(useGetPortalTrainingSheets).mockReturnValue(
    queryResult({
      ssm: { ready: true, missing: [], stored: false, sequences: [] },
      psi: { ready: true, missing: [], stored: false, sequences: [] },
    })
  );
  vi.mocked(useListPortalSignatureRequests).mockReturnValue(queryResult({ items: [] }));
  vi.mocked(useListPortalClientSignatureRequests).mockReturnValue(queryResult({ items: [] }));
  vi.mocked(useListPortalSigningAgreements).mockReturnValue(queryResult({ items: [] }));
  vi.mocked(useGetPortalSigningAgreementState).mockReturnValue(
    queryResult({ agreement: null, unavailable: null })
  );
  vi.mocked(useGetPortalTests).mockReturnValue(queryResult(awaitingSsm()));
  vi.mocked(useGetPortalTestStudyCard).mockReturnValue(queryResult(studyCard));
  vi.mocked(startPortalTestAttempt).mockResolvedValue({ attempt: firstAttempt });
  vi.mocked(answerPortalTestAttempt).mockImplementation(
    async (_participant, attemptId, questionIndex, { chosen }) => {
      const answered = attempt(attemptId);
      answered.questions[Number(questionIndex)]!.chosen = chosen;
      return { attempt: answered };
    }
  );
  vi.mocked(finishPortalTestAttempt).mockResolvedValue(outcome());
});

afterEach(() => {
  disposeRuntimes();
  vi.mocked(startPortalTestAttempt).mockReset();
  vi.mocked(answerPortalTestAttempt).mockReset();
  vi.mocked(finishPortalTestAttempt).mockReset();
  vi.mocked(getPortalMaterial).mockReset();
  vi.mocked(getPortalTestSheet).mockReset();
});

async function openSitting(path = '/instruiri/test/ssm/hiring') {
  const user = userEvent.setup();
  mountPortal(signedIn(), path);
  await user.click(await screen.findByTestId('test-start'));
  await screen.findByTestId('test-sitting');
  return user;
}

const option = (text: string) => screen.getByRole('checkbox', { name: text });

describe('Acasă', () => {
  it('lists each awaiting test beside the signatures, leading to its page', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(
      queryResult(
        portalTests({
          ssm: { status: testStatus({ state: 'pending', awaitingTest: 'hiring' }) },
          psi: {
            status: testStatus({
              state: 'annual_due',
              awaitingTest: 'annual',
              lastPassedOn: '2025-10-01',
              dueOn: '2026-10-01',
            }),
          },
        })
      )
    );
    mountPortal(signedIn());

    const items = within(await screen.findByTestId('home-tests')).getAllByTestId('home-test-item');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Testul la angajare SSM te așteaptă'),
      expect.stringContaining('Testul anual PSI este scadent'),
    ]);
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      '/instruiri/test/ssm/hiring',
      '/instruiri/test/psi/annual',
    ]);
    expect(screen.getByTestId('home-todo')).toBeTruthy();
  });

  it('says a started test continues where it stopped', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(
      queryResult(
        portalTests({
          ssm: {
            status: testStatus({ state: 'pending', awaitingTest: 'hiring' }),
            inProgress: attempt(firstAttempt.id, 3),
          },
        })
      )
    );
    mountPortal(signedIn());
    expect((await screen.findByTestId('home-test-item')).textContent).toContain(
      'continui de unde ai rămas'
    );
  });

  it('shows nothing about tests while none awaits', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(queryResult(portalTests()));
    mountPortal(signedIn());
    await screen.findByTestId('home-todo');
    expect(screen.queryByTestId('home-tests')).toBeNull();
  });
});

describe('Instruiri', () => {
  it('shows per domain the test state and the results with day and grade, and links an awaiting test', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(
      queryResult(
        portalTests({
          ssm: { status: testStatus({ state: 'pending', awaitingTest: 'hiring' }) },
          psi: {
            status: testStatus({
              state: 'passed',
              lastPassedOn: '2026-02-03',
              dueOn: '2027-02-03',
            }),
            results: [
              {
                id: '6f0c3e43-0c1b-4f4b-8a1e-0000000e0001',
                employeeId: participation().employeeId!,
                domain: 'psi',
                test: 'hiring',
                takenOn: '2026-02-03',
                material: 'Test de verificare a cunoștințelor la angajare (TASU)',
                grade: 'admis',
                examiner: { name: 'Ioana Dinu', jobTitle: 'Cadru tehnic PSI' },
                source: 'portal',
                attemptId: '6f0c3e43-0c1b-4f4b-8a1e-0000000a0009',
                sheet: { available: true, signed: { trainee: 'signed', examiner: 'pending' } },
                createdAt: '2026-02-03T10:00:00Z',
                updatedAt: '2026-02-03T10:00:00Z',
              },
            ],
          },
        })
      )
    );
    mountPortal(signedIn(), '/instruiri');

    const ssm = await screen.findByTestId('training-tests-ssm');
    expect(within(ssm).getByTestId('training-test-state-ssm').textContent).toBe('De susținut');
    expect(within(ssm).getByTestId('training-test-open-ssm').textContent).toBe('Susține testul');
    expect(within(ssm).getByTestId('training-test-open-ssm').getAttribute('href')).toBe(
      '/instruiri/test/ssm/hiring'
    );

    const psi = screen.getByTestId('training-tests-psi');
    expect(within(psi).getByTestId('training-test-state-psi').textContent).toBe('Promovat');
    const result = within(psi).getByTestId('training-test-result');
    expect(result.textContent).toContain('Testul la angajare PSI');
    expect(result.textContent).toContain('Admis, 3 feb. 2026');
    expect(within(psi).getByTestId('training-test-due-psi').textContent).toBe(
      'Următorul test anual: 3 feb. 2027'
    );
    expect(within(psi).queryByTestId('training-test-open-psi')).toBeNull();
    expect(within(result).getByTestId('training-test-sheet-slots').textContent).toBe(
      'Semnătura ta: semnată. Examinatorul: de semnat.'
    );
    expect(within(result).queryByTestId('training-test-sheet-sign-hint')).toBeNull();
  });

  it('offers to continue a test in progress', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(
      queryResult(
        portalTests({
          ssm: {
            status: testStatus({ state: 'pending', awaitingTest: 'hiring' }),
            inProgress: attempt(firstAttempt.id, 2),
          },
        })
      )
    );
    mountPortal(signedIn(), '/instruiri');
    expect((await screen.findByTestId('training-test-open-ssm')).textContent).toBe(
      'Continuă testul'
    );
  });
});

describe('the test sheet in Instruiri', () => {
  type ResultRow = PortalTestsResponse['ssm']['results'][number];
  const result = (overrides: Partial<ResultRow> = {}): ResultRow => ({
    id: '6f0c3e43-0c1b-4f4b-8a1e-0000000e0002',
    employeeId: participation().employeeId!,
    domain: 'ssm',
    test: 'hiring',
    takenOn: '2026-10-21',
    material: 'Test de verificare a cunoștințelor la angajare (TASSM)',
    grade: 'admis',
    examiner: { name: 'Ana Ionescu', jobTitle: 'Inspector SSM' },
    source: 'portal',
    attemptId: firstAttempt.id,
    sheet: { available: true, signed: { trainee: 'pending', examiner: 'pending' } },
    createdAt: '2026-10-21T08:10:00Z',
    updatedAt: '2026-10-21T08:10:00Z',
    ...overrides,
  });

  const passedWith = (results: ResultRow[]) =>
    queryResult(
      portalTests({
        ssm: { status: testStatus({ state: 'passed', lastPassedOn: '2026-10-21' }), results },
      })
    );

  it('shows the two slots and sends the trainee to Semnături while their signature waits', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(passedWith([result()]));
    mountPortal(signedIn(), '/instruiri');

    const sheet = await screen.findByTestId('training-test-sheet');
    expect(sheet.textContent).toContain('Fișa de test');
    expect(within(sheet).getByTestId('training-test-sheet-slots').textContent).toBe(
      'Semnătura ta: de semnat. Examinatorul: de semnat.'
    );
    expect(within(sheet).getByTestId('training-test-sheet-sign-hint').textContent).toContain(
      'Fișa de test așteaptă semnătura ta, la Semnături.'
    );
    expect(within(sheet).getByTestId('training-test-sheet-sign').getAttribute('href')).toBe(
      '/semneaza'
    );
  });

  it('opens the test sheet as a PDF in a tab opened before the request', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(passedWith([result()]));
    const pending = document.createElement('p');
    const tab = {
      document: { write: vi.fn(), close: vi.fn(), title: '', querySelector: () => pending },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as never);
    URL.createObjectURL = vi.fn(() => 'blob:test-sheet');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(getPortalTestSheet).mockResolvedValue(new Blob(['%PDF']));
    mountPortal(signedIn(), '/instruiri');

    await userEvent.click(await screen.findByTestId('training-test-sheet-open'));

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(getPortalTestSheet).toHaveBeenCalledWith(
      participantId,
      '6f0c3e43-0c1b-4f4b-8a1e-0000000e0002',
      expect.objectContaining({ baseUrl: 'http://localhost:8787' })
    );
    expect(tab.document.title).toBe('Fișa de test la angajare SSM');
    expect(tab.location.replace).toHaveBeenCalledWith('blob:test-sheet');
  });

  it('says when the test sheet is not ready', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(passedWith([result()]));
    vi.spyOn(window, 'open').mockReturnValue({
      document: { write: vi.fn(), close: vi.fn(), title: '', querySelector: () => null },
      location: { replace: vi.fn() },
      close: vi.fn(),
    } as never);
    vi.mocked(getPortalTestSheet).mockRejectedValue(
      new ApiHttpError(404, {
        error: 'not_found',
        message: 'Nu.',
        reason: 'test_sheet_not_available',
      })
    );
    mountPortal(signedIn(), '/instruiri');
    await userEvent.click(await screen.findByTestId('training-test-sheet-open'));
    expect((await screen.findByTestId('training-test-sheet-error')).textContent).toContain(
      'Fișa de test nu este gata încă'
    );
  });

  it('shows no test sheet for a paper result', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(
      passedWith([
        result({
          source: 'paper',
          attemptId: null,
          sheet: { available: false, signed: { trainee: 'unassigned', examiner: 'unassigned' } },
        }),
      ])
    );
    mountPortal(signedIn(), '/instruiri');
    expect(await screen.findByTestId('training-test-result')).toBeTruthy();
    expect(screen.queryByTestId('training-test-sheet')).toBeNull();
  });
});

describe('the study card', () => {
  it('lists the explanations one per line, then the material, then the start', async () => {
    mountPortal(signedIn(), '/instruiri/test/ssm/hiring');

    const page = await screen.findByTestId('test-page');
    expect(within(page).getByRole('heading', { level: 1 }).textContent).toBe(
      'Testul la angajare SSM'
    );
    expect(screen.getAllByTestId('study-card-explanation').map((each) => each.textContent)).toEqual(
      studyCard.explanations
    );
    expect(screen.getByTestId('test-material').textContent).toContain(
      'Materialul de instruire introductiv-generală'
    );
    expect(screen.getByTestId('test-material').textContent).toContain('emis pe 1 oct. 2026');
    expect(screen.getByTestId('test-start').textContent).toBe('Începe testul');
  });

  it('opens the material as a PDF in a tab opened before the request', async () => {
    const pending = document.createElement('p');
    const tab = {
      document: { write: vi.fn(), close: vi.fn(), title: '', querySelector: () => pending },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as never);
    URL.createObjectURL = vi.fn(() => 'blob:material');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(getPortalMaterial).mockResolvedValue(new Blob(['%PDF']));
    mountPortal(signedIn(), '/instruiri/test/ssm/hiring');

    await userEvent.click(await screen.findByTestId('test-material-open'));

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(getPortalMaterial).toHaveBeenCalledWith(
      participantId,
      'ssm',
      expect.objectContaining({ baseUrl: 'http://localhost:8787' })
    );
    expect(tab.document.title).toBe('Materialul de instruire introductiv-generală');
    expect(pending.textContent).toBe('Se pregătește materialul…');
    expect(tab.location.replace).toHaveBeenCalledWith('blob:material');
  });

  it('says the material is not issued yet', async () => {
    vi.mocked(useGetPortalTestStudyCard).mockReturnValue(
      queryResult({ ...studyCard, material: null })
    );
    mountPortal(signedIn(), '/instruiri/test/ssm/hiring');
    expect((await screen.findByTestId('test-material-missing')).textContent).toContain(
      'Materialul de instruire nu este emis încă'
    );
    expect(screen.queryByTestId('test-material-open')).toBeNull();
  });

  it('says the material is not issued when its PDF answers 404', async () => {
    const tab = {
      document: { write: vi.fn(), close: vi.fn(), title: '', querySelector: () => null },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(tab as never);
    vi.mocked(getPortalMaterial).mockRejectedValue(
      new ApiHttpError(404, { error: 'not_found', message: 'Nu.', reason: 'material_not_issued' })
    );
    mountPortal(signedIn(), '/instruiri/test/ssm/hiring');
    await userEvent.click(await screen.findByTestId('test-material-open'));
    expect(await screen.findByTestId('test-material-missing')).toBeTruthy();
    expect(tab.close).toHaveBeenCalled();
  });

  it('resumes a test in progress at its first unanswered question', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(
      queryResult(
        portalTests({
          ssm: {
            status: testStatus({ state: 'pending', awaitingTest: 'hiring' }),
            inProgress: attempt(firstAttempt.id, 3),
          },
        })
      )
    );
    vi.mocked(startPortalTestAttempt).mockResolvedValue({
      attempt: attempt(firstAttempt.id, 3),
    });
    const user = userEvent.setup();
    mountPortal(signedIn(), '/instruiri/test/ssm/hiring');

    await user.click(await screen.findByRole('button', { name: 'Continuă testul' }));

    expect((await screen.findByTestId('test-counter')).textContent).toBe('4 din 10');
    expect(screen.getByTestId('test-question').textContent).toContain('Întrebarea 4');
    expect(startPortalTestAttempt).toHaveBeenCalledWith(
      participantId,
      'ssm',
      'hiring',
      expect.anything()
    );
  });

  it('starts nothing when the test does not await', async () => {
    vi.mocked(useGetPortalTests).mockReturnValue(
      queryResult(
        portalTests({
          ssm: { status: testStatus({ state: 'passed', lastPassedOn: '2026-10-01' }) },
        })
      )
    );
    mountPortal(signedIn(), '/instruiri/test/ssm/hiring');
    expect(await screen.findByTestId('test-not-awaiting')).toBeTruthy();
    expect(screen.queryByTestId('test-start')).toBeNull();
  });

  it('sends an unknown test back to Instruiri', async () => {
    mountPortal(signedIn(), '/instruiri/test/ssm/annual');
    expect(await screen.findByTestId('training-page')).toBeTruthy();
  });
});

describe('the sitting', () => {
  it('holds Continuă until an option is chosen, and saves the answer before moving on', async () => {
    const user = await openSitting();
    expect(screen.getByTestId('test-counter').textContent).toBe('1 din 10');
    expect(screen.getByTestId('test-sitting').textContent).toContain(
      'Pot fi corecte unul sau mai multe răspunsuri.'
    );
    expect(screen.getByTestId('test-next')).toHaveProperty('disabled', true);

    await user.click(screen.getAllByTestId('test-option')[2]!);
    await user.click(option('Varianta A'));
    expect(screen.getAllByTestId('test-option').map((row) => row.dataset.checked)).toEqual([
      'true',
      'false',
      'true',
    ]);
    await user.click(screen.getByTestId('test-next'));

    expect(answerPortalTestAttempt).toHaveBeenCalledWith(
      participantId,
      firstAttempt.id,
      '0',
      { chosen: [0, 2] },
      expect.anything()
    );
    expect((await screen.findByTestId('test-counter')).textContent).toBe('2 din 10');
    expect(screen.getByTestId('test-next')).toHaveProperty('disabled', true);
  });

  it('goes back with the answer kept, and does not save it again unchanged', async () => {
    const user = await openSitting();
    await user.click(option('Varianta B'));
    await user.click(screen.getByTestId('test-next'));
    await screen.findByText('2 din 10');

    await user.click(screen.getByTestId('test-back'));
    expect(screen.getByTestId('test-counter').textContent).toBe('1 din 10');
    expect(option('Varianta B')).toHaveProperty('checked', true);
    await user.click(screen.getByTestId('test-next'));
    await screen.findByText('2 din 10');
    expect(answerPortalTestAttempt).toHaveBeenCalledTimes(1);
  });

  it('stays on the question and says so when the answer cannot be saved', async () => {
    vi.mocked(answerPortalTestAttempt).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = await openSitting();
    await user.click(option('Varianta A'));
    await user.click(screen.getByTestId('test-next'));
    expect((await screen.findByTestId('test-sitting-error')).textContent).toContain(
      'Nu am putut salva răspunsul'
    );
    expect(screen.getByTestId('test-counter').textContent).toBe('1 din 10');
  });

  it('holds the options while the answer is being saved', async () => {
    let save!: () => void;
    vi.mocked(answerPortalTestAttempt).mockImplementationOnce(
      (_participant, attemptId, questionIndex, { chosen }) =>
        new Promise((resolve) => {
          save = () => {
            const answered = attempt(attemptId);
            answered.questions[Number(questionIndex)]!.chosen = chosen;
            resolve({ attempt: answered });
          };
        })
    );
    const user = await openSitting();
    await user.click(option('Varianta A'));
    await user.click(screen.getByTestId('test-next'));

    expect(option('Varianta B')).toHaveProperty('disabled', true);
    await user.click(option('Varianta B'));
    expect(option('Varianta B')).toHaveProperty('checked', false);
    save();
    await screen.findByText('2 din 10');
    await user.click(screen.getByTestId('test-back'));
    expect(option('Varianta A')).toHaveProperty('checked', true);
    expect(option('Varianta B')).toHaveProperty('checked', false);
  });

  it('sends the test from the last question and shows a pass', async () => {
    vi.mocked(startPortalTestAttempt).mockResolvedValue({
      attempt: attempt(firstAttempt.id, 9),
    });
    const user = await openSitting();
    expect(screen.getByTestId('test-counter').textContent).toBe('10 din 10');
    expect(screen.queryByTestId('test-next')).toBeNull();

    await user.click(option('Varianta C'));
    await user.click(screen.getByTestId('test-submit'));

    expect(answerPortalTestAttempt).toHaveBeenCalledWith(
      participantId,
      firstAttempt.id,
      '9',
      { chosen: [2] },
      expect.anything()
    );
    expect(finishPortalTestAttempt).toHaveBeenCalledWith(
      participantId,
      firstAttempt.id,
      expect.anything()
    );
    const result = await screen.findByTestId('test-result');
    expect(result.dataset.passed).toBe('true');
    expect(within(result).getByRole('heading', { level: 1 }).textContent).toBe(
      'Ai promovat testul'
    );
    expect(screen.getByTestId('test-score').textContent).toBe('7 din 10 răspunsuri corecte');
    expect(screen.getByTestId('test-result-trainings').getAttribute('href')).toBe('/instruiri');
    expect(screen.getByTestId('test-result-sheet').textContent).toBe(
      'Fișa de test, cu întrebările și răspunsurile tale, așteaptă semnătura ta la Semnături.'
    );
    expect(
      within(screen.getByTestId('test-result-sheet')).getByRole('link').getAttribute('href')
    ).toBe('/semneaza');
  });
});

describe('the result', () => {
  const failed = outcome({
    score: 5,
    passed: false,
    mistakes: [
      {
        index: 1,
        text: 'Purtarea echipamentului de protecție este obligatorie?',
        explanation: 'Echipamentul de protecție primit se poartă întotdeauna.',
      },
      { index: 6, text: 'Cine anunță un pericol?', explanation: null },
    ],
  });

  async function failOnce() {
    vi.mocked(startPortalTestAttempt).mockResolvedValueOnce({
      attempt: attempt(firstAttempt.id, 9),
    });
    vi.mocked(finishPortalTestAttempt).mockResolvedValueOnce(failed);
    const user = await openSitting();
    await user.click(option('Varianta A'));
    await user.click(screen.getByTestId('test-submit'));
    await screen.findByTestId('test-result');
    return user;
  }

  it('shows a failed score and each mistake with its explanation, never the right option', async () => {
    await failOnce();
    const result = screen.getByTestId('test-result');
    expect(result.dataset.passed).toBe('false');
    expect(within(result).getByRole('heading', { level: 1 }).textContent).toBe(
      'Nu ai promovat de data aceasta'
    );
    expect(screen.getByTestId('test-score').textContent).toBe('5 din 10 răspunsuri corecte');
    const mistakes = screen.getAllByTestId('test-mistake');
    expect(mistakes).toHaveLength(2);
    expect(mistakes[0]!.textContent).toContain('Întrebarea 2');
    expect(mistakes[0]!.textContent).toContain(
      'Purtarea echipamentului de protecție este obligatorie?'
    );
    expect(within(mistakes[0]!).getByTestId('test-mistake-explanation').textContent).toBe(
      'Echipamentul de protecție primit se poartă întotdeauna.'
    );
    expect(within(mistakes[1]!).queryByTestId('test-mistake-explanation')).toBeNull();
    expect(result.textContent).not.toContain('Varianta');
  });

  it('retakes the test with a new draw from the first question', async () => {
    const user = await failOnce();
    const retake = attempt('6f0c3e43-0c1b-4f4b-8a1e-0000000a0002', 0, 'Altă întrebare');
    vi.mocked(startPortalTestAttempt).mockResolvedValueOnce({ attempt: retake });

    await user.click(screen.getByTestId('test-retake'));

    expect(await screen.findByTestId('test-sitting')).toBeTruthy();
    expect(screen.getByTestId('test-counter').textContent).toBe('1 din 10');
    expect(screen.getByTestId('test-question').textContent).toContain('Altă întrebare 1');
    expect(startPortalTestAttempt).toHaveBeenCalledTimes(2);
  });

  it('goes back to the study card', async () => {
    const user = await failOnce();
    await user.click(screen.getByTestId('test-study'));
    await waitFor(() => expect(screen.getAllByTestId('study-card-explanation')).toHaveLength(2));
  });
});
