import type {
  CitationPart,
  TestAttempt,
  TestAttemptSummary,
  TestQuestion,
  TestResult,
  TrainingDomain,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database, Json } from '../../database.types';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError, failureLabel } from '../../lib/errors';
import { signedSheetContext, syncResultRows } from '../signed-sheets/signed-sheets';
import { summaryOf, testSheetSummaries } from '../test-sheets/test-sheets';

type Tables = Database['public']['Tables'];

export const questionColumns =
  'id, organization_id, domain, test, position, text, options, explanation, citation, replaces_question_id, created_at, updated_at';

export function toTestQuestion(
  row: Pick<
    Tables['test_questions']['Row'],
    | 'id'
    | 'organization_id'
    | 'domain'
    | 'test'
    | 'position'
    | 'text'
    | 'options'
    | 'explanation'
    | 'citation'
    | 'replaces_question_id'
    | 'created_at'
    | 'updated_at'
  >,
  hidden: boolean,
  citationParts: CitationPart[]
): TestQuestion {
  return {
    id: row.id,
    domain: row.domain,
    test: row.test,
    position: row.position,
    text: row.text,
    // The database checks the shape (`test_options_are_valid`).
    options: row.options as TestQuestion['options'],
    explanation: row.explanation,
    citation: row.citation,
    citationParts,
    builtIn: row.organization_id === null,
    hidden,
    replacesQuestionId: row.replaces_question_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const resultColumns =
  'id, employee_id, domain, test, taken_on, material, grade, examiner_name, examiner_job_title, source, attempt_id, created_at, updated_at';

export function toTestResult(
  row: Pick<
    Tables['test_results']['Row'],
    | 'id'
    | 'employee_id'
    | 'domain'
    | 'test'
    | 'taken_on'
    | 'material'
    | 'grade'
    | 'examiner_name'
    | 'examiner_job_title'
    | 'source'
    | 'attempt_id'
    | 'created_at'
    | 'updated_at'
  >
): TestResult {
  return {
    id: row.id,
    employeeId: row.employee_id,
    domain: row.domain,
    test: row.test,
    takenOn: row.taken_on,
    material: row.material,
    grade: 'admis',
    examiner:
      row.examiner_name !== null && row.examiner_job_title !== null
        ? { name: row.examiner_name, jobTitle: row.examiner_job_title }
        : null,
    source: row.source,
    attemptId: row.attempt_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Never `questions`: a summary lists no answers.
export const attemptSummaryColumns =
  'id, participant_id, domain, test, started_at, finished_at, score, total, passed';

export function toAttemptSummary(
  row: Pick<
    Tables['test_attempts']['Row'],
    'id' | 'domain' | 'test' | 'started_at' | 'finished_at' | 'score' | 'total' | 'passed'
  >
): TestAttemptSummary {
  return {
    id: row.id,
    domain: row.domain,
    test: row.test,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    score: row.score,
    total: row.total,
    passed: row.passed,
  };
}

// The portal shows the open attempt apart, so it lists only finished ones. Both caps are far
// above what one employee takes.
export async function employeeTestsOf(
  db: DataClient,
  { clientId, employeeId }: { clientId: string; employeeId: string },
  attempts: { finishedOnly: boolean; limit: number }
) {
  let attemptQuery = db
    .from('test_attempts')
    .select(attemptSummaryColumns)
    .eq('employee_id', employeeId)
    .eq('client_id', clientId);
  if (attempts.finishedOnly) attemptQuery = attemptQuery.not('finished_at', 'is', null);
  const [results, attemptRows] = await Promise.all([
    db
      .from('test_results')
      .select(resultColumns)
      .eq('employee_id', employeeId)
      .eq('client_id', clientId)
      .order('taken_on', { ascending: false })
      .order('created_at', { ascending: false }),
    attemptQuery.order('started_at', { ascending: false }).limit(attempts.limit),
  ]);
  if (results.error) throw fromDatabaseError(results.error, 'employee test results');
  if (attemptRows.error) throw fromDatabaseError(attemptRows.error, 'employee test attempts');
  const sheets = await testSheetSummaries(
    db,
    results.data.map((row) => row.id)
  );
  return (domain: TrainingDomain) => ({
    results: results.data
      .filter((row) => row.domain === domain)
      .map((row) => ({ ...toTestResult(row), sheet: summaryOf(sheets, row.id) })),
    attempts: attemptRows.data.filter((row) => row.domain === domain).map(toAttemptSummary),
  });
}

type ShownQuestion = {
  question_id: string;
  text: string;
  options: { text: string }[];
  chosen: number[];
};

/** An attempt in progress as the portal shows it: what was drawn, without a key. */
export function toTestAttempt(
  row: Pick<
    Tables['test_attempts']['Row'],
    'id' | 'domain' | 'test' | 'started_at' | 'total' | 'questions'
  >
): TestAttempt {
  return {
    id: row.id,
    domain: row.domain,
    test: row.test,
    startedAt: row.started_at,
    total: row.total,
    questions: (row.questions as ShownQuestion[]).map((question) => ({
      questionId: question.question_id,
      text: question.text,
      options: question.options.map((option) => ({ text: option.text })),
      chosen: question.chosen,
    })),
  };
}

/** The finish's marks on each question shown: `correct`, and the explanation to show if wrong. */
export type MarkedQuestion = ShownQuestion & { correct: boolean; explanation: string | null };

export const markedQuestions = (questions: Json) => questions as MarkedQuestion[];

export const noSuchEmployee = () =>
  new ApiError('not_found', 'This employee does not exist under this client.');

/**
 * What a new or changed result sets going, best effort: its row on the employee's stored signed
 * sheet, with the secret key, as a saved training's rows are. The result stands either way.
 */
export async function afterResult(c: Context<ApiEnv>, resultIds: string[]) {
  try {
    await syncResultRows(signedSheetContext(c), resultIds);
  } catch (error) {
    console.error(
      `Signed sheet rows of test results not brought up to date: ${failureLabel(error)}`
    );
  }
}
