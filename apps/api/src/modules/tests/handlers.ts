import type { RouteHandler } from '@hono/zod-openapi';
import {
  type EmployeeDomainTests,
  type KnowledgeTest,
  knowledgeTestCodeOf,
  knowledgeTestsByDomain,
  knowledgeTestTitleOf,
  testErrorReasons,
  testMinimumActiveQuestions,
  testPassMarkPercent,
  testResultMaterial,
  testSittingSize,
  type TrainingDomain,
  trainingDomains,
} from '@ssm-usor/contracts';

import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { romanianDay } from '../documents/context';
import {
  issueTestSheetRequests,
  refillExaminer,
  storedTestSheet,
  storedTestSheetLink,
  summaryOf,
  testSheetDeps,
  testSheetFileName,
  testSheetNotAvailable,
  testSheetOf,
  testSheetPdf,
  testSheetSummaries,
} from '../test-sheets/test-sheets';
import type {
  createTestQuestionRoute,
  deleteTestQuestionRoute,
  getEmployeeTestsRoute,
  getTestBankRoute,
  getTestSheetLinkRoute,
  getTestSheetRoute,
  hideTestQuestionRoute,
  markTestSheetPaperSignatureRoute,
  recordPaperTestResultRoute,
  restoreTestQuestionRoute,
  updateTestQuestionRoute,
  updateTestResultRoute,
} from './routes';
import {
  afterResult,
  attemptSummaryColumns,
  noSuchEmployee,
  questionColumns,
  resultColumns,
  toAttemptSummary,
  toTestQuestion,
  toTestResult,
} from './rows';
import { toEmployeeTests } from './status';

const noSuchQuestion = () => new ApiError('not_found', 'This question does not exist.');

const builtInRefused = () =>
  new ApiError(
    'conflict',
    'O întrebare predefinită nu se modifică și nu se șterge: ascunde-o și scrie una proprie.',
    undefined,
    testErrorReasons.builtIn
  );

async function hiddenIds(db: DataClient, organizationId: string) {
  const { data, error } = await db
    .from('test_question_hides')
    .select('question_id')
    .eq('organization_id', organizationId);
  if (error) throw fromDatabaseError(error, 'hidden test questions');
  return new Set(data.map((row) => row.question_id));
}

// The members' policies show the built-ins and the organization's own, nothing else.
async function readQuestion(db: DataClient, organizationId: string, questionId: string) {
  const [question, hidden] = await Promise.all([
    db.from('test_questions').select(questionColumns).eq('id', questionId).maybeSingle(),
    hiddenIds(db, organizationId),
  ]);
  if (question.error) throw fromDatabaseError(question.error, 'find test question');
  if (!question.data) throw noSuchQuestion();
  return toTestQuestion(question.data, hidden.has(question.data.id));
}

export const getTestBank: RouteHandler<typeof getTestBankRoute, ApiEnv> = async (c) => {
  const { domain, test } = c.req.valid('query');
  const db = createDataClient(c);
  let query = db.from('test_questions').select(questionColumns);
  if (domain) query = query.eq('domain', domain);
  if (test) query = query.eq('test', test);
  const [questions, hidden] = await Promise.all([
    // As `active_test_questions` orders them.
    query
      .order('position')
      .order('organization_id', { nullsFirst: true })
      .order('created_at')
      .order('id'),
    hiddenIds(db, c.get('membership').organizationId),
  ]);
  if (questions.error) throw fromDatabaseError(questions.error, 'list test questions');
  const all = questions.data.map((row) => toTestQuestion(row, hidden.has(row.id)));
  const tests = trainingDomains.flatMap((each) =>
    knowledgeTestsByDomain[each]
      .filter(() => !domain || each === domain)
      .filter((kind) => !test || kind === test)
      .map((kind) => {
        const ofTest = all.filter((question) => question.domain === each && question.test === kind);
        return {
          domain: each,
          test: kind,
          code: knowledgeTestCodeOf(each, kind),
          title: knowledgeTestTitleOf(each, kind),
          activeCount: ofTest.filter((question) => !question.hidden).length,
          questions: ofTest,
        };
      })
  );
  return c.json(
    {
      sittingSize: testSittingSize,
      minimumActiveQuestions: testMinimumActiveQuestions,
      passMarkPercent: testPassMarkPercent,
      tests,
    },
    200
  );
};

