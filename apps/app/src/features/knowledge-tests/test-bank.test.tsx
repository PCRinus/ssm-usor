import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { bankTestFacts } from './test-format';

type Question = {
  id: string;
  domain: 'ssm' | 'psi';
  test: 'hiring' | 'annual';
  position: number;
  text: string;
  options: { text: string; correct: boolean }[];
  explanation: string | null;
  citation: string | null;
  builtIn: boolean;
  hidden: boolean;
  replacesQuestionId: string | null;
  createdAt: string;
  updatedAt: string;
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const builtIn = (n: number, overrides: Partial<Question> = {}): Question => ({
  id: uuid(n),
  domain: 'ssm',
  test: 'hiring',
  position: n,
  text: `Întrebarea predefinită ${n}: cine răspunde de securitatea lucrătorilor?`,
  options: [
    { text: 'Angajatorul', correct: true },
    { text: 'Colegul de birou', correct: false },
    { text: 'Nimeni', correct: false },
  ],
  explanation: null,
  citation: null,
  builtIn: true,
  hidden: false,
  replacesQuestionId: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  ...overrides,
});

const firstAid = builtIn(1, {
  text: 'Ce faci întâi când un coleg s-a electrocutat?',
  options: [
    { text: 'Îl atingi ca să vezi dacă respiră', correct: false },
    { text: 'Întrerupi curentul', correct: true },
    { text: 'Suni la 112', correct: true },
  ],
  explanation:
    'Victima rămâne sub tensiune cât timp curentul nu este întrerupt; cine o atinge se electrocutează și el.',
  citation: 'HG 1425/2006, anexa 11',
});

const ownQuestion: Question = {
  ...builtIn(20),
  text: 'Unde este trusa de prim ajutor în atelier?',
  options: [
    { text: 'Lângă ușa de evacuare', correct: true },
    { text: 'În biroul contabilității', correct: false },
  ],
  builtIn: false,
};

const ssmQuestions = (overrides: Question[] = []) => [
  firstAid,
  ...Array.from({ length: 9 }, (_, index) => builtIn(index + 2)),
  ...overrides,
];

const bankTest = (
  domain: 'ssm' | 'psi',
  test: 'hiring' | 'annual',
  code: string,
  questions: Question[]
) => ({
  domain,
  test,
  code,
  title: code,
  activeCount: questions.filter((question) => !question.hidden).length,
  questions,
});

const fireHiring = builtIn(40, {
  domain: 'psi',
  test: 'hiring',
  text: 'Ce faci la auzul alarmei de incendiu?',
});
const fireAnnual = builtIn(41, {
  domain: 'psi',
  test: 'annual',
  text: 'Cât de des se verifică stingătorul?',
});

const bank = (ssm: Question[]) => ({
  sittingSize: 10,
  minimumActiveQuestions: 10,
  passMarkPercent: 70,
  tests: [
    bankTest('ssm', 'hiring', 'TASSM', ssm),
    bankTest('psi', 'hiring', 'TASU', [fireHiring]),
    bankTest('psi', 'annual', 'TPSU', [fireAnnual]),
  ],
});

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();

function mockApi(routes: Partial<Record<string, Handler>> = {}, questions = ssmQuestions()) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.pathname}`;
    const route = routes[key];
    if (route) return route(url, init);
    if (key === 'GET /me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (key === 'GET /organization/tests/questions') {
      const domain = url.searchParams.get('domain');
      const all = bank(questions);
      return Response.json({ ...all, tests: all.tests.filter((test) => test.domain === domain) });
    }
    throw new Error(`Unexpected request: ${key}${url.search}`);
  });
}

const requests = (method: string, pathname: string) =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        (init?.method ?? 'GET') === method && new URL(String(input)).pathname === pathname
    )
    .map(([input, init]) => ({
      url: new URL(String(input)),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }));

const refused = () =>
  Response.json(
    {
      error: 'conflict',
      message: 'Un test trebuie să păstreze cel puțin zece întrebări active.',
      reason: 'test_below_minimum',
    },
    { status: 409 }
  );

const mount = (path = '/tests') => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the question bank', () => {
  it('words the active count, the sitting size and the pass mark', () => {
    const fixed = { sittingSize: 10, passMarkPercent: 70 };
    expect(bankTestFacts({ activeCount: 12 }, fixed)).toBe(
      '12 întrebări active · se extrag 10 · prag 70 %'
    );
    expect(bankTestFacts({ activeCount: 1 }, fixed)).toBe(
      '1 întrebare activă · se extrag 10 · prag 70 %'
    );
    expect(bankTestFacts({ activeCount: 20 }, fixed)).toBe(
      '20 de întrebări active · se extrag 10 · prag 70 %'
    );
  });

  it('opens on the occupational safety tests from the sidebar and lists the questions in order', async () => {
    mockApi({}, ssmQuestions([builtIn(11, { hidden: true, text: 'O întrebare ascunsă' })]));
    const runtime = mount('/dashboard');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('nav-tests'));
    await screen.findByTestId('test-bank-ssm');
    expect(runtime.router.state.location.pathname).toBe('/tests/ssm');
    expect(
      within(screen.getByTestId('nav-tests-group'))
        .getAllByTestId('nav-sub-entry')
        .map((link) => link.textContent)
    ).toEqual(['Teste SSM', 'Teste PSI']);
    expect(
      requests('GET', '/organization/tests/questions')[0]!.url.searchParams.get('domain')
    ).toBe('ssm');

    const [card] = screen.getAllByTestId('test-bank-test');
    expect(card!.textContent).toContain('Testul la angajare');
    expect(card!.textContent).toContain('TASSM');
    expect(within(card!).getByTestId('test-bank-facts').textContent).toBe(
      '10 întrebări active · se extrag 10 · prag 70 %'
    );
    const questions = within(card!).getAllByTestId('test-question');
    expect(questions).toHaveLength(11);
    const first = within(questions[0]!);
    expect(first.getByTestId('test-question-text').textContent).toBe(
      'Ce faci întâi când un coleg s-a electrocutat?'
    );
    expect(first.getByTestId('test-question-kind').textContent).toBe('Predefinită');
    expect(
      first.getAllByTestId('test-question-option').map((option) => option.dataset.correct)
    ).toEqual(['false', 'true', 'true']);
    expect(first.getByTestId('test-question-explanation').textContent).toContain(
      'Victima rămâne sub tensiune'
    );
    expect(first.getByTestId('test-question-citation').textContent).toBe(
      'Temei: HG 1425/2006, anexa 11'
    );
    expect(first.queryByTestId('test-question-edit')).toBeNull();
    expect(first.getByTestId('test-question-hide')).toBeTruthy();

    const hidden = within(questions[10]!);
    expect(questions[10]!.dataset.hidden).toBe('true');
    expect(hidden.getByTestId('test-question-hidden').textContent).toBe('Ascunsă');
    expect(hidden.getByTestId('test-question-restore')).toBeTruthy();
    expect(hidden.queryByTestId('test-question-explanation')).toBeNull();
  });

  it('shows the fire-safety hiring and annual tests on their own tab', async () => {
    mockApi();
    mount('/tests/psi');
    await screen.findByTestId('test-bank-psi');
    const cards = screen.getAllByTestId('test-bank-test');
    expect(cards.map((card) => card.dataset.test)).toEqual(['hiring', 'annual']);
    expect(cards[1]!.textContent).toContain('TPSU');
  });

  it('says why a built-in cannot be hidden at ten active questions', async () => {
    mockApi({ [`PUT /organization/tests/questions/${uuid(2)}/hidden`]: refused });
    mount('/tests/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    await user.click(within(questions[1]!).getByTestId('test-question-hide'));
    expect((await screen.findByTestId('test-bank-error')).textContent).toBe(
      'Un test trebuie să păstreze cel puțin zece întrebări active.'
    );
    expect(requests('PUT', `/organization/tests/questions/${uuid(2)}/hidden`)).toHaveLength(1);
  });

  it('hides a built-in and restores a hidden one without asking first', async () => {
    const hiddenOne = builtIn(11, { hidden: true });
    mockApi(
      {
        [`PUT /organization/tests/questions/${uuid(2)}/hidden`]: () =>
          Response.json({ question: { ...builtIn(2), hidden: true } }),
        [`DELETE /organization/tests/questions/${uuid(11)}/hidden`]: () =>
          Response.json({ question: { ...hiddenOne, hidden: false } }),
      },
      ssmQuestions([ownQuestion, hiddenOne])
    );
    mount('/tests/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    await user.click(within(questions[1]!).getByTestId('test-question-hide'));
    await waitFor(() =>
      expect(requests('PUT', `/organization/tests/questions/${uuid(2)}/hidden`)).toHaveLength(1)
    );
    await user.click(within(questions[11]!).getByTestId('test-question-restore'));
    await waitFor(() =>
      expect(requests('DELETE', `/organization/tests/questions/${uuid(11)}/hidden`)).toHaveLength(1)
    );
    expect(screen.queryByTestId('test-bank-error')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('adds an own question to the test of its card, with two options of which one is correct', async () => {
    mockApi({
      'POST /organization/tests/questions': () =>
        Response.json({ question: ownQuestion }, { status: 201 }),
    });
    mount('/tests/ssm');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('test-question-add'));
    const dialog = within(await screen.findByTestId('test-question-dialog'));
    expect((dialog.getByTestId('test-question-test') as HTMLInputElement).value).toBe(
      'Testul la angajare (TASSM)'
    );
    await user.type(dialog.getByTestId('test-question-text'), ownQuestion.text);
    const options = dialog.getAllByTestId('test-question-option-text');
    expect(options).toHaveLength(3);
    await user.type(options[0]!, 'Lângă ușa de evacuare');
    await user.type(options[1]!, 'În biroul contabilității');
    await user.click(dialog.getByTestId('test-question-submit'));
    expect((await dialog.findByTestId('test-question-option-2-error')).textContent).toBe(
      'Scrie varianta sau scoate-o.'
    );

    await user.click(dialog.getAllByTestId('test-question-option-remove')[2]!);
    await user.click(dialog.getByTestId('test-question-submit'));
    expect((await dialog.findByTestId('test-question-options-error')).textContent).toBe(
      'Marchează cel puțin o variantă corectă.'
    );
    await user.click(dialog.getAllByTestId('test-question-option-correct')[0]!);
    await user.type(dialog.getByTestId('test-question-citation'), 'HG 1425/2006, art. 89');
    await user.click(dialog.getByTestId('test-question-submit'));
    await waitFor(() => expect(screen.queryByTestId('test-question-dialog')).toBeNull());
    expect(requests('POST', '/organization/tests/questions')[0]!.body).toEqual({
      domain: 'ssm',
      test: 'hiring',
      text: ownQuestion.text,
      options: [
        { text: 'Lângă ușa de evacuare', correct: true },
        { text: 'În biroul contabilității', correct: false },
      ],
      explanation: null,
      citation: 'HG 1425/2006, art. 89',
    });
  });

  it('chooses between the two fire-safety tests when adding from the annual one', async () => {
    mockApi({
      'POST /organization/tests/questions': () =>
        Response.json({ question: ownQuestion }, { status: 201 }),
    });
    mount('/tests/psi');
    const user = userEvent.setup();
    await screen.findByTestId('test-bank-psi');
    await user.click(screen.getAllByTestId('test-question-add')[1]!);
    const dialog = within(await screen.findByTestId('test-question-dialog'));
    expect((dialog.getByTestId('test-question-test') as HTMLSelectElement).value).toBe('annual');
  });

  it('edits an own question and keeps the built-in it departs from', async () => {
    const replacing = { ...ownQuestion, replacesQuestionId: uuid(3) };
    mockApi(
      {
        [`PATCH /organization/tests/questions/${ownQuestion.id}`]: (_url, init) =>
          Response.json({ question: { ...replacing, ...JSON.parse(String(init?.body)) } }),
      },
      ssmQuestions([replacing])
    );
    mount('/tests/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    const own = within(questions[10]!);
    expect(own.getByTestId('test-question-kind').textContent).toBe('Proprie');
    expect(own.queryByTestId('test-question-hide')).toBeNull();
    await user.click(own.getByTestId('test-question-edit'));
    const dialog = within(await screen.findByTestId('test-question-dialog'));
    expect((dialog.getByTestId('test-question-text') as HTMLTextAreaElement).value).toBe(
      ownQuestion.text
    );
    await user.type(
      dialog.getByTestId('test-question-explanation'),
      'Trusa stă lângă ieșire ca să fie la îndemână.'
    );
    await user.click(dialog.getByTestId('test-question-submit'));
    await waitFor(() => expect(screen.queryByTestId('test-question-dialog')).toBeNull());
    expect(requests('PATCH', `/organization/tests/questions/${ownQuestion.id}`)[0]!.body).toEqual({
      text: ownQuestion.text,
      options: ownQuestion.options,
      explanation: 'Trusa stă lângă ieșire ca să fie la îndemână.',
      citation: null,
      replacesQuestionId: uuid(3),
    });
  });

  it('says when the question being edited was deleted meanwhile', async () => {
    mockApi(
      {
        [`PATCH /organization/tests/questions/${ownQuestion.id}`]: () =>
          Response.json({ error: 'not_found', message: 'x' }, { status: 404 }),
      },
      ssmQuestions([ownQuestion])
    );
    mount('/tests/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    await user.click(within(questions[10]!).getByTestId('test-question-edit'));
    const dialog = within(await screen.findByTestId('test-question-dialog'));
    await user.click(dialog.getByTestId('test-question-submit'));
    expect((await dialog.findByTestId('test-question-error')).textContent).toBe(
      'Întrebarea nu mai există: altcineva a șters-o între timp. Reîncarcă pagina.'
    );
  });

  it('deletes an own question after a confirmation, and words a refusal below ten', async () => {
    let refuse = true;
    mockApi(
      {
        [`DELETE /organization/tests/questions/${ownQuestion.id}`]: () =>
          refuse ? refused() : new Response(null, { status: 204 }),
      },
      ssmQuestions([ownQuestion])
    );
    mount('/tests/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    await user.click(within(questions[10]!).getByTestId('test-question-delete'));
    const dialog = within(await screen.findByTestId('test-question-delete-dialog'));
    expect(dialog.getByText(`„${ownQuestion.text}”`)).toBeTruthy();
    await user.click(dialog.getByTestId('test-question-delete-confirm'));
    expect((await dialog.findByTestId('test-question-delete-error')).textContent).toBe(
      'Un test trebuie să păstreze cel puțin zece întrebări active.'
    );
    refuse = false;
    await user.click(dialog.getByTestId('test-question-delete-confirm'));
    await waitFor(() => expect(screen.queryByTestId('test-question-delete-dialog')).toBeNull());
    expect(requests('DELETE', `/organization/tests/questions/${ownQuestion.id}`)).toHaveLength(2);
  });

  it('previews a question as the employee sees it, the correct options unmarked and the explanation after a wrong answer', async () => {
    mockApi();
    mount('/tests/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    await user.click(within(questions[0]!).getByTestId('test-question-preview'));
    const dialog = within(await screen.findByTestId('test-question-preview-dialog'));
    expect(dialog.getByText('1 din 10')).toBeTruthy();
    expect(dialog.getByTestId('test-question-preview-text').textContent).toBe(firstAid.text);
    const options = dialog.getAllByTestId('test-question-preview-option');
    expect(options.map((option) => option.textContent)).toEqual(
      firstAid.options.map((option) => option.text)
    );
    expect(options.every((option) => option.getAttribute('aria-pressed') === 'false')).toBe(true);
    await user.click(options[0]!);
    expect(options[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(dialog.getByTestId('test-question-preview-explanation').textContent).toContain(
      firstAid.explanation!
    );
    await user.click(dialog.getByRole('button', { name: 'Închide' }));
    await user.click(within(questions[1]!).getByTestId('test-question-preview'));
    expect(await screen.findByTestId('test-question-preview-no-explanation')).toBeTruthy();
  });
});
