import { z } from 'zod';

import { signatureSlotStateSchema } from './signature-slot-states';
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
  mistakes: z.array(
    z.object({
      // The question's index in the attempt, from 0.
      index: z.int().min(0),
      text: z.string(),
      explanation: z.string().nullable(),
    })
  ),
});

export type TestAttemptOutcome = z.infer<typeof testAttemptOutcomeSchema>;

/** The question is the path's index into the attempt's questions, from 0. */
export const testAttemptAnswerRequestSchema = z.object({
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

export const testStates = ['none', 'pending', 'unverified', 'passed', 'annual_due'] as const;
export const testStateSchema = z.enum(testStates);
export type TestState = z.infer<typeof testStateSchema>;

export const testStateLabels: Record<TestState, string> = {
  none: 'Fără test',
  pending: 'De susținut',
  unverified: 'Neverificat pe fișă',
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

/** "La zi" for tests: passed in both domains; any other state in either. */
export const testStateFilters = ['passed', 'pending', 'annual_due', 'unverified', 'none'] as const;
export const testStateFilterSchema = z.enum(testStateFilters);
export type TestStateFilter = z.infer<typeof testStateFilterSchema>;

export const knowledgeTestTitles = {
  ssm: { hiring: 'Test de verificare a cunoștințelor la angajare (TASSM)' },
  psi: {
    hiring: 'Test de verificare a cunoștințelor la angajare (TASU)',
    annual: 'Test de verificare a cunoștințelor anual (TPSU)',
  },
} as const;

export const knowledgeTestCodeOf = (domain: TrainingDomain, test: KnowledgeTest): string =>
  (knowledgeTestCodes[domain] as Record<string, string>)[test]!;

export const knowledgeTestTitleOf = (domain: TrainingDomain, test: KnowledgeTest): string =>
  (knowledgeTestTitles[domain] as Record<string, string>)[test]!;

export const testBankQuerySchema = z
  .object({ domain: trainingDomainSchema.optional(), test: knowledgeTestSchema.optional() })
  .superRefine((value, ctx) => {
    if (value.domain && value.test)
      testOnItsDomain({ domain: value.domain, test: value.test }, ctx);
  });

export type TestBankQuery = z.infer<typeof testBankQuerySchema>;

export const testBankTestSchema = z.object({
  domain: trainingDomainSchema,
  test: knowledgeTestSchema,
  code: z.string(),
  title: z.string(),
  // Built-ins not hidden and own questions: what a sitting draws from and the printed test prints.
  activeCount: z.int().min(0),
  // In the printed order, hidden built-ins included.
  questions: z.array(testQuestionSchema),
});

export type TestBankTest = z.infer<typeof testBankTestSchema>;

export const testBankResponseSchema = z.object({
  sittingSize: z.int(),
  minimumActiveQuestions: z.int(),
  passMarkPercent: z.int(),
  tests: z.array(testBankTestSchema),
});

export type TestBankResponse = z.infer<typeof testBankResponseSchema>;

export const testQuestionResponseSchema = z.object({ question: testQuestionSchema });

export type TestQuestionResponse = z.infer<typeof testQuestionResponseSchema>;

export const testResultResponseSchema = z.object({ result: testResultSchema });

export type TestResultResponse = z.infer<typeof testResultResponseSchema>;

export const testAttemptSummarySchema = z.object({
  id: z.uuid(),
  domain: trainingDomainSchema,
  test: knowledgeTestSchema,
  startedAt: z.iso.datetime({ offset: true }),
  // The last three are null while the attempt is in progress.
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  score: z.int().min(0).nullable(),
  total: z.int().min(1),
  passed: z.boolean().nullable(),
});

export type TestAttemptSummary = z.infer<typeof testAttemptSummarySchema>;

/**
 * The test sheet of a result (ADR 024): `available` once a portal pass has its stored PDF, never
 * for a paper result, whose test was signed on the printed test; the state of each of its two
 * slots as the record slots have them, `unassigned` while there is no sheet.
 */
export const testSheetSummarySchema = z.object({
  available: z.boolean(),
  signed: z.object({ trainee: signatureSlotStateSchema, examiner: signatureSlotStateSchema }),
});

export type TestSheetSummary = z.infer<typeof testSheetSummarySchema>;

export const employeeTestResultSchema = testResultSchema.extend({ sheet: testSheetSummarySchema });

export type EmployeeTestResult = z.infer<typeof employeeTestResultSchema>;

export const testSheetPaperSignatureRequestSchema = z.object({
  slot: z.enum(['trainee', 'examiner']),
});

export type TestSheetPaperSignatureRequest = z.infer<typeof testSheetPaperSignatureRequestSchema>;

export const testSheetResponseSchema = z.object({
  resultId: z.uuid(),
  sheet: testSheetSummarySchema,
});

export type TestSheetResponse = z.infer<typeof testSheetResponseSchema>;

export const employeeDomainTestsSchema = z.object({
  status: testStatusSchema,
  // Newest first.
  results: z.array(employeeTestResultSchema),
  attempts: z.array(testAttemptSummarySchema),
});

export type EmployeeDomainTests = z.infer<typeof employeeDomainTestsSchema>;

export const employeeTestsResponseSchema = z.object({
  ssm: employeeDomainTestsSchema,
  psi: employeeDomainTestsSchema,
});

export type EmployeeTestsResponse = z.infer<typeof employeeTestsResponseSchema>;

/** `attempts` holds the finished ones; the one in progress comes apart, without its key. */
export const portalDomainTestsSchema = employeeDomainTestsSchema.extend({
  inProgress: testAttemptSchema.nullable(),
});

export type PortalDomainTests = z.infer<typeof portalDomainTestsSchema>;

export const portalTestsResponseSchema = z.object({
  ssm: portalDomainTestsSchema,
  psi: portalDomainTestsSchema,
});

export type PortalTestsResponse = z.infer<typeof portalTestsResponseSchema>;

/** The material a test closes (ADR 024): 2.2 for occupational safety, the IPSU for fire safety. */
export const portalMaterialTypeKeys: Record<TrainingDomain, string> = {
  ssm: 'general_training_material',
  psi: 'fire_own_instructions',
};

export const testStudyCardSchema = z.object({
  explanations: z.array(z.string()),
  // The newest issued revision of the material; null while the client has none issued.
  material: z
    .object({ revisionId: z.uuid(), title: z.string(), issuedAt: z.iso.datetime({ offset: true }) })
    .nullable(),
});

export type TestStudyCard = z.infer<typeof testStudyCardSchema>;

export const testAttemptResponseSchema = z.object({ attempt: testAttemptSchema });

export type TestAttemptResponse = z.infer<typeof testAttemptResponseSchema>;

/** The `reason` of the API's refusals on the tests, for the app and the portal to word. */
export const testErrorReasons = {
  belowMinimum: 'test_below_minimum',
  notBuiltIn: 'question_not_built_in',
  builtIn: 'question_built_in',
  attemptFinished: 'attempt_finished',
  questionOutOfRange: 'question_out_of_range',
  optionOutOfRange: 'option_out_of_range',
  notAwaiting: 'test_not_awaiting',
  resultFromAttempt: 'result_from_attempt',
  materialNotIssued: 'material_not_issued',
  // The examiner has signed the test sheet, on paper or electronically: the result's stays.
  examinerSigned: 'examiner_signed',
  testSheetNotAvailable: 'test_sheet_not_available',
} as const;
