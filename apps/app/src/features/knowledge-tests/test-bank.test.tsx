import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { installFetchMock, mockApi, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import { userOnlyMe } from '@/test/records';

import { bankTestCounts, sittingRules } from './test-format';

type Question = {
  id: string;
  domain: 'ssm' | 'su';
  test: 'hiring' | 'annual';
  position: number;
  text: string;
  options: { text: string; correct: boolean }[];
  explanation: string | null;
  citation: string | null;
  citationParts: { text: string; url: string | null }[];
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
  citationParts: [],
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
  citationParts: [
    { text: 'HG 1425/2006', url: 'https://legislatie.just.ro/Public/DetaliiDocument/252029' },
    { text: ', ', url: null },
    {
      text: 'anexa 11',
      url: 'https://legislatie.just.ro/Public/DetaliiDocument/252029#id_anx11',
    },
  ],
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
  domain: 'ssm' | 'su',
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
  domain: 'su',
  test: 'hiring',
  text: 'Ce faci la auzul alarmei de incendiu?',
});
const fireAnnual = builtIn(41, {
  domain: 'su',
  test: 'annual',
  text: 'Cât de des se verifică stingătorul?',
  citation: 'IPSU, art. 151',
  citationParts: [{ text: 'IPSU, art. 151', url: null }],
});

const bank = (ssm: Question[]) => ({
  sittingSize: 10,
  minimumActiveQuestions: 10,
  passMarkPercent: 70,
  tests: [
    bankTest('ssm', 'hiring', 'TASSM', ssm),
    bankTest('su', 'hiring', 'TASU', [fireHiring]),
    bankTest('su', 'annual', 'TPSU', [fireAnnual]),
  ],
});

const bankFor = (url: URL, questions: Question[]) => {
  const all = bank(questions);
  const domain = url.searchParams.get('domain');
  const test = url.searchParams.get('test');
  return {
    ...all,
    tests: all.tests.filter(
      (each) => (!domain || each.domain === domain) && (!test || each.test === test)
    ),
  };
};

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

function mockBankApi(routes: Partial<Record<string, Handler>> = {}, questions = ssmQuestions()) {
  mockApi(
    (init, url) => {
      const key = `${init?.method ?? 'GET'} ${url.pathname}`;
      const route = routes[key];
      if (route) return route(url, init);
      if (key === 'GET /organization/tests/questions') return Response.json(bankFor(url, questions));
    },
    { me: userOnlyMe }
  );
}

