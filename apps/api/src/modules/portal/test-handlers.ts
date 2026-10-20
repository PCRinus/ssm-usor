import type { RouteHandler } from '@hono/zod-openapi';
import {
  isKnowledgeTestOf,
  type KnowledgeTest,
  type PortalDomainTests,
  testErrorReasons,
  type TrainingDomain,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database } from '../../database.types';
import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createAdminFileStore } from '../../lib/files';
import { participationOf } from '../../lib/participant';
import { fileNameOf } from '../documents/documents';
import { clientIpOf } from '../signing/session-signing';
import {
  afterTestPass,
  summaryOf,
  testSheetFileName,
  testSheetNotAvailable,
  testSheetPdf,
  testSheetSummaries,
} from '../test-sheets/test-sheets';
import {
  afterResult,
  attemptSummaryColumns,
  markedQuestions,
  noSuchEmployee,
  resultColumns,
  toAttemptSummary,
  toTestAttempt,
  toTestResult,
} from '../tests/rows';
import { testStatusColumns, toEmployeeTests } from '../tests/status';
import type {
  answerPortalTestAttemptRoute,
  finishPortalTestAttemptRoute,
  getPortalMaterialRoute,
  getPortalTestSheetRoute,
  getPortalTestsRoute,
  getPortalTestStudyCardRoute,
  startPortalTestAttemptRoute,
} from './test-routes';

type AttemptRow = Database['public']['Tables']['test_attempts']['Row'];

// The participant's own employee: a client administrator who is not one takes no test.
function testedEmployee(c: Context<ApiEnv>, participantId: string) {
  const participation = participationOf(c, participantId);
  if (!participation.employeeId) {
    throw new ApiError('not_found', 'This participant is not an employee of the client.');
  }
  return { ...participation, employeeId: participation.employeeId };
}

function ofItsDomain(domain: TrainingDomain, test: KnowledgeTest) {
  if (!isKnowledgeTestOf(domain, test)) {
    throw new ApiError('validation_error', 'The annual test is a fire-safety test.');
  }
}

// The definer functions raise P0002 for what is not the caller's own.
function fromTestFunction(error: { code?: string | null; message?: string }, context: string) {
  if (error.code === 'P0002') {
    return new ApiError(
      'not_found',
      'This participation or attempt is not yours.',
      undefined,
      error.message || undefined
    );
  }
  return fromDatabaseError(error, context);
}

async function issuedMaterial(db: DataClient, participantId: string, domain: TrainingDomain) {
  const { data, error } = await db.rpc('portal_material', {
    p_participant_id: participantId,
    p_domain: domain,
  });
  if (error) throw fromTestFunction(error, 'portal material');
  return data[0] ?? null;
}

const evidenceOf = (c: Context<ApiEnv>) => ({
  p_client_address: clientIpOf(c) ?? undefined,
  p_user_agent: c.req.header('user-agent')?.slice(0, 1000) ?? undefined,
});

// The function answers for the account; the path's participation must be the one that drew it.
function ownAttempt(attempt: AttemptRow, participantId: string) {
  if (attempt.participant_id !== participantId) {
    throw new ApiError('not_found', 'This attempt is not of this participation.');
  }
  return attempt;
}

