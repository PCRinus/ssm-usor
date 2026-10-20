import type {
  TestAttempt,
  TestAttemptSummary,
  TestQuestion,
  TestResult,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import type { Database, Json } from '../../database.types';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { signedSheetContext, syncResultRows } from '../signed-sheets/signed-sheets';

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
  hidden: boolean
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

// Never `questions`: a finished attempt carries the key of its draw.
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
      `Signed sheet rows of test results not brought up to date: ${error instanceof ApiError ? (error.reason ?? error.code) : error instanceof Error ? error.name : 'unknown'}`
    );
  }
}
