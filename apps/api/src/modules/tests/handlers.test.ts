import {
  apiErrorResponseSchema,
  employeeTestsResponseSchema,
  testBankResponseSchema,
  testQuestionResponseSchema,
  testResultResponseSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  CORS_ORIGINS: 'http://localhost:5173, https://app.ssmusor.ro',
};

const user = {
  id: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
  email: 'specialist@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-09-01T00:00:00Z',
  is_anonymous: false,
  app_metadata: { provider: 'email' },
  user_metadata: {},
};

const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';
const membership = { user_id: user.id, organization_id: organizationId, role: 'specialist' };
const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const resultId = '7e7e7e7e-0000-4000-8000-000000000001';

const options = [
  { text: 'Legea 319/2006;', correct: true },
  { text: 'Legea 53/2003.', correct: false },
];

const question = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `00024001-0000-4000-8000-${String(index).padStart(12, '0')}`,
  organization_id: null as string | null,
  domain: 'ssm',
  test: 'hiring',
  position: index,
  text: `Întrebarea ${index}: ce lege reglementează securitatea muncii?`,
  options,
  explanation: 'Legea 319/2006 este legea securității și sănătății în muncă.',
  citation: 'Legea 319/2006, art. 1',
  replaces_question_id: null,
  created_at: '2026-10-20T10:00:00+00:00',
  updated_at: '2026-10-20T10:00:00+00:00',
  ...overrides,
});

const builtIns = Array.from({ length: 10 }, (_, index) => question(index + 1));
const own = question(11, {
  id: '0a0a0a0a-0000-4000-8000-000000000001',
  organization_id: organizationId,
  position: 3,
  replaces_question_id: builtIns[2]!.id,
});
const fireAnnual = question(1, {
  id: '00024003-0000-4000-8000-000000000001',
  domain: 'psi',
  test: 'annual',
});

const resultRow = {
  id: resultId,
  employee_id: employeeId,
  domain: 'ssm',
  test: 'hiring',
  taken_on: '2026-01-06',
  material: 'Test de verificare a cunoștințelor la angajare (TASSM)',
  grade: 'admis',
  examiner_name: 'Dan MARIN',
  examiner_job_title: 'Inspector SSM',
  source: 'paper',
  attempt_id: null,
  created_at: '2026-01-06T12:00:00+00:00',
  updated_at: '2026-01-06T12:00:00+00:00',
};

const attemptRow = {
  id: 'a7a7a7a7-0000-4000-8000-000000000001',
  participant_id: '9e9e9e9e-0000-4000-8000-000000000001',
  domain: 'psi',
  test: 'hiring',
  started_at: '2026-01-08T09:00:00+00:00',
  finished_at: '2026-01-08T09:10:00+00:00',
  score: 6,
  total: 10,
  passed: false,
};

const standing = (overrides: Record<string, unknown> = {}) => ({
  id: employeeId,
  test_status: {
    ssm_state: 'pending',
    ssm_awaiting_test: 'hiring',
    ssm_last_passed_on: null,
    ssm_hiring_trained_on: '2026-01-05',
    psi_state: 'none',
    psi_awaiting_test: null,
    psi_last_passed_on: null,
    psi_due_on: null,
    psi_hiring_trained_on: null,
    ...overrides,
  },
});

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;
type Upstream =
  | 'questions'
  | 'hides'
  | 'employees'
  | 'results'
  | 'attempts'
  | 'sheets'
  | 'testSheets'
  | 'requests'
  | 'testSheetSignatures'
  | 'paperMark';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  const defaults: Record<Upstream, Handler> = {
    questions: (init, url) => {
      if (init?.method === 'POST') return Response.json(own, { status: 201 });
      if (init?.method === 'PATCH') return Response.json(own);
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.searchParams.get('id')) return Response.json(own);
      if (url.searchParams.get('limit')) return Response.json({ position: 10 });
      return Response.json([...builtIns, own, fireAnnual]);
    },
    hides: (init) =>
      init?.method === 'POST' || init?.method === 'DELETE'
        ? new Response(null, { status: 201 })
        : Response.json([{ question_id: builtIns[2]!.id }]),
    employees: () => Response.json(standing()),
    results: (init) =>
      init?.method === 'POST'
        ? Response.json(resultRow, { status: 201 })
        : init?.method === 'PATCH'
          ? Response.json(resultRow)
          : Response.json([resultRow]),
    attempts: () => Response.json([attemptRow]),
    sheets: () => Response.json([]),
    testSheets: () => Response.json([]),
    requests: () => Response.json([]),
    testSheetSignatures: () => Response.json([]),
    paperMark: () => Response.json({}),
  };
  const paths: Record<string, Upstream> = {
    '/rest/v1/test_questions': 'questions',
    '/rest/v1/test_question_hides': 'hides',
    '/rest/v1/employees': 'employees',
    '/rest/v1/test_results': 'results',
    '/rest/v1/test_attempts': 'attempts',
    '/rest/v1/signed_sheets': 'sheets',
    '/rest/v1/test_sheets': 'testSheets',
    '/rest/v1/signature_requests': 'requests',
    '/rest/v1/test_sheet_signatures': 'testSheetSignatures',
    '/rest/v1/rpc/mark_test_sheet_paper_signature': 'paperMark',
  };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/auth/v1/user') return Response.json(user);
    if (url.pathname === '/rest/v1/rpc/current_membership') return Response.json([membership]);
    const upstream = paths[url.pathname];
    if (!upstream) throw new Error(`Unexpected upstream request: ${init?.method ?? 'GET'} ${url}`);
    return handlers[upstream]?.(init, url) ?? defaults[upstream](init, url)!;
  });
}