export const getPortalTests: RouteHandler<typeof getPortalTestsRoute, ApiEnv> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { clientId, employeeId } = testedEmployee(c, participantId);
  const db = createDataClient(c);
  const [employee, results, finished, inProgress] = await Promise.all([
    db
      .from('employees')
      .select(`id, ${testStatusColumns}`)
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('test_results')
      .select(resultColumns)
      .eq('employee_id', employeeId)
      .eq('client_id', clientId)
      .order('taken_on', { ascending: false })
      .order('created_at', { ascending: false }),
    db
      .from('test_attempts')
      .select(attemptSummaryColumns)
      .eq('employee_id', employeeId)
      .eq('client_id', clientId)
      .not('finished_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(100),
    db
      .from('test_attempts')
      .select('id, domain, test, started_at, total, questions')
      .eq('participant_id', participantId)
      .is('finished_at', null),
  ]);
  if (employee.error) throw fromDatabaseError(employee.error, 'portal tested employee');
  if (results.error) throw fromDatabaseError(results.error, 'portal test results');
  if (finished.error) throw fromDatabaseError(finished.error, 'portal test attempts');
  if (inProgress.error) throw fromDatabaseError(inProgress.error, 'portal attempts in progress');
  if (!employee.data) throw noSuchEmployee();
  const status = toEmployeeTests(employee.data.test_status);
  const sheets = await testSheetSummaries(
    db,
    results.data.map((row) => row.id)
  );
  // The start resumes only the attempt of the test that awaits; another one left open, after a
  // paper pass, is refused as not awaiting and would never close.
  const ofDomain = (domain: TrainingDomain): PortalDomainTests => {
    const resumed = inProgress.data.find(
      (row) => row.domain === domain && row.test === status[domain].awaitingTest
    );
    return {
      status: status[domain],
      results: results.data
        .filter((row) => row.domain === domain)
        .map((row) => ({ ...toTestResult(row), sheet: summaryOf(sheets, row.id) })),
      attempts: finished.data.filter((row) => row.domain === domain).map(toAttemptSummary),
      inProgress: resumed ? toTestAttempt(resumed) : null,
    };
  };
  return c.json({ ssm: ofDomain('ssm'), psi: ofDomain('psi') }, 200);
};

export const getPortalTestStudyCard: RouteHandler<
  typeof getPortalTestStudyCardRoute,
  ApiEnv
> = async (c) => {
  const { participantId, domain, test } = c.req.valid('param');
  ofItsDomain(domain, test);
  testedEmployee(c, participantId);
  const db = createDataClient(c);
  const [card, material] = await Promise.all([
    db.rpc('test_study_card', { p_participant_id: participantId, p_domain: domain, p_test: test }),
    issuedMaterial(db, participantId, domain),
  ]);
  if (card.error) throw fromTestFunction(card.error, 'test study card');
  return c.json(
    {
      explanations: card.data.map((row) => row.explanation),
      material: material
        ? { revisionId: material.revision_id, title: material.title, issuedAt: material.issued_at }
        : null,
    },
    200
  );
};

export const startPortalTestAttempt: RouteHandler<
  typeof startPortalTestAttemptRoute,
  ApiEnv
> = async (c) => {
  const { participantId, domain, test } = c.req.valid('param');
  ofItsDomain(domain, test);
  testedEmployee(c, participantId);
  const db = createDataClient(c);
  const material = await issuedMaterial(db, participantId, domain);
  const { data, error } = await db.rpc('start_test_attempt', {
    p_participant_id: participantId,
    p_domain: domain,
    p_test: test,
    p_material_revision_id: material?.revision_id,
    ...evidenceOf(c),
  });
  if (error) throw fromTestFunction(error, 'start test attempt');
  return c.json({ attempt: toTestAttempt(data) }, 200);
};

export const answerPortalTestAttempt: RouteHandler<
  typeof answerPortalTestAttemptRoute,
  ApiEnv
> = async (c) => {
  const { participantId, attemptId, questionIndex } = c.req.valid('param');
  const { chosen } = c.req.valid('json');
  testedEmployee(c, participantId);
  const { data, error } = await createDataClient(c).rpc('answer_test_attempt', {
    p_attempt_id: attemptId,
    p_question_index: Number(questionIndex),
    p_chosen: chosen,
  });
  if (error) throw fromTestFunction(error, 'answer test attempt');
  return c.json({ attempt: toTestAttempt(ownAttempt(data, participantId)) }, 200);
};

/**
 * What a pass sets going once the finish has recorded its result: the result's row on the
 * employee's stored signed sheet, and the test sheet with its trainee's and examiner's requests.
 */