async function nextPosition(db: DataClient, domain: TrainingDomain, test: KnowledgeTest) {
  const { data, error } = await db
    .from('test_questions')
    .select('position')
    .eq('domain', domain)
    .eq('test', test)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'last test question position');
  return (data?.position ?? 0) + 1;
}

export const createTestQuestion: RouteHandler<typeof createTestQuestionRoute, ApiEnv> = async (
  c
) => {
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const { organizationId } = c.get('membership');
  const { data, error } = await db
    .from('test_questions')
    .insert({
      organization_id: organizationId,
      domain: body.domain,
      test: body.test,
      position: body.position ?? (await nextPosition(db, body.domain, body.test)),
      text: body.text,
      options: body.options,
      explanation: body.explanation ?? null,
      citation: body.citation ?? null,
      replaces_question_id: body.replacesQuestionId ?? null,
      created_by: c.get('user').id,
    })
    .select(questionColumns)
    .single();
  if (error) throw fromDatabaseError(error, 'create test question');
  return c.json({ question: toTestQuestion(data, false) }, 201);
};

async function ownQuestion(db: DataClient, organizationId: string, questionId: string) {
  const question = await readQuestion(db, organizationId, questionId);
  if (question.builtIn) throw builtInRefused();
  return question;
}

export const updateTestQuestion: RouteHandler<typeof updateTestQuestionRoute, ApiEnv> = async (
  c
) => {
  const { questionId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await ownQuestion(db, c.get('membership').organizationId, questionId);
  const { data, error } = await db
    .from('test_questions')
    .update({
      ...(body.position === undefined ? {} : { position: body.position }),
      text: body.text,
      options: body.options,
      explanation: body.explanation ?? null,
      citation: body.citation ?? null,
      replaces_question_id: body.replacesQuestionId ?? null,
    })
    .eq('id', questionId)
    .select(questionColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'update test question');
  if (!data) throw noSuchQuestion();
  return c.json({ question: toTestQuestion(data, false) }, 200);
};

export const deleteTestQuestion: RouteHandler<typeof deleteTestQuestionRoute, ApiEnv> = async (
  c
) => {
  const { questionId } = c.req.valid('param');
  const db = createDataClient(c);
  await ownQuestion(db, c.get('membership').organizationId, questionId);
  const { error } = await db.from('test_questions').delete().eq('id', questionId);
  if (error) throw fromDatabaseError(error, 'delete test question');
  return c.body(null, 204);
};

const alreadyHidden = '23505';

export const hideTestQuestion: RouteHandler<typeof hideTestQuestionRoute, ApiEnv> = async (c) => {
  const { questionId } = c.req.valid('param');
  const db = createDataClient(c);
  const { organizationId } = c.get('membership');
  const question = await readQuestion(db, organizationId, questionId);
  if (!question.hidden) {
    const { error } = await db
      .from('test_question_hides')
      .insert({ organization_id: organizationId, question_id: questionId });
    if (error && error.code !== alreadyHidden) {
      throw fromDatabaseError(error, 'hide test question');
    }
  }
  return c.json({ question: { ...question, hidden: true } }, 200);
};

export const restoreTestQuestion: RouteHandler<typeof restoreTestQuestionRoute, ApiEnv> = async (
  c
) => {
  const { questionId } = c.req.valid('param');
  const db = createDataClient(c);
  const { organizationId } = c.get('membership');
  const question = await readQuestion(db, organizationId, questionId);
  const { error } = await db
    .from('test_question_hides')
    .delete()
    .eq('organization_id', organizationId)
    .eq('question_id', questionId);
  if (error) throw fromDatabaseError(error, 'restore test question');
  return c.json({ question: { ...question, hidden: false } }, 200);
};

async function readStanding(db: DataClient, clientId: string, employeeId: string) {
  const { data, error } = await db
    .from('employees')
    .select(
      'id, test_status(ssm_state, ssm_awaiting_test, ssm_last_passed_on, ssm_hiring_trained_on, psi_state, psi_awaiting_test, psi_last_passed_on, psi_due_on, psi_hiring_trained_on)'
    )
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find tested employee');
  if (!data) throw noSuchEmployee();
  return data;
}

export const getEmployeeTests: RouteHandler<typeof getEmployeeTestsRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const db = createDataClient(c);
  const [employee, results, attempts] = await Promise.all([
    readStanding(db, clientId, employeeId),
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
      .order('started_at', { ascending: false })
      .limit(200),
  ]);
  if (results.error) throw fromDatabaseError(results.error, 'employee test results');
  if (attempts.error) throw fromDatabaseError(attempts.error, 'employee test attempts');
  const status = toEmployeeTests(employee.test_status);
  const sheets = await testSheetSummaries(
    db,
    results.data.map((row) => row.id)
  );
  const ofDomain = (domain: TrainingDomain): EmployeeDomainTests => ({
    status: status[domain],
    results: results.data
      .filter((row) => row.domain === domain)
      .map((row) => ({ ...toTestResult(row), sheet: summaryOf(sheets, row.id) })),
    attempts: attempts.data.filter((row) => row.domain === domain).map(toAttemptSummary),
  });
  return c.json({ ssm: ofDomain('ssm'), psi: ofDomain('psi') }, 200);
};

