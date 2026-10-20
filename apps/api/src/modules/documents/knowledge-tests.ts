import {
  type KnowledgeTest,
  knowledgeTestCodeOf,
  knowledgeTestTitleOf,
  type TrainingDomain,
} from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';

export const knowledgeTestDocuments = {
  test_hiring: { domain: 'ssm', test: 'hiring' },
  fire_test_hiring: { domain: 'psi', test: 'hiring' },
  fire_test_annual: { domain: 'psi', test: 'annual' },
} as const satisfies Record<string, { domain: TrainingDomain; test: KnowledgeTest }>;

export type KnowledgeTestTypeKey = keyof typeof knowledgeTestDocuments;

export const isKnowledgeTestTypeKey = (typeKey: string): typeKey is KnowledgeTestTypeKey =>
  typeKey in knowledgeTestDocuments;

/** One active question of the bank, in the bank's own order of options. */
export type BankQuestion = { text: string; options: { text: string; correct: boolean }[] };

/** The active questions of each test, in the printed order (`active_test_questions`). */
export type TestQuestionFacts = Record<KnowledgeTestTypeKey, BankQuestion[]>;

export type PrintedTest = {
  test: { code: string; title: string };
  questions: {
    number: number;
    text: string;
    options: { letter: string; text: string }[];
    key: string;
  }[];
};

const letters = 'abcd';

/** What a test's template prints: every active question, numbered, lettered and keyed. */
export function printedTest(typeKey: KnowledgeTestTypeKey, questions: BankQuestion[]): PrintedTest {
  const { domain, test } = knowledgeTestDocuments[typeKey];
  return {
    test: { code: knowledgeTestCodeOf(domain, test), title: knowledgeTestTitleOf(domain, test) },
    questions: questions.map((question, index) => ({
      number: index + 1,
      text: question.text.trim(),
      options: question.options.map((option, at) => ({
        letter: letters[at]!,
        text: option.text.trim(),
      })),
      key: question.options
        .flatMap((option, at) => (option.correct ? [letters[at]!.toUpperCase()] : []))
        .join(', '),
    })),
  };
}

export function printedTests<Keys extends KnowledgeTestTypeKey>(
  facts: TestQuestionFacts,
  typeKeys: readonly Keys[]
): Record<Keys, PrintedTest> {
  return Object.fromEntries(
    typeKeys.map((typeKey) => [typeKey, printedTest(typeKey, facts[typeKey])])
  ) as Record<Keys, PrintedTest>;
}

/** A test's own `test` and `questions`, beside the set's names; nothing for any other document. */
export function knowledgeTestData(
  tests: Partial<Record<KnowledgeTestTypeKey, PrintedTest>> | undefined,
  typeKey: string
): PrintedTest | Record<string, never> {
  return (isKnowledgeTestTypeKey(typeKey) && tests?.[typeKey]) || {};
}

type QuestionRow = { text: string; options: unknown };

const asBankQuestion = (row: QuestionRow): BankQuestion => ({
  text: row.text,
  // The database checks the shape (`test_options_are_valid`).
  options: row.options as BankQuestion['options'],
});

/**
 * Run as the caller, so a member reads their own organization's bank; the queue consumer's secret
 * key reads it too, the organization being the job's.
 */
export async function loadTestQuestions(
  db: DataClient,
  organizationId: string
): Promise<TestQuestionFacts> {
  const typeKeys = Object.keys(knowledgeTestDocuments) as KnowledgeTestTypeKey[];
  const answers = await Promise.all(
    typeKeys.map((typeKey) =>
      db
        .rpc('active_test_questions', {
          p_organization_id: organizationId,
          p_domain: knowledgeTestDocuments[typeKey].domain,
          p_test: knowledgeTestDocuments[typeKey].test,
        })
        .select('text, options')
    )
  );
  return Object.fromEntries(
    typeKeys.map((typeKey, index) => {
      const { data, error } = answers[index]!;
      if (error) throw fromDatabaseError(error, `document facts: questions of ${typeKey}`);
      return [typeKey, data.map(asBankQuestion)];
    })
  ) as TestQuestionFacts;
}