const calls = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

const sent = (pathname: string, method: string) =>
  JSON.parse(String(calls(pathname, method)[0]![1]?.body)) as Record<string, unknown>;

const request = (path: string, method = 'GET', body?: unknown, bindings = env) =>
  createApp().request(
    path,
    {
      method,
      headers: {
        Authorization: 'Bearer test-access-token',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    bindings
  );

const raised = (code: string, message: string) =>
  Response.json({ code, message, details: null, hint: null }, { status: 400 });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('GET /organization/tests/questions', () => {
  it('lists every test with its questions in the printed order, flagged built-in and hidden, and the fixed rules', async () => {
    mockUpstream();
    const response = await request('/organization/tests/questions');
    expect(response.status).toBe(200);
    const body = testBankResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      sittingSize: 10,
      minimumActiveQuestions: 10,
      passMarkPercent: 70,
    });
    expect(body.tests.map((test) => [test.code, test.questions.length, test.activeCount])).toEqual([
      ['TASSM', 11, 10],
      ['TASU', 0, 0],
      ['TPSU', 1, 1],
    ]);
    const [hiring] = body.tests;
    expect(hiring!.title).toBe('Test de verificare a cunoștințelor la angajare (TASSM)');
    expect(hiring!.questions[2]).toMatchObject({ builtIn: true, hidden: true });
    expect(hiring!.questions[10]).toMatchObject({
      builtIn: false,
      hidden: false,
      replacesQuestionId: builtIns[2]!.id,
    });
    const query = new URL(String(calls('/rest/v1/test_questions')[0]![0])).searchParams;
    expect(query.get('order')).toBe(
      'position.asc,organization_id.asc.nullsfirst,created_at.asc,id.asc'
    );
    const hides = new URL(String(calls('/rest/v1/test_question_hides')[0]![0])).searchParams;
    expect(hides.get('organization_id')).toBe(`eq.${organizationId}`);
  });

  it('narrows the list to one test', async () => {
    mockUpstream({ questions: () => Response.json([fireAnnual]) });
    const response = await request('/organization/tests/questions?domain=psi&test=annual');
    const body = testBankResponseSchema.parse(await response.json());
    expect(body.tests.map((test) => test.code)).toEqual(['TPSU']);
    const query = new URL(String(calls('/rest/v1/test_questions')[0]![0])).searchParams;
    expect(query.get('domain')).toBe('eq.psi');
    expect(query.get('test')).toBe('eq.annual');
  });

  it('refuses an annual occupational safety test', async () => {
    mockUpstream();
    const response = await request('/organization/tests/questions?domain=ssm&test=annual');
    expect(response.status).toBe(400);
  });
});