const notAwaiting = (message: string) =>
  new ApiError('conflict', message, undefined, testErrorReasons.notAwaiting);

export const recordPaperTestResult: RouteHandler<
  typeof recordPaperTestResultRoute,
  ApiEnv
> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const employee = await readStanding(db, clientId, employeeId);
  const hiringTrainedOn = employee.test_status?.[`${body.domain}_hiring_trained_on`] ?? null;
  const lastPassedOn = employee.test_status?.[`${body.domain}_last_passed_on`] ?? null;
  // Read apart from the state, which a leaver has none of: a paper result may be theirs.
  if (body.test === 'hiring') {
    if (!hiringTrainedOn) {
      throw notAwaiting(
        'Testul la angajare se înregistrează după instruirea la angajare pe care o încheie.'
      );
    }
    if (lastPassedOn) throw notAwaiting('Angajatul a promovat deja testul la angajare.');
  } else if (!lastPassedOn) {
    throw notAwaiting(
      'Testul anual urmează unui test promovat în domeniul situațiilor de urgență.'
    );
  }
  if (body.takenOn > romanianDay(new Date().toISOString())) {
    throw new ApiError('validation_error', 'A test is recorded once it was taken.', [
      { path: 'takenOn', message: 'Ziua testului nu poate fi în viitor.' },
    ]);
  }
  const { data, error } = await db
    .from('test_results')
    .insert({
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      employee_id: employeeId,
      domain: body.domain,
      test: body.test,
      taken_on: body.takenOn,
      material: body.material ?? testResultMaterial(body.domain, body.test),
      grade: body.grade,
      examiner_name: body.examiner.name,
      examiner_job_title: body.examiner.jobTitle,
      source: 'paper',
      created_by: c.get('user').id,
    })
    .select(resultColumns)
    .single();
  if (error) throw fromDatabaseError(error, 'record paper test result');
  await afterResult(c, [data.id]);
  return c.json({ result: toTestResult(data) }, 201);
};

