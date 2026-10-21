import {
  apiErrorResponseSchema,
  portalTestsResponseSchema,
  testAttemptOutcomeSchema,
  testAttemptResponseSchema,
  testStudyCardSchema,
} from '@ssm-usor/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
} as ApiEnv['Bindings'];

const user = { id: '0f7c8d96-479c-47b3-b49e-01f4555a0221', email: 'ion@example.ro' };
const organizationId = '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d';
const clientId = 'c1c1c1c1-0000-4000-8000-000000000001';
const employeeId = 'e1e1e1e1-0000-4000-8000-000000000001';
const participantId = '88888888-0000-4000-8000-000000000001';
const administratorId = '88888888-0000-4000-8000-000000000002';
const attemptId = 'a7a7a7a7-0000-4000-8000-000000000001';
const revisionId = 'eeeeeeee-0000-4000-8000-000000000001';

const participation = (kind: string, id: string, employee: string | null) => ({
  participant_id: id,
  organization_id: organizationId,
  organization_name: 'Protect SSM',
  client_id: clientId,
  client_name: 'S.C. CLIENT DEMO S.R.L.',
  kind,
  employee_id: employee,
  full_name: 'Popescu Ion',
  notice_version: null,
  language: null,
});

const shown = Array.from({ length: 10 }, (_, index) => ({
  question_id: `00024001-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  text: `Întrebarea ${index + 1}?`,
  options: [{ text: 'Da' }, { text: 'Nu' }, { text: 'Uneori' }],
  chosen: index < 3 ? [0] : [],
}));

const attemptRow = {
  id: attemptId,
  organization_id: organizationId,
  client_id: clientId,
  employee_id: employeeId,
  participant_id: participantId,
  domain: 'ssm',
  test: 'hiring',
  started_at: '2026-10-20T09:00:00+00:00',
  finished_at: null as string | null,
  language: 'ro',
  questions: shown as unknown[],
  total: 10,
  score: null as number | null,
  passed: null as boolean | null,
  material_revision_id: revisionId,
  client_address: null,
  user_agent: null,
  created_at: '2026-10-20T09:00:00+00:00',
};

const marked = (wrong: number[]) =>
  shown.map((question, index) => ({
    ...question,
    options: question.options.map((option, at) => ({ ...option, correct: at === 0 })),
    correct: !wrong.includes(index),
    explanation: index === 4 ? 'Legea 319/2006 obligă angajatorul.' : null,
  }));

const finished = (wrong: number[]) => ({
  ...attemptRow,
  finished_at: '2026-10-20T09:12:00+00:00',
  questions: marked(wrong),
  score: 10 - wrong.length,
  passed: wrong.length <= 3,
});

const material = {
  revision_id: revisionId,
  title: 'Material de instruire introductiv-generală',
  pdf_path: `${organizationId}/${clientId}/d1/2.pdf`,
  issued_at: '2026-01-19T10:00:00+00:00',
};

type Handler = (init: RequestInit | undefined, url: URL) => Response | undefined;
type Upstream =
  | 'employees'
  | 'results'
  | 'attempts'
  | 'studyCard'
  | 'material'
  | 'start'
  | 'answer'
  | 'finish'
  | 'sheets';

const fetchMock = vi.fn<typeof fetch>();

function mockUpstream(handlers: Partial<Record<Upstream, Handler>> = {}) {
  const defaults: Record<Upstream, Handler> = {
    employees: () =>
      Response.json({
        id: employeeId,
        test_status: {
          ssm_state: 'pending',
          ssm_awaiting_test: 'hiring',
          ssm_last_passed_on: null,
          psi_state: 'none',
          psi_awaiting_test: null,
          psi_last_passed_on: null,
          psi_due_on: null,
        },
      }),
    results: (_, url) =>
      url.searchParams.has('attempt_id')
        ? Response.json({ id: '7e7e7e7e-0000-4000-8000-000000000001' })
        : Response.json([]),
    attempts: (_, url) =>
      url.searchParams.has('id')
        ? Response.json([{ id: attemptId }])
        : url.searchParams.get('finished_at') === 'is.null'
          ? Response.json([attemptRow])
          : Response.json([
              {
                id: 'a7a7a7a7-0000-4000-8000-000000000000',
                participant_id: participantId,
                domain: 'ssm',
                test: 'hiring',
                started_at: '2026-10-19T09:00:00+00:00',
                finished_at: '2026-10-19T09:10:00+00:00',
                score: 5,
                total: 10,
                passed: false,
              },
            ]),
    studyCard: () =>
      Response.json([
        { explanation: 'Legea 319/2006 obligă angajatorul.' },
        { explanation: 'Accidentul pe traseu este accident de muncă.' },
      ]),
    material: () => Response.json([material]),
    start: () => Response.json(attemptRow),
    answer: () => Response.json(attemptRow),
    finish: () => Response.json(finished([1, 4, 7, 8])),
    sheets: () => Response.json([]),
  };
  const paths: Record<string, Upstream> = {
    '/rest/v1/employees': 'employees',
    '/rest/v1/test_results': 'results',
    '/rest/v1/test_attempts': 'attempts',
    '/rest/v1/rpc/test_study_card': 'studyCard',
    '/rest/v1/rpc/portal_material': 'material',
    '/rest/v1/rpc/start_test_attempt': 'start',
    '/rest/v1/rpc/answer_test_attempt': 'answer',
    '/rest/v1/rpc/finish_test_attempt': 'finish',
    '/rest/v1/signed_sheets': 'sheets',
  };
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/auth/v1/user') return Response.json({ ...user, is_anonymous: false });
    if (url.pathname === '/rest/v1/rpc/accept_participant_invitations') return Response.json(0);
    if (url.pathname === '/rest/v1/rpc/current_participations') {
      return Response.json([
        participation('employee', participantId, employeeId),
        participation('client_administrator', administratorId, null),
      ]);
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/documents/')) {
      if (method === 'POST') {
        return Response.json({ signedURL: `${url.pathname.slice('/storage/v1'.length)}?token=t` });
      }
      return new Response(new TextEncoder().encode('%PDF-1.7 material'));
    }
    if (url.pathname === '/rest/v1/test_results' && url.searchParams.get('id')) {
      return Response.json({
        id: '7e7e7e7e-0000-4000-8000-000000000001',
        employee_id: employeeId,
        client_id: clientId,
        organization_id: organizationId,
        domain: 'ssm',
        test: 'hiring',
        taken_on: '2026-10-20',
        material: 'Test de verificare a cunoștințelor la angajare (TASSM)',
        examiner_name: null,
        examiner_job_title: null,
        created_at: '2026-10-20T09:12:00+00:00',
      });
    }
    const upstream = paths[url.pathname];
    if (!upstream) throw new Error(`Unexpected upstream request: ${method} ${url}`);
    return handlers[upstream]?.(init, url) ?? defaults[upstream](init, url)!;
  });
}

const calls = (pathname: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);

const sent = (pathname: string) =>
  JSON.parse(String(calls(pathname)[0]![1]?.body)) as Record<string, unknown>;

const request = (
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {}
) =>
  createApp().request(
    path,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer user-token',
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env
  );

const own = (path: string) => `/portal/participants/${participantId}${path}`;

const raised = (code: string, message: string) =>
  Response.json({ code, message, details: null, hint: null }, { status: 400 });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /portal/participants/{participantId}/tests', () => {
  it('answers each domain with its state, the finished attempts and the one in progress without a key', async () => {
    mockUpstream();
    const response = await request(own('/tests'));
    expect(response.status).toBe(200);
    const body = portalTestsResponseSchema.parse(await response.json());
    expect(body.ssm.status).toMatchObject({ state: 'pending', awaitingTest: 'hiring' });
    expect(body.ssm.attempts).toEqual([expect.objectContaining({ score: 5, passed: false })]);
    expect(body.ssm.inProgress).toMatchObject({ id: attemptId, total: 10 });
    expect(body.ssm.inProgress!.questions[0]).toEqual({
      questionId: shown[0]!.question_id,
      text: 'Întrebarea 1?',
      options: [{ text: 'Da' }, { text: 'Nu' }, { text: 'Uneori' }],
      chosen: [0],
    });
    expect(body.psi.inProgress).toBeNull();
    const [finishedQuery, openQuery] = calls('/rest/v1/test_attempts').map(
      ([input]) => new URL(String(input)).searchParams
    );
    expect(finishedQuery!.get('select')).not.toContain('questions');
    expect(finishedQuery!.get('employee_id')).toBe(`eq.${employeeId}`);
    expect(openQuery!.get('participant_id')).toBe(`eq.${participantId}`);
  });

  it('leaves out an attempt left open of a test that no longer awaits, which no start resumes', async () => {
    mockUpstream({
      employees: () =>
        Response.json({
          id: employeeId,
          test_status: {
            ssm_state: 'passed',
            ssm_awaiting_test: null,
            ssm_last_passed_on: '2026-10-20',
            psi_state: 'none',
            psi_awaiting_test: null,
            psi_last_passed_on: null,
            psi_due_on: null,
          },
        }),
    });
    const body = portalTestsResponseSchema.parse(await (await request(own('/tests'))).json());
    expect(body.ssm.inProgress).toBeNull();
    expect(body.psi.inProgress).toBeNull();
  });

  it('answers 404 to a client administrator who is not an employee', async () => {
    mockUpstream();
    const response = await request(`/portal/participants/${administratorId}/tests`);
    expect(response.status).toBe(404);
    expect(calls('/rest/v1/test_attempts')).toEqual([]);
  });
});

describe('GET /portal/participants/{participantId}/tests/{domain}/{test}/study-card', () => {
  it('gives the explanations and the issued material', async () => {
    mockUpstream();
    const response = await request(own('/tests/ssm/hiring/study-card'));
    expect(response.status).toBe(200);
    expect(testStudyCardSchema.parse(await response.json())).toEqual({
      explanations: [
        'Legea 319/2006 obligă angajatorul.',
        'Accidentul pe traseu este accident de muncă.',
      ],
      material: {
        revisionId,
        title: 'Material de instruire introductiv-generală',
        issuedAt: material.issued_at,
      },
    });
    expect(sent('/rest/v1/rpc/test_study_card')).toEqual({
      p_participant_id: participantId,
      p_domain: 'ssm',
      p_test: 'hiring',
    });
  });

  it('has no material while none is issued, and refuses an annual occupational safety test', async () => {
    mockUpstream({ material: () => Response.json([]) });
    const card = testStudyCardSchema.parse(
      await (await request(own('/tests/psi/annual/study-card'))).json()
    );
    expect(card.material).toBeNull();
    expect((await request(own('/tests/ssm/annual/study-card'))).status).toBe(400);
  });
});

describe('POST /portal/participants/{participantId}/tests/{domain}/{test}/attempts', () => {
  it('starts the attempt with the material shown, the address and the user agent', async () => {
    mockUpstream();
    const response = await request(own('/tests/ssm/hiring/attempts'), 'POST', undefined, {
      'cf-connecting-ip': '203.0.113.7',
      'user-agent': 'Mozilla/5.0 (Android)',
    });
    expect(response.status).toBe(200);
    const { attempt } = testAttemptResponseSchema.parse(await response.json());
    expect(attempt.questions).toHaveLength(10);
    expect(JSON.stringify(attempt)).not.toContain('correct');
    expect(sent('/rest/v1/rpc/start_test_attempt')).toEqual({
      p_participant_id: participantId,
      p_domain: 'ssm',
      p_test: 'hiring',
      p_material_revision_id: revisionId,
      p_client_address: '203.0.113.7',
      p_user_agent: 'Mozilla/5.0 (Android)',
    });
  });

  it('answers 409 when the test does not await the employee', async () => {
    mockUpstream({ start: () => raised('TST05', 'test_not_awaiting') });
    const response = await request(own('/tests/psi/annual/attempts'), 'POST');
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('test_not_awaiting');
  });

  it("answers 404 for a participation the function does not find the caller's", async () => {
    mockUpstream({ start: () => raised('P0002', 'participant_not_found') });
    const response = await request(own('/tests/ssm/hiring/attempts'), 'POST');
    expect(response.status).toBe(404);
  });
});

describe('PUT /portal/participants/{participantId}/test-attempts/{attemptId}/answers/{questionIndex}', () => {
  const path = own(`/test-attempts/${attemptId}/answers/3`);

  it('saves the options chosen', async () => {
    mockUpstream();
    const response = await request(path, 'PUT', { chosen: [2, 0] });
    expect(response.status).toBe(200);
    expect(sent('/rest/v1/rpc/answer_test_attempt')).toEqual({
      p_attempt_id: attemptId,
      p_question_index: 3,
      p_chosen: [2, 0],
    });
  });

  it('answers 400 for an option the question does not have', async () => {
    mockUpstream({ answer: () => raised('TST04', 'option_out_of_range') });
    const response = await request(path, 'PUT', { chosen: [3] });
    expect(response.status).toBe(400);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('option_out_of_range');
  });

  it('answers 409 once the attempt is finished', async () => {
    mockUpstream({ answer: () => raised('TST03', 'attempt_finished') });
    expect((await request(path, 'PUT', { chosen: [] })).status).toBe(409);
  });

  it('refuses an index past the sitting and an option chosen twice', async () => {
    mockUpstream();
    expect(
      (await request(own(`/test-attempts/${attemptId}/answers/10`), 'PUT', { chosen: [] })).status
    ).toBe(400);
    expect((await request(path, 'PUT', { chosen: [1, 1] })).status).toBe(400);
    expect(calls('/rest/v1/rpc/answer_test_attempt')).toEqual([]);
  });

  it("answers 404 for an attempt of the account's other participation", async () => {
    mockUpstream({
      answer: () => Response.json({ ...attemptRow, participant_id: administratorId }),
    });
    expect((await request(path, 'PUT', { chosen: [] })).status).toBe(404);
  });
});

describe('POST /portal/participants/{participantId}/test-attempts/{attemptId}/finish', () => {
  const path = own(`/test-attempts/${attemptId}/finish`);

  it('lists a failed attempt’s wrong answers with their explanations, never the correct option', async () => {
    mockUpstream();
    const response = await request(path, 'POST', undefined, {
      'cf-connecting-ip': '203.0.113.7',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(testAttemptOutcomeSchema.parse(body)).toEqual({
      id: attemptId,
      domain: 'ssm',
      test: 'hiring',
      finishedAt: '2026-10-20T09:12:00+00:00',
      score: 6,
      total: 10,
      passed: false,
      mistakes: [
        { index: 1, text: 'Întrebarea 2?', explanation: null },
        { index: 4, text: 'Întrebarea 5?', explanation: 'Legea 319/2006 obligă angajatorul.' },
        { index: 7, text: 'Întrebarea 8?', explanation: null },
        { index: 8, text: 'Întrebarea 9?', explanation: null },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('correct');
    expect(JSON.stringify(body)).not.toContain('options');
    expect(sent('/rest/v1/rpc/finish_test_attempt')).toEqual({
      p_attempt_id: attemptId,
      p_client_address: '203.0.113.7',
    });
    expect(calls('/rest/v1/signed_sheets')).toEqual([]);
  });

  it("puts a pass's result on the employee's stored sheet", async () => {
    mockUpstream({ finish: () => Response.json(finished([2])) });
    const response = await request(path, 'POST');
    const outcome = testAttemptOutcomeSchema.parse(await response.json());
    expect(outcome).toMatchObject({ score: 9, passed: true, mistakes: [] });
    const result = new URL(String(calls('/rest/v1/test_results')[0]![0])).searchParams;
    expect(result.get('attempt_id')).toBe(`eq.${attemptId}`);
    const sheets = new URL(String(calls('/rest/v1/signed_sheets')[0]![0])).searchParams;
    expect(sheets.get('employee_id')).toBe(`eq.${employeeId}`);
  });

  it('answers the outcome of a pass whose result could not be read', async () => {
    mockUpstream({
      finish: () => Response.json(finished([2])),
      results: () => Response.json({ code: 'XX000', message: 'boom' }, { status: 500 }),
    });
    const response = await request(path, 'POST');
    expect(response.status).toBe(200);
    expect(testAttemptOutcomeSchema.parse(await response.json())).toMatchObject({ passed: true });
    expect(calls('/rest/v1/signed_sheets')).toEqual([]);
  });

  it("finishes nothing for an attempt of the account's other participation", async () => {
    mockUpstream({ attempts: () => Response.json([]) });
    const response = await request(path, 'POST');
    expect(response.status).toBe(404);
    const drawn = new URL(String(calls('/rest/v1/test_attempts')[0]![0])).searchParams;
    expect(drawn.get('id')).toBe(`eq.${attemptId}`);
    expect(drawn.get('participant_id')).toBe(`eq.${participantId}`);
    expect(calls('/rest/v1/rpc/finish_test_attempt')).toEqual([]);
  });

  it('answers 409 to an attempt finished already', async () => {
    mockUpstream({ finish: () => raised('TST03', 'attempt_finished') });
    const response = await request(path, 'POST');
    expect(response.status).toBe(409);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('attempt_finished');
  });

  it("answers 404 to a participation that is not the account's, asking nothing", async () => {
    mockUpstream();
    const response = await request(
      `/portal/participants/88888888-0000-4000-8000-000000000009/test-attempts/${attemptId}/finish`,
      'POST'
    );
    expect(response.status).toBe(404);
    expect(calls('/rest/v1/test_attempts')).toEqual([]);
    expect(calls('/rest/v1/rpc/finish_test_attempt')).toEqual([]);
  });
});

describe('GET /portal/participants/{participantId}/materials/{domain}', () => {
  it('streams the issued PDF of the material, read with the secret key', async () => {
    mockUpstream();
    const response = await request(own('/materials/ssm'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toContain('inline;');
    expect(response.headers.get('Content-Disposition')).toContain(
      "UTF-8''Material%20de%20instruire%20introductiv-general%C4%83.pdf"
    );
    expect(await response.text()).toBe('%PDF-1.7 material');
    const [signing] = calls(`/storage/v1/object/sign/documents/${material.pdf_path}`);
    expect(new Headers(signing![1]?.headers).get('Authorization')).toBe(
      'Bearer sb_secret_test_key_value'
    );
  });

  it('answers 404 with a reason while none is issued', async () => {
    mockUpstream({ material: () => Response.json([]) });
    const response = await request(own('/materials/psi'));
    expect(response.status).toBe(404);
    expect(apiErrorResponseSchema.parse(await response.json()).reason).toBe('material_not_issued');
    expect(sent('/rest/v1/rpc/portal_material')).toEqual({
      p_participant_id: participantId,
      p_domain: 'psi',
    });
  });
});