describe('POST /organization/tests/questions', () => {
  const body = {
    domain: 'ssm',
    test: 'hiring',
    text: ' Ce lege reglementează securitatea muncii? ',
    options,
    replacesQuestionId: builtIns[2]!.id,
  };

  it("writes an own question after the test's others", async () => {
    mockUpstream();
    const response = await request('/organization/tests/questions', 'POST', body);
    expect(response.status).toBe(201);
    expect(testQuestionResponseSchema.parse(await response.json()).question).toMatchObject({
      builtIn: false,
      hidden: false,
    });
    expect(sent('/rest/v1/test_questions', 'POST')).toEqual({
      organization_id: organizationId,
      domain: 'ssm',
      test: 'hiring',
      position: 11,
      text: 'Ce lege reglementează securitatea muncii?',
      options,
      explanation: null,
      citation: null,
      replaces_question_id: builtIns[2]!.id,
      created_by: user.id,
    });
  });

  it('answers 409 when the question it replaces is not a built-in of the test', async () => {
    mockUpstream({
      questions: (init) =>
        init?.method === 'POST' ? raised('TST02', 'question_not_built_in') : undefined,
    });
    const response = await request('/organization/tests/questions', 'POST', {
      ...body,
      position: 4,
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'question_not_built_in'
    );
  });

  it('refuses a question without a correct option', async () => {
    mockUpstream();
    const response = await request('/organization/tests/questions', 'POST', {
      ...body,
      options: options.map((option) => ({ ...option, correct: false })),
    });
    expect(response.status).toBe(400);
    expect(calls('/rest/v1/test_questions', 'POST')).toHaveLength(0);
  });
});

describe('PATCH and DELETE /organization/tests/questions/{questionId}', () => {
  const edit = { text: 'Ce lege se aplică?', options, explanation: 'Legea 319/2006.' };

  it('edits an own question', async () => {
    mockUpstream();
    const response = await request(`/organization/tests/questions/${own.id}`, 'PATCH', edit);
    expect(response.status).toBe(200);
    expect(sent('/rest/v1/test_questions', 'PATCH')).toEqual({
      text: 'Ce lege se aplică?',
      options,
      explanation: 'Legea 319/2006.',
      citation: null,
      replaces_question_id: null,
    });
  });

  it.each(['PATCH', 'DELETE'])('refuses to %s a built-in question', async (method) => {
    mockUpstream({
      questions: (init) =>
        (init?.method ?? 'GET') === 'GET' ? Response.json(builtIns[0]) : undefined,
    });
    const response = await request(
      `/organization/tests/questions/${builtIns[0]!.id}`,
      method,
      method === 'PATCH' ? edit : undefined
    );
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('question_built_in');
    expect(calls('/rest/v1/test_questions', method)).toHaveLength(0);
  });

  it('deletes an own question', async () => {
    mockUpstream();
    const response = await request(`/organization/tests/questions/${own.id}`, 'DELETE');
    expect(response.status).toBe(204);
    const query = new URL(String(calls('/rest/v1/test_questions', 'DELETE')[0]![0])).searchParams;
    expect(query.get('id')).toBe(`eq.${own.id}`);
  });

  it('answers 409 with the reason when the test would keep fewer than ten questions', async () => {
    mockUpstream({
      questions: (init) =>
        init?.method === 'DELETE' ? raised('TST01', 'test_below_minimum') : undefined,
    });
    const response = await request(`/organization/tests/questions/${own.id}`, 'DELETE');
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json())).toMatchObject({
      reason: 'test_below_minimum',
      message: 'Un test trebuie să păstreze cel puțin zece întrebări active.',
    });
  });

  it('answers 404 for a question of another organization', async () => {
    mockUpstream({ questions: () => Response.json(null) });
    const response = await request(`/organization/tests/questions/${own.id}`, 'DELETE');
    expect(response.status).toBe(404);
  });
});