export const updateTestResult: RouteHandler<typeof updateTestResultRoute, ApiEnv> = async (c) => {
  const { clientId, employeeId, resultId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  if (body.takenOn && body.takenOn > romanianDay(new Date().toISOString())) {
    throw new ApiError('validation_error', 'A test is recorded once it was taken.', [
      { path: 'takenOn', message: 'Ziua testului nu poate fi în viitor.' },
    ]);
  }
  const { data, error } = await db
    .from('test_results')
    .update({
      ...(body.takenOn === undefined ? {} : { taken_on: body.takenOn }),
      ...(body.material === undefined ? {} : { material: body.material }),
      examiner_name: body.examiner.name,
      examiner_job_title: body.examiner.jobTitle,
    })
    .eq('id', resultId)
    .eq('employee_id', employeeId)
    .eq('client_id', clientId)
    .select(resultColumns)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'update test result');
  if (!data) throw new ApiError('not_found', 'This test result does not exist.');
  await afterResult(c, [data.id]);
  await afterExaminerChange(c, data.id);
  return c.json({ result: toTestResult(data) }, 200);
};

/**
 * The database has voided the pending examiner request (`signer_changed`). Best effort, as the
 * signed sheet's row: the examiner's signature fills the fields from the result itself.
 */
async function afterExaminerChange(c: Parameters<typeof testSheetDeps>[0], resultId: string) {
  try {
    const deps = testSheetDeps(c);
    const sheet = await storedTestSheet(deps.admin, resultId);
    if (!sheet) return;
    const refilled = (await refillExaminer(deps, resultId)) ?? sheet;
    await issueTestSheetRequests(deps, refilled, c.get('user').id);
  } catch (failure) {
    console.error(
      `Test sheet of ${resultId} not brought up to date with its examiner: ${failure instanceof ApiError ? (failure.reason ?? failure.code) : failure instanceof Error ? failure.name : 'unknown'}`
    );
  }
}

async function readResultOfEmployee(
  db: DataClient,
  { clientId, employeeId, resultId }: { clientId: string; employeeId: string; resultId: string }
) {
  const { data, error } = await db
    .from('test_results')
    .select(
      'id, domain, test, taken_on, source, employees!test_results_employee_of_client(last_name, first_name)'
    )
    .eq('id', resultId)
    .eq('employee_id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find test result');
  if (!data) throw new ApiError('not_found', 'This test result does not exist.');
  return data as typeof data & { employees: { last_name: string; first_name: string } };
}

export const getTestSheet: RouteHandler<typeof getTestSheetRoute, ApiEnv> = async (c) => {
  const params = c.req.valid('param');
  const result = await readResultOfEmployee(createDataClient(c), params);
  if (result.source !== 'portal') throw testSheetNotAvailable();
  const pdf = await testSheetPdf(c, result.id);
  return c.body(new Uint8Array(pdf), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': contentDisposition(
      'inline',
      testSheetFileName(result.employees, result)
    ),
  });
};

export const getTestSheetLink: RouteHandler<typeof getTestSheetLinkRoute, ApiEnv> = async (c) => {
  const result = await readResultOfEmployee(createDataClient(c), c.req.valid('param'));
  if (result.source !== 'portal') throw testSheetNotAvailable();
  return c.json(
    await storedTestSheetLink(c, result.id, testSheetFileName(result.employees, result)),
    200
  );
};

export const markTestSheetPaperSignature: RouteHandler<
  typeof markTestSheetPaperSignatureRoute,
  ApiEnv
> = async (c) => {
  const params = c.req.valid('param');
  const { slot } = c.req.valid('json');
  const db = createDataClient(c);
  const result = await readResultOfEmployee(db, params);
  if (result.source !== 'portal') throw testSheetNotAvailable();
  const sheet = await testSheetOf(c, result.id);
  const { error } = await db.rpc('mark_test_sheet_paper_signature', {
    p_test_sheet_id: sheet.id,
    p_slot: slot,
  });
  if (error) {
    if (error.code === 'P0002') throw testSheetNotAvailable();
    throw fromDatabaseError(error, 'mark test sheet paper signature');
  }
  const summaries = await testSheetSummaries(db, [result.id]);
  return c.json({ resultId: result.id, sheet: summaryOf(summaries, result.id) }, 200);
};