async function afterPass(c: Context<ApiEnv>, db: DataClient, attemptId: string) {
  const { data, error } = await db
    .from('test_results')
    .select('id')
    .eq('attempt_id', attemptId)
    .maybeSingle();
  // The finish has committed: a failure here must not keep the outcome from the participant,
  // who would then find the attempt finished and never see it.
  if (error) {
    console.error(`Result of passing attempt ${attemptId} not read: ${error.code ?? 'no code'}`);
    return;
  }
  if (!data) return;
  await afterResult(c, [data.id]);
  await afterTestPass(c, data.id);
}

export const finishPortalTestAttempt: RouteHandler<
  typeof finishPortalTestAttemptRoute,
  ApiEnv
> = async (c) => {
  const { participantId, attemptId } = c.req.valid('param');
  testedEmployee(c, participantId);
  const db = createDataClient(c);
  // Checked before the finish, which answers for the account and cannot be taken back.
  const drawn = await db
    .from('test_attempts')
    .select('id')
    .eq('id', attemptId)
    .eq('participant_id', participantId)
    .maybeSingle();
  if (drawn.error) throw fromDatabaseError(drawn.error, 'attempt to finish');
  if (!drawn.data) throw new ApiError('not_found', 'This attempt is not of this participation.');
  const { data, error } = await db.rpc('finish_test_attempt', {
    p_attempt_id: attemptId,
    ...evidenceOf(c),
  });
  if (error) throw fromTestFunction(error, 'finish test attempt');
  const attempt = ownAttempt(data, participantId);
  if (attempt.passed) await afterPass(c, db, attempt.id);
  // Which option was correct is never answered (ADR 024).
  const mistakes = attempt.passed
    ? []
    : markedQuestions(attempt.questions).flatMap((question, index) =>
        question.correct ? [] : [{ index, text: question.text, explanation: question.explanation }]
      );
  return c.json(
    {
      id: attempt.id,
      domain: attempt.domain,
      test: attempt.test,
      finishedAt: attempt.finished_at!,
      score: attempt.score!,
      total: attempt.total,
      passed: attempt.passed!,
      mistakes,
    },
    200
  );
};

export const getPortalMaterial: RouteHandler<typeof getPortalMaterialRoute, ApiEnv> = async (c) => {
  const { participantId, domain } = c.req.valid('param');
  participationOf(c, participantId);
  const material = await issuedMaterial(createDataClient(c), participantId, domain);
  if (!material) {
    throw new ApiError(
      'not_found',
      'The material of this test is not issued yet.',
      undefined,
      testErrorReasons.materialNotIssued
    );
  }
  // A participant reads no document file: the path is the one the function gave for the
  // caller's own participation, read with the secret key.
  const pdf = await createAdminFileStore(c).readDocument(material.pdf_path);
  return c.body(new Uint8Array(pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition('inline', `${fileNameOf(material.title)}.pdf`),
  });
};

// The employee reads their own results' sheets; the client administrator any employee's of the
// client, checked here as for the client's requests, since an account that is also a member
// reads every result of the organization through the members' policies.
export const getPortalTestSheet: RouteHandler<typeof getPortalTestSheetRoute, ApiEnv> = async (
  c
) => {
  const { participantId, resultId } = c.req.valid('param');
  const participation = participationOf(c, participantId);
  let query = createDataClient(c)
    .from('test_results')
    .select(
      'id, domain, test, taken_on, source, employee_id, employees!test_results_employee_of_client(last_name, first_name)'
    )
    .eq('id', resultId)
    .eq('client_id', participation.clientId);
  if (participation.kind !== 'client_administrator') {
    if (!participation.employeeId) throw testSheetNotAvailable();
    query = query.eq('employee_id', participation.employeeId);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw fromDatabaseError(error, 'portal test result');
  if (!data) throw new ApiError('not_found', 'This test result is not yours to read.');
  if (data.source !== 'portal') throw testSheetNotAvailable();
  const employee = data.employees as unknown as { last_name: string; first_name: string };
  const pdf = await testSheetPdf(c, data.id);
  return c.body(new Uint8Array(pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition('inline', testSheetFileName(employee, data)),
  });
};