describe('PUT and DELETE /organization/tests/questions/{questionId}/hidden', () => {
  const builtIn = builtIns[5]!;
  const path = `/organization/tests/questions/${builtIn.id}/hidden`;

  it('hides a built-in for the organization', async () => {
    mockUpstream({ questions: () => Response.json(builtIn) });
    const response = await request(path, 'PUT');
    expect(response.status).toBe(200);
    expect(testQuestionResponseSchema.parse(await response.json()).question).toMatchObject({
      id: builtIn.id,
      hidden: true,
    });
    expect(sent('/rest/v1/test_question_hides', 'POST')).toEqual({
      organization_id: organizationId,
      question_id: builtIn.id,
    });
  });

  it('answers 409 when hiding would leave fewer than ten', async () => {
    mockUpstream({
      questions: () => Response.json(builtIn),
      hides: (init) =>
        init?.method === 'POST' ? raised('TST01', 'test_below_minimum') : undefined,
    });
    const response = await request(path, 'PUT');
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('test_below_minimum');
  });

  it('writes nothing for a question already hidden', async () => {
    mockUpstream({ questions: () => Response.json(builtIns[2]) });
    const response = await request(
      `/organization/tests/questions/${builtIns[2]!.id}/hidden`,
      'PUT'
    );
    expect(response.status).toBe(200);
    expect(calls('/rest/v1/test_question_hides', 'POST')).toHaveLength(0);
  });

  it('restores a hidden built-in', async () => {
    mockUpstream({ questions: () => Response.json(builtIns[2]) });
    const response = await request(
      `/organization/tests/questions/${builtIns[2]!.id}/hidden`,
      'DELETE'
    );
    expect(response.status).toBe(200);
    expect(testQuestionResponseSchema.parse(await response.json()).question.hidden).toBe(false);
    const query = new URL(String(calls('/rest/v1/test_question_hides', 'DELETE')[0]![0]))
      .searchParams;
    expect(query.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(query.get('question_id')).toBe(`eq.${builtIns[2]!.id}`);
  });
});

const testsPath = `/clients/${clientId}/employees/${employeeId}/tests`;

describe('GET /clients/{clientId}/employees/{employeeId}/tests', () => {
  it('answers each domain with its state, results and attempts', async () => {
    mockUpstream();
    const response = await request(testsPath);
    expect(response.status).toBe(200);
    const body = employeeTestsResponseSchema.parse(await response.json());
    expect(body.ssm.status).toEqual({
      state: 'pending',
      awaitingTest: 'hiring',
      lastPassedOn: null,
      dueOn: null,
    });
    expect(body.ssm.results).toEqual([
      expect.objectContaining({
        id: resultId,
        takenOn: '2026-01-06',
        grade: 'admis',
        examiner: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
        source: 'paper',
        attemptId: null,
      }),
    ]);
    expect(body.ssm.attempts).toEqual([]);
    expect(body.psi.attempts).toEqual([
      {
        id: attemptRow.id,
        domain: 'psi',
        test: 'hiring',
        startedAt: attemptRow.started_at,
        finishedAt: attemptRow.finished_at,
        score: 6,
        total: 10,
        passed: false,
      },
    ]);
    const attempts = new URL(String(calls('/rest/v1/test_attempts')[0]![0])).searchParams;
    expect(attempts.get('select')).not.toContain('questions');
    expect(attempts.get('employee_id')).toBe(`eq.${employeeId}`);
  });

  it('answers 404 for an employee not of this client', async () => {
    mockUpstream({ employees: () => Response.json(null) });
    expect((await request(testsPath)).status).toBe(404);
  });
});

describe('POST /clients/{clientId}/employees/{employeeId}/tests/results', () => {
  const paper = {
    domain: 'ssm',
    test: 'hiring',
    takenOn: '2026-01-06',
    examiner: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
  };

  it('records a pass of the printed hiring test while it awaits the employee', async () => {
    mockUpstream();
    const response = await request(`${testsPath}/results`, 'POST', paper);
    expect(response.status).toBe(201);
    expect(testResultResponseSchema.parse(await response.json()).result.id).toBe(resultId);
    expect(sent('/rest/v1/test_results', 'POST')).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      employee_id: employeeId,
      domain: 'ssm',
      test: 'hiring',
      taken_on: '2026-01-06',
      material: 'Test de verificare a cunoștințelor la angajare (TASSM)',
      grade: 'admis',
      examiner_name: 'Dan MARIN',
      examiner_job_title: 'Inspector SSM',
      source: 'paper',
      created_by: user.id,
    });
  });

  it("looks for the employee's stored sheet to fill the result's row, with the secret key", async () => {
    mockUpstream({
      results: (init, url) =>
        init?.method === 'POST'
          ? Response.json(resultRow, { status: 201 })
          : url.searchParams.get('id') === `eq.${resultId}`
            ? Response.json({ ...resultRow, client_id: clientId, organization_id: organizationId })
            : undefined,
    });
    const response = await request(`${testsPath}/results`, 'POST', paper, {
      ...env,
      SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
    });
    expect(response.status).toBe(201);
    const sheets = new URL(String(calls('/rest/v1/signed_sheets')[0]![0])).searchParams;
    expect(sheets.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(sheets.get('domain')).toBe('eq.ssm');
  });

  it.each([
    ['before the hiring training it closes', paper, { ssm_hiring_trained_on: null }],
    [
      'once the hiring test is passed',
      paper,
      { ssm_state: 'passed', ssm_last_passed_on: '2026-01-06' },
    ],
  ])('refuses a paper result %s', async (_, body, status) => {
    mockUpstream({ employees: () => Response.json(standing(status)) });
    const response = await request(`${testsPath}/results`, 'POST', body);
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('test_not_awaiting');
    expect(calls('/rest/v1/test_results', 'POST')).toHaveLength(0);
  });

  it("takes an annual result once there is a pass, a leaver's included", async () => {
    mockUpstream({
      employees: () =>
        Response.json(
          standing({
            psi_state: null,
            psi_last_passed_on: '2025-01-06',
            psi_hiring_trained_on: '2025-01-05',
          })
        ),
    });
    const response = await request(`${testsPath}/results`, 'POST', {
      ...paper,
      domain: 'psi',
      test: 'annual',
      takenOn: '2026-01-10',
    });
    expect(response.status).toBe(201);
    expect(sent('/rest/v1/test_results', 'POST').material).toBe(
      'Verificare anuală pe bază de test (TPSU)'
    );
  });

  it('takes an annual result with no earlier pass, as a paper sheet records it', async () => {
    mockUpstream({
      employees: () =>
        Response.json(
          standing({
            psi_state: 'unverified',
            psi_last_passed_on: null,
            psi_hiring_trained_on: '2019-03-05',
          })
        ),
    });
    const response = await request(`${testsPath}/results`, 'POST', {
      ...paper,
      domain: 'psi',
      test: 'annual',
      takenOn: '2025-03-04',
    });
    expect(response.status).toBe(201);
    expect(sent('/rest/v1/test_results', 'POST')).toMatchObject({
      domain: 'psi',
      test: 'annual',
      taken_on: '2025-03-04',
      source: 'paper',
    });
  });

  it('takes a hiring result the paper sheet could not show', async () => {
    mockUpstream({
      employees: () =>
        Response.json(
          standing({
            ssm_state: 'unverified',
            ssm_awaiting_test: null,
            ssm_hiring_trained_on: '2019-03-04',
          })
        ),
    });
    const response = await request(`${testsPath}/results`, 'POST', {
      ...paper,
      takenOn: '2019-03-04',
    });
    expect(response.status).toBe(201);
    expect(sent('/rest/v1/test_results', 'POST')).toMatchObject({
      domain: 'ssm',
      test: 'hiring',
      taken_on: '2019-03-04',
    });
  });

  it('refuses a day in the future and an annual occupational safety test', async () => {
    mockUpstream();
    expect(
      (await request(`${testsPath}/results`, 'POST', { ...paper, takenOn: '2099-01-01' })).status
    ).toBe(400);
    expect(
      (await request(`${testsPath}/results`, 'POST', { ...paper, test: 'annual' })).status
    ).toBe(400);
    expect(calls('/rest/v1/test_results', 'POST')).toHaveLength(0);
  });
});

