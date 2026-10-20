import { z } from 'zod';

import { type TrainingDomain, trainingDomainSchema } from './trainings';

export const knowledgeTests = ['hiring', 'annual'] as const;
export const knowledgeTestSchema = z.enum(knowledgeTests);
export type KnowledgeTest = z.infer<typeof knowledgeTestSchema>;

export const knowledgeTestLabels: Record<KnowledgeTest, string> = {
  hiring: 'Testul la angajare',
  annual: 'Testul anual',
};

/** The tests the law asks for: no annual occupational safety test, no periodic one (ADR 024). */
export const knowledgeTestsByDomain: Record<TrainingDomain, readonly KnowledgeTest[]> = {
  ssm: ['hiring'],
  psi: ['hiring', 'annual'],
};

export const isKnowledgeTestOf = (domain: TrainingDomain, test: KnowledgeTest) =>
  knowledgeTestsByDomain[domain].includes(test);

export const knowledgeTestCodes = {
  ssm: { hiring: 'TASSM' },
  psi: { hiring: 'TASU', annual: 'TPSU' },
} as const;

/** finish_test_attempt writes the same text for a portal pass: the two change together. */
export function testResultMaterial(domain: TrainingDomain, test: KnowledgeTest) {
  if (test === 'annual') return 'Verificare anuală pe bază de test (TPSU)';
  return `Test de verificare a cunoștințelor la angajare (${domain === 'ssm' ? 'TASSM' : 'TASU'})`;
}

/** Fixed for every organization (ADR 024); a setting is #535. */
export const testSittingSize = 10;
export const testMinimumActiveQuestions = 10;
export const testPassMarkPercent = 70;

/** Seven of ten: a question counts only when the options chosen are exactly the correct ones. */
export const testPassed = (score: number, total: number) =>
  score * 100 >= total * testPassMarkPercent;

const testOnItsDomain = (
  value: { domain: TrainingDomain; test: KnowledgeTest },
  ctx: z.RefinementCtx
) => {
  if (!isKnowledgeTestOf(value.domain, value.test)) {
    ctx.addIssue({
      code: 'custom',
      path: ['test'],
      message: 'The annual test is a fire-safety test.',
    });
  }
};

const questionText = z.string().trim().min(5).max(1000);
const optionText = z.string().trim().min(1).max(500);

export const testQuestionOptionSchema = z.object({ text: optionText, correct: z.boolean() });
export type TestQuestionOption = z.infer<typeof testQuestionOptionSchema>;

export const testQuestionOptionsSchema = z
  .array(testQuestionOptionSchema)
  .min(2)
  .max(4)
  .refine((options) => options.some((option) => option.correct), {
    message: 'At least one option is correct.',
  });