const requests = (method: string, pathname: string) =>
  requestsTo(pathname, method).map(([input, init]) => ({
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

const mount = (path = '/teste') => mountApp(authFixture(makeSession()).client, path);

installFetchMock();

describe('the question bank', () => {
  it('words the sitting rules and a test’s counts, with the floor while it is reached', () => {
    expect(sittingRules({ sittingSize: 10, passMarkPercent: 70 })).toBe(
      '10 întrebări pe test, extrase la întâmplare · prag de promovare 70 %'
    );
    const counts = (questions: Question[]) =>
      bankTestCounts(bankTest('ssm', 'hiring', 'TASSM', questions), 10);
    expect(counts([...ssmQuestions(), ownQuestion, builtIn(11)])).toBe('12 întrebări active');
    expect(
      counts(ssmQuestions([builtIn(11, { hidden: true }), builtIn(12, { hidden: true })]))
    ).toBe('10 întrebări active · minimum 10 · 2 ascunse');
    expect(counts([...ssmQuestions(), ownQuestion, builtIn(11, { hidden: true })])).toBe(
      '11 întrebări active · 1 ascunsă'
    );
    expect(counts(Array.from({ length: 20 }, (_, index) => builtIn(index + 1)))).toBe(
      '20 de întrebări active'
    );
  });

  it('opens on the occupational safety hiring test from the sidebar and lists its questions in order', async () => {
    mockBankApi({}, ssmQuestions([builtIn(11, { hidden: true, text: 'O întrebare ascunsă' })]));
    const runtime = mount('/dashboard');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('nav-tests'));
    const tab = await screen.findByTestId('test-bank-test');
    expect(runtime.router.state.location.pathname).toBe('/teste/ssm');
    expect(
      within(screen.getByTestId('nav-tests-group'))
        .getAllByTestId('nav-sub-entry')
        .map((link) => link.textContent)
    ).toEqual(['SSM la angajare', 'SU la angajare', 'SU anual']);
    expect(screen.getAllByTestId('test-bank-section').map((link) => link.textContent)).toEqual([
      'SSM la angajare',
      'SU la angajare',
      'SU anual',
    ]);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Teste');
    expect((await screen.findByTestId('test-bank-rules')).textContent).toBe(
      '10 întrebări pe test, extrase la întâmplare · prag de promovare 70 %'
    );
    expect(requests('GET', '/organization/tests/questions')[0]!.url.search).toBe('');
    expect(screen.getByTestId('test-bank').textContent).not.toMatch(/TASSM|TASU|TPSU/);

    expect(within(tab).getByTestId('test-bank-counts').textContent).toBe(
      '10 întrebări active · minimum 10 · 1 ascunsă'
    );
    const questions = within(tab).getAllByTestId('test-question');
    expect(questions).toHaveLength(11);
    const first = within(questions[0]!);
    expect(first.getByTestId('test-question-text').textContent).toBe(
      'Ce faci întâi când un coleg s-a electrocutat?'
    );
    expect(first.getByTestId('test-question-kind').textContent).toBe('Predefinită');
    expect(
      first.getAllByTestId('test-question-option').map((option) => option.dataset.correct)
    ).toEqual(['false', 'true', 'true']);
    expect(first.getByTestId('test-question-many').textContent).toBe(
      '2 răspunsuri corecte: lucrătorul le bifează pe toate.'
    );
    expect(first.getByTestId('test-question-explanation').textContent).toContain(
      'Victima rămâne sub tensiune'
    );
    expect(first.queryByTestId('test-question-edit')).toBeNull();
    expect(first.getByTestId('test-question-hide').textContent).toBe('Ascunde din test');
    expect(within(questions[1]!).queryByTestId('test-question-citation')).toBeNull();
    expect(within(questions[1]!).queryByTestId('test-question-explanation')).toBeNull();

    const hidden = within(questions[10]!);
    expect(questions[10]!.dataset.hidden).toBe('true');
    expect(hidden.getByTestId('test-question-hidden').textContent).toBe(
      'Ascunsă, nu intră în test · '
    );
    expect(hidden.getByTestId('test-question-restore').textContent).toBe('Repune în test');
    expect(hidden.queryByTestId('test-question-preview')).toBeNull();
    expect(hidden.queryByTestId('test-question-option')).toBeNull();
  });

  it('links each part of the temei that names an act and keeps the rest as text', async () => {
    mockBankApi();
    mount('/teste/ssm');
    const [first] = await screen.findAllByTestId('test-question');
    const citation = within(first!).getByTestId('test-question-citation');
    expect(citation.textContent).toBe('TemeiHG 1425/2006, anexa 11');
    const links = within(citation).getAllByTestId('test-question-citation-link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://legislatie.just.ro/Public/DetaliiDocument/252029',
      'https://legislatie.just.ro/Public/DetaliiDocument/252029#id_anx11',
    ]);
    expect(links.every((link) => link.getAttribute('target') === '_blank')).toBe(true);
    expect(links.every((link) => link.getAttribute('rel')?.includes('noopener'))).toBe(true);
  });

  it('shows each fire-safety test on a tab of its own, its own-instruction temei as text', async () => {
    mockBankApi();
    const runtime = mount('/teste/su-la-angajare');
    const user = userEvent.setup();
    const hiring = await screen.findByTestId('test-bank-test');
    expect(hiring.dataset.test).toBe('hiring');
    expect(within(hiring).getByTestId('test-question-text').textContent).toBe(fireHiring.text);

    await user.click(screen.getAllByTestId('test-bank-section')[2]!);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/teste/su-anual'));
    await waitFor(() => expect(screen.getByTestId('test-bank-test').dataset.test).toBe('annual'));
    const annual = screen.getByTestId('test-bank-test');
    expect(within(annual).getByTestId('test-question-text').textContent).toBe(fireAnnual.text);
    const citation = within(annual).getByTestId('test-question-citation');
    expect(citation.textContent).toBe('TemeiIPSU, art. 151');
    expect(within(citation).queryByRole('link')).toBeNull();
    expect(within(annual).getByTestId('test-bank-counts').textContent).toBe(
      '1 întrebare activă · minimum 10'
    );
  });

  it('says at ten active questions why a built-in stays, without asking the API, and offers to add one', async () => {
    mockBankApi({}, ssmQuestions([ownQuestion]).slice(1));
    mount('/teste/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    const hide = within(questions[1]!).getByTestId('test-question-hide');
    await user.click(hide);
    const message = await screen.findByTestId('test-minimum');
    expect(message.textContent).toContain(
      'Testul are minimum 10 întrebări active. Adaugă întâi una proprie, apoi o poți ascunde pe aceasta.'
    );
    expect(hide.getAttribute('aria-expanded')).toBe('true');
    expect(requests('PUT', `/organization/tests/questions/${uuid(3)}/hidden`)).toHaveLength(0);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('test-minimum')).toBeNull());

    await user.click(hide);
    await user.click(await screen.findByTestId('test-minimum-add'));
    const dialog = within(await screen.findByTestId('test-question-dialog'));
    expect((dialog.getByTestId('test-question-test') as HTMLInputElement).value).toBe(
      'SSM la angajare'
    );
    expect(screen.queryByTestId('test-minimum')).toBeNull();
  });

  it('says the same when the API refuses a hide the counts allowed', async () => {
    mockBankApi(
      { [`PUT /organization/tests/questions/${uuid(2)}/hidden`]: refused },
      ssmQuestions([ownQuestion])
    );
    mount('/teste/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    await user.click(within(questions[1]!).getByTestId('test-question-hide'));
    expect((await screen.findByTestId('test-minimum')).textContent).toContain(
      'Testul are minimum 10 întrebări active.'
    );
    expect(requests('PUT', `/organization/tests/questions/${uuid(2)}/hidden`)).toHaveLength(1);
    expect(screen.queryByTestId('test-bank-error')).toBeNull();
  });

  it('keeps any other failure under the question that caused it', async () => {
    mockBankApi(
      {
        [`PUT /organization/tests/questions/${uuid(2)}/hidden`]: () =>
          Response.json({ error: 'internal', message: 'x' }, { status: 500 }),
      },
      ssmQuestions([ownQuestion])
    );
    mount('/teste/ssm');
    const user = userEvent.setup();
    const questions = await screen.findAllByTestId('test-question');
    await user.click(within(questions[1]!).getByTestId('test-question-hide'));
    expect((await within(questions[1]!).findByTestId('test-bank-error')).textContent).toBe(
      'Nu am putut salva schimbarea. Verifică conexiunea și încearcă din nou.'
    );
    expect(screen.getAllByTestId('test-bank-error')).toHaveLength(1);
  });

  it('hides a built-in and restores a hidden one without asking first', async () => {
    const hiddenOne = builtIn(11, { hidden: true });
    mockBankApi(
      {
        [`PUT /organization/tests/questions/${uuid(2)}/hidden`]: () =>
          Response.json({ question: { ...builtIn(2), hidden: true } }),
        [`DELETE /organization/tests/questions/${uuid(11)}/hidden`]: () =>
          Response.json({ question: { ...hiddenOne, hidden: false } }),
      },
      ssmQuestions([ownQuestion, hiddenOne])
    );
    mount('/teste/ssm');
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
    mockBankApi({
      'POST /organization/tests/questions': () =>
        Response.json({ question: ownQuestion }, { status: 201 }),
    });
    mount('/teste/ssm');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('test-question-add'));
    const dialog = within(await screen.findByTestId('test-question-dialog'));
    expect((dialog.getByTestId('test-question-test') as HTMLInputElement).value).toBe(
      'SSM la angajare'
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
    await user.click(dialog.getByRole('checkbox', { name: 'Varianta a este corectă' }));
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

  it('adds a question to the test of the open tab', async () => {
    mockBankApi({
      'POST /organization/tests/questions': () =>
        Response.json(
          { question: { ...ownQuestion, domain: 'su', test: 'annual' } },
          { status: 201 }
        ),
    });
    mount('/teste/su-anual');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('test-question-add'));
    const dialog = within(await screen.findByTestId('test-question-dialog'));
    expect((dialog.getByTestId('test-question-test') as HTMLInputElement).value).toBe('SU anual');
    await user.type(dialog.getByTestId('test-question-text'), ownQuestion.text);
    const options = dialog.getAllByTestId('test-question-option-text');
    await user.type(options[0]!, 'Lângă ușa de evacuare');
    await user.type(options[1]!, 'În biroul contabilității');
    await user.click(dialog.getAllByTestId('test-question-option-remove')[2]!);
    await user.click(dialog.getByRole('checkbox', { name: 'Varianta a este corectă' }));
    await user.click(dialog.getByTestId('test-question-submit'));
    await waitFor(() => expect(screen.queryByTestId('test-question-dialog')).toBeNull());
    expect(requests('POST', '/organization/tests/questions')[0]!.body).toMatchObject({
      domain: 'su',
      test: 'annual',
    });
  });

  it('edits an own question and keeps the built-in it departs from', async () => {
    const replacing = { ...ownQuestion, replacesQuestionId: uuid(3) };
    mockBankApi(
      {
        [`PATCH /organization/tests/questions/${ownQuestion.id}`]: (_url, init) =>
          Response.json({ question: { ...replacing, ...JSON.parse(String(init?.body)) } }),
      },
      ssmQuestions([replacing])
    );
    mount('/teste/ssm');
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
    mockBankApi(
      {
        [`PATCH /organization/tests/questions/${ownQuestion.id}`]: () =>
          Response.json({ error: 'not_found', message: 'x' }, { status: 404 }),
      },
      ssmQuestions([ownQuestion])
    );
    mount('/teste/ssm');
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
    mockBankApi(
      {
        [`DELETE /organization/tests/questions/${ownQuestion.id}`]: () =>
          refuse ? refused() : new Response(null, { status: 204 }),
      },
      ssmQuestions([ownQuestion])
    );
    mount('/teste/ssm');
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

  it('keeps deleting a question until the bank is read again', async () => {
    let release: () => void = () => undefined;
    const reread = new Promise<void>((resolve) => {
      release = resolve;
    });
    let deleted = false;
    let held = 0;
    const questions = ssmQuestions([ownQuestion]);
    mockBankApi(
      {
        [`DELETE /organization/tests/questions/${ownQuestion.id}`]: () => {
          deleted = true;
          return new Response(null, { status: 204 });
        },
        'GET /organization/tests/questions': async (url) => {
          if (deleted) {
            held += 1;
            await reread;
          }
          return Response.json(bankFor(url, questions));
        },
      },
      questions
    );
    mount('/teste/ssm');
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('test-question');
    await user.click(within(rows[10]!).getByTestId('test-question-delete'));
    const dialog = within(await screen.findByTestId('test-question-delete-dialog'));
    await user.click(dialog.getByTestId('test-question-delete-confirm'));
    await waitFor(() => expect(held).toBeGreaterThan(0));
    const confirm = dialog.getByTestId<HTMLButtonElement>('test-question-delete-confirm');
    expect(confirm.textContent).toBe('Se șterge…');
    expect(confirm.disabled).toBe(true);
    release();
    await waitFor(() => expect(screen.queryByTestId('test-question-delete-dialog')).toBeNull());
  });

  it('previews a question as the employee sees it, the correct options unmarked and the explanation after a wrong answer', async () => {
    mockBankApi();
    mount('/teste/ssm');
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
    await user.click(dialog.getByTestId('test-question-preview-close'));
    await user.click(within(questions[1]!).getByTestId('test-question-preview'));
    expect(await screen.findByTestId('test-question-preview-no-explanation')).toBeTruthy();
  });
});