describe('PATCH /clients/{clientId}/employees/{employeeId}/tests/results/{resultId}', () => {
  const path = `${testsPath}/results/${resultId}`;

  it('replaces the examiner, under the employee and the client', async () => {
    mockUpstream();
    const response = await request(path, 'PATCH', {
      examiner: { name: 'Elena VOICU', jobTitle: 'Inspector SSM' },
    });
    expect(response.status).toBe(200);
    expect(sent('/rest/v1/test_results', 'PATCH')).toEqual({
      examiner_name: 'Elena VOICU',
      examiner_job_title: 'Inspector SSM',
    });
    const query = new URL(String(calls('/rest/v1/test_results', 'PATCH')[0]![0])).searchParams;
    expect(query.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(query.get('client_id')).toBe(`eq.${clientId}`);
  });

  it('answers 409 when the day of a portal result is changed', async () => {
    mockUpstream({
      results: (init) =>
        init?.method === 'PATCH' ? raised('TST06', 'result_from_attempt') : undefined,
    });
    const response = await request(path, 'PATCH', {
      takenOn: '2026-01-07',
      examiner: { name: 'Elena VOICU', jobTitle: 'Inspector SSM' },
    });
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('result_from_attempt');
  });

  it('answers 404 for a result of another employee', async () => {
    mockUpstream({
      results: (init) => (init?.method === 'PATCH' ? Response.json(null) : undefined),
    });
    const response = await request(path, 'PATCH', {
      examiner: { name: 'Elena VOICU', jobTitle: 'Inspector SSM' },
    });
    expect(response.status).toBe(404);
  });
});

describe('the test sheet of a result', () => {
  const path = `${testsPath}/results/${resultId}`;
  const withSecret = { ...env, SUPABASE_SECRET_KEY: 'sb_secret_test_key_value' };
  const portalResult = {
    ...resultRow,
    source: 'portal',
    attempt_id: 'a7a7a7a7-0000-4000-8000-000000000009',
    employees: { last_name: 'Popescu', first_name: 'Ion' },
  };
  const sheetId = '75757575-0000-4000-8000-000000000001';

  it('answers each result with its test sheet and the state of its two slots', async () => {
    mockUpstream({
      results: () => Response.json([{ ...resultRow, source: 'portal' }]),
      testSheets: () => Response.json([{ id: sheetId, test_result_id: resultId }]),
      requests: () =>
        Response.json([
          { test_sheet_id: sheetId, slot: 'trainee', state: 'pending' },
          { test_sheet_id: sheetId, slot: 'examiner', state: 'signed' },
        ]),
      testSheetSignatures: () =>
        Response.json([{ test_sheet_id: sheetId, slot: 'examiner', method: 'paper' }]),
    });

    const body = employeeTestsResponseSchema.parse(await (await request(testsPath)).json());

    expect(body.ssm.results[0]!.sheet).toEqual({
      available: true,
      signed: { trainee: 'pending', examiner: 'paper' },
    });
    const sheets = new URL(String(calls('/rest/v1/test_sheets')[0]![0])).searchParams;
    expect(sheets.get('test_result_id')).toBe(`in.(${resultId})`);
  });

  it('answers a paper result with no test sheet', async () => {
    mockUpstream();

    const body = employeeTestsResponseSchema.parse(await (await request(testsPath)).json());

    expect(body.ssm.results[0]!.sheet).toEqual({
      available: false,
      signed: { trainee: 'unassigned', examiner: 'unassigned' },
    });
  });

  it('answers 409 when the examiner has signed and the result names another', async () => {
    mockUpstream({
      results: (init) =>
        init?.method === 'PATCH' ? raised('TST07', 'examiner_signed') : undefined,
    });

    const response = await request(path, 'PATCH', {
      examiner: { name: 'Elena VOICU', jobTitle: 'Inspector SSM' },
    });

    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('examiner_signed');
  });

  it('answers 404 for the sheet of a paper result', async () => {
    mockUpstream({ results: () => Response.json({ ...portalResult, source: 'paper' }) });

    const response = await request(`${path}/sheet`);

    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe(
      'test_sheet_not_available'
    );
  });

  it('marks a slot of the stored sheet as signed on paper', async () => {
    mockUpstream({
      results: () => Response.json(portalResult),
      testSheets: (_, url) =>
        url.searchParams.get('test_result_id')?.startsWith('in.')
          ? Response.json([{ id: sheetId, test_result_id: resultId }])
          : Response.json({ id: sheetId, test_result_id: resultId, storage_path: 'x.pdf' }),
      testSheetSignatures: () =>
        Response.json([{ test_sheet_id: sheetId, slot: 'examiner', method: 'paper' }]),
    });

    const response = await request(
      `${path}/sheet/paper-signatures`,
      'POST',
      { slot: 'examiner' },
      withSecret
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resultId,
      sheet: { available: true, signed: { trainee: 'unassigned', examiner: 'paper' } },
    });
    expect(sent('/rest/v1/rpc/mark_test_sheet_paper_signature', 'POST')).toEqual({
      p_test_sheet_id: sheetId,
      p_slot: 'examiner',
    });
  });

  it('answers 400 when the examiner to mark is not named on the result', async () => {
    mockUpstream({
      results: () => Response.json(portalResult),
      testSheets: () => Response.json({ id: sheetId, test_result_id: resultId }),
      paperMark: () => raised('SIG04', 'examiner_required'),
    });

    const response = await request(
      `${path}/sheet/paper-signatures`,
      'POST',
      { slot: 'examiner' },
      withSecret
    );

    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('examiner_required');
  });
});