export const testQuestionSchema = z.object({
  id: z.uuid(),
  domain: trainingDomainSchema,
  test: knowledgeTestSchema,
  position: z.int().min(1),
  text: z.string(),
  options: z.array(testQuestionOptionSchema),
  explanation: z.string().nullable(),
  citation: z.string().nullable(),
  // A built-in question is the app's: read by every organization, edited by none, hidden apart.
  builtIn: z.boolean(),
  // Only a built-in is hidden; an own question is deleted instead.
  hidden: z.boolean(),
  // Provenance only: the built-in an own question departs from.
  replacesQuestionId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type TestQuestion = z.infer<typeof testQuestionSchema>;

const ownQuestionFields = {
  text: questionText,
  options: testQuestionOptionsSchema,
  explanation: z.string().trim().min(1).max(1000).nullish(),
  citation: z.string().trim().min(1).max(300).nullish(),
  replacesQuestionId: z.uuid().nullish(),
};

export const createTestQuestionRequestSchema = z
  .object({
    domain: trainingDomainSchema,
    test: knowledgeTestSchema,
    // Left out, after the test's other questions.
    position: z.int().min(1).optional(),
    ...ownQuestionFields,
  })
  .superRefine(testOnItsDomain);

export type CreateTestQuestionRequest = z.infer<typeof createTestQuestionRequestSchema>;

/** A question never moves to another domain or test. */
export const updateTestQuestionRequestSchema = z.object({
  position: z.int().min(1).optional(),
  ...ownQuestionFields,
});

export type UpdateTestQuestionRequest = z.infer<typeof updateTestQuestionRequestSchema>;

const chosenOptions = z.array(z.int().min(0).max(3)).max(4);

// In progress, an attempt carries no key: the correct flags arrive with the finish.

export const testAttemptQuestionSchema = z.object({
  questionId: z.uuid(),
  text: z.string(),
  options: z.array(z.object({ text: z.string() })),
  // Indices into `options`; empty while unanswered.
  chosen: chosenOptions,
});

export type TestAttemptQuestion = z.infer<typeof testAttemptQuestionSchema>;

export const testAttemptSchema = z.object({
  id: z.uuid(),
  domain: trainingDomainSchema,
  test: knowledgeTestSchema,
  startedAt: z.iso.datetime({ offset: true }),
  total: z.int().min(1),
  questions: z.array(testAttemptQuestionSchema),
});

export type TestAttempt = z.infer<typeof testAttemptSchema>;

/**
 * A finished attempt as the portal shows it: the score and, for a failed one, each question
 * answered wrong with its explanation, the correct option not marked (ADR 024).
 */
export const testAttemptOutcomeSchema = z.object({
  id: z.uuid(),
  domain: trainingDomainSchema,
  test: knowledgeTestSchema,
  finishedAt: z.iso.datetime({ offset: true }),
  score: z.int().min(0),
  total: z.int().min(1),
  passed: z.boolean(),
  mistakes: z.array(z.object({ text: z.string(), explanation: z.string().nullable() })),
});

export type TestAttemptOutcome = z.infer<typeof testAttemptOutcomeSchema>;

export const testAttemptAnswerRequestSchema = z.object({
  questionIndex: z
    .int()
    .min(0)
    .max(testSittingSize - 1),
  chosen: chosenOptions.refine((chosen) => new Set(chosen).size === chosen.length, {
    message: 'Each option is chosen once.',
  }),
});

export type TestAttemptAnswerRequest = z.infer<typeof testAttemptAnswerRequestSchema>;

/** Nothing to send: the API adds the address and the user agent. */
export const testAttemptFinishRequestSchema = z.object({}).strict();

export type TestAttemptFinishRequest = z.infer<typeof testAttemptFinishRequestSchema>;

export const testResultSources = ['portal', 'paper'] as const;
export const testResultSourceSchema = z.enum(testResultSources);
export type TestResultSource = z.infer<typeof testResultSourceSchema>;

export const testResultSourceLabels: Record<TestResultSource, string> = {
  portal: 'Din portal',
  paper: 'De pe hârtie',
};

// A failed test is not recorded: the sheet prints passes (ADR 024).
export const testGrades = ['admis'] as const;
export const testGradeSchema = z.enum(testGrades);
export type TestGrade = z.infer<typeof testGradeSchema>;

export const testGradeLabels: Record<TestGrade, string> = { admis: 'Admis' };

const personText = z.string().trim().min(1).max(160);

const testExaminerSchema = z.object({ name: personText, jobTitle: personText });

export const testResultSchema = z.object({
  id: z.uuid(),
  employeeId: z.uuid(),
  domain: trainingDomainSchema,
  test: knowledgeTestSchema,
  takenOn: z.iso.date(),
  material: z.string(),
  grade: testGradeSchema,
  // Null on a portal pass the organization had nobody to propose for, until a member names them.
  examiner: z.object({ name: z.string(), jobTitle: z.string() }).nullable(),
  source: testResultSourceSchema,
  attemptId: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type TestResult = z.infer<typeof testResultSchema>;

export const paperTestResultRequestSchema = z
  .object({
    domain: trainingDomainSchema,
    test: knowledgeTestSchema,
    takenOn: z.iso.date(),
    // Left out, the test's name and code.
    material: z.string().trim().min(1).max(300).optional(),
    grade: testGradeSchema.default('admis'),
    examiner: testExaminerSchema,
  })
  .superRefine(testOnItsDomain);

export type PaperTestResultRequest = z.infer<typeof paperTestResultRequestSchema>;

/** A portal pass changes only in its examiner; a paper one in its day and material too. */
export const updateTestResultRequestSchema = z.object({
  takenOn: z.iso.date().optional(),
  material: z.string().trim().min(1).max(300).optional(),
  examiner: testExaminerSchema,
});

export type UpdateTestResultRequest = z.infer<typeof updateTestResultRequestSchema>;

export const testStates = ['none', 'pending', 'passed', 'annual_due'] as const;
export const testStateSchema = z.enum(testStates);
export type TestState = z.infer<typeof testStateSchema>;

export const testStateLabels: Record<TestState, string> = {
  none: 'Fără test',
  pending: 'De susținut',
  passed: 'Promovat',
  annual_due: 'Anual scadent',
};

/** One domain's test standing, computed and never stored (ADR 024). */
export const testStatusSchema = z.object({
  // Null for a leaver.
  state: testStateSchema.nullable(),
  // The test that awaits the employee: the hiring test while pending, the annual one once due.
  awaitingTest: knowledgeTestSchema.nullable(),
  lastPassedOn: z.iso.date().nullable(),
  // Fire safety only: twelve months after the last pass.
  dueOn: z.iso.date().nullable(),
});

export type TestStatus = z.infer<typeof testStatusSchema>;

export const employeeTestsSchema = z.object({
  ssm: testStatusSchema,
  psi: testStatusSchema,
});

export type EmployeeTests = z.infer<typeof employeeTestsSchema>;
