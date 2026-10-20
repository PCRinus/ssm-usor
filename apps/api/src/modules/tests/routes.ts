import { createRoute, z } from '@hono/zod-openapi';
import {
  createTestQuestionRequestSchema,
  employeeTestsResponseSchema,
  paperTestResultRequestSchema,
  testBankQuerySchema,
  testBankResponseSchema,
  testQuestionResponseSchema,
  testResultResponseSchema,
  testSheetPaperSignatureRequestSchema,
  testSheetResponseSchema,
  updateTestQuestionRequestSchema,
  updateTestResultRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const questionParams = z.object({ questionId: z.uuid() });
const employeeParams = z.object({ clientId: z.uuid(), employeeId: z.uuid() });
const resultParams = employeeParams.extend({ resultId: z.uuid() });

const questionContent = {
  'application/json': {
    schema: testQuestionResponseSchema.meta({ id: 'TestQuestionResponse' }),
  },
};
const resultContent = {
  'application/json': { schema: testResultResponseSchema.meta({ id: 'TestResultResponse' }) },
};
const noSuchQuestion = {
  description: 'The question is neither a built-in nor one of the organization',
  content: errorContent,
};
const belowMinimum = {
  description:
    'The test would keep fewer than ten active questions (reason `test_below_minimum`): add before hiding',
  content: errorContent,
};
const noSuchEmployee = {
  description: 'The employee does not exist under this client',
  content: errorContent,
};

export const getTestBankRoute = createRoute({
  method: 'get',
  path: '/organization/tests/questions',
  operationId: 'getTestBank',
  summary: "The organization's question bank, by test",
  description:
    'Each knowledge test (ADR 024) with its code, its title, every question in the printed order, built-in and own, each flagged `builtIn` and `hidden`, and how many are active. The sitting size, the minimum of active questions and the pass mark are fixed for every organization and answered beside them. `domain` and `test` narrow the list.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: testBankQuerySchema },
  responses: {
    200: {
      description: 'The tests and their questions',
      content: {
        'application/json': { schema: testBankResponseSchema.meta({ id: 'TestBankResponse' }) },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});

export const createTestQuestionRoute = createRoute({
  method: 'post',
  path: '/organization/tests/questions',
  operationId: 'createTestQuestion',
  summary: 'Write an own question',
  description:
    "Two to four options, at least one correct, an optional explanation and citation. Without a `position` the question goes after the test's others. `replacesQuestionId` names the built-in of the same test it departs from, as provenance only (reason `question_not_built_in` otherwise).",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createTestQuestionRequestSchema.meta({ id: 'CreateTestQuestionRequest' }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The question', content: questionContent },
    400: { description: 'Invalid request body', content: errorContent },
    409: {
      description: 'The question it replaces is not a built-in of the same test',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateTestQuestionRoute = createRoute({
  method: 'patch',
  path: '/organization/tests/questions/{questionId}',
  operationId: 'updateTestQuestion',
  summary: 'Edit an own question',
  description:
    'A built-in question is edited by none (reason `question_built_in`): it is hidden and replaced by an own one. A question never moves to another test.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: questionParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateTestQuestionRequestSchema.meta({ id: 'UpdateTestQuestionRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The question after the change', content: questionContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchQuestion,
    409: {
      description:
        'The question is a built-in, or the one it replaces is not a built-in of the same test',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const deleteTestQuestionRoute = createRoute({
  method: 'delete',
  path: '/organization/tests/questions/{questionId}',
  operationId: 'deleteTestQuestion',
  summary: 'Delete an own question',
  description:
    'Refused for a built-in (reason `question_built_in`), which is hidden instead, and when the test would keep fewer than ten active questions (reason `test_below_minimum`). The attempts that drew it keep their copy.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: questionParams },
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchQuestion,
    409: belowMinimum,
    ...membershipErrors,
  },
});

export const hideTestQuestionRoute = createRoute({
  method: 'put',
  path: '/organization/tests/questions/{questionId}/hidden',
  operationId: 'hideTestQuestion',
  summary: 'Hide a built-in question from the tests',
  description:
    'Idempotent. Only a built-in is hidden (reason `question_not_built_in`); an own question is deleted. Refused when the test would keep fewer than ten active questions (reason `test_below_minimum`).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: questionParams },
  responses: {
    200: { description: 'The question, hidden', content: questionContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchQuestion,
    409: belowMinimum,
    ...membershipErrors,
  },
});

export const restoreTestQuestionRoute = createRoute({
  method: 'delete',
  path: '/organization/tests/questions/{questionId}/hidden',
  operationId: 'restoreTestQuestion',
  summary: 'Restore a hidden built-in question',
  description: 'Idempotent.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: questionParams },
  responses: {
    200: { description: 'The question, active again', content: questionContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchQuestion,
    ...membershipErrors,
  },
});

export const getEmployeeTestsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/tests',
  operationId: 'getEmployeeTests',
  summary: "An employee's knowledge tests",
  description:
    'Per domain: the test state and the test that awaits, the results newest first with their day, material, grade, examiner, source and attempt, and the attempts in the portal newest first with their score.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams },
  responses: {
    200: {
      description: 'The tests of both domains',
      content: {
        'application/json': {
          schema: employeeTestsResponseSchema.meta({ id: 'EmployeeTestsResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEmployee,
    ...membershipErrors,
  },
});

export const recordPaperTestResultRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/employees/{employeeId}/tests/results',
  operationId: 'recordPaperTestResult',
  summary: 'Record a pass of the printed test',
  description:
    "A test filled in on paper and passed: the day, the examiner and the grade, always `admis`; the material defaults to the test's name and code. A hiring result is taken while the hiring test awaits the employee (a hiring training recorded, no pass yet); an annual one once the employee has a fire-safety pass. Otherwise reason `test_not_awaiting`. The day is not in the future. The result fills its row of the employee's stored signed sheet.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: employeeParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: paperTestResultRequestSchema.meta({ id: 'PaperTestResultRequest' }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The result', content: resultContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchEmployee,
    409: {
      description:
        'The test does not await the employee (reason `test_not_awaiting`), or the client is archived (reason `client_archived`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateTestResultRoute = createRoute({
  method: 'patch',
  path: '/clients/{clientId}/employees/{employeeId}/tests/results/{resultId}',
  operationId: 'updateTestResult',
  summary: 'Correct the examiner of a result, or the day and material of a paper one',
  description:
    'A result from the portal changes only in its examiner (reason `result_from_attempt`). Its row on the stored signed sheet is filled again.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: resultParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateTestResultRequestSchema.meta({ id: 'UpdateTestResultRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The result after the change', content: resultContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: { description: 'The result does not exist for this employee', content: errorContent },
    409: {
      description:
        'A portal result changes only in its examiner (reason `result_from_attempt`); its examiner no longer changes once they signed the test sheet, electronically or on paper (reason `examiner_signed`); or the client is archived',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

const pdfContent = {
  'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
};

const noTestSheet = {
  description:
    'The result does not exist for this employee, or it has no test sheet (reason `test_sheet_not_available`)',
  content: errorContent,
};

const sheetUnavailable = {
  description:
    'The sheet could not be drawn up: the converter, the signer or the template is unavailable (reasons `pdf_unavailable`, `signer_unavailable`, `template_missing`)',
  content: errorContent,
};

export const getTestSheetRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/tests/results/{resultId}/sheet',
  operationId: 'getTestSheet',
  summary: "A result's test sheet as its stored PDF",
  description:
    'The test sheet of a pass in the portal (ADR 024): the questions as the sitting showed them, the answers chosen, the score, the grade and the two signature fields, with every signature given so far. Drawn up and stored at the pass; drawn up here, with its requests, when that failed. Shown inline. A paper result has none.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: resultParams },
  responses: {
    200: { description: 'The PDF, named in `Content-Disposition`', content: pdfContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noTestSheet,
    ...membershipErrors,
    503: sheetUnavailable,
  },
});

export const markTestSheetPaperSignatureRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/employees/{employeeId}/tests/results/{resultId}/sheet/paper-signatures',
  operationId: 'markTestSheetPaperSignature',
  summary: 'Mark a slot of a test sheet as signed on paper',
  description:
    "For a slot whose person has no account, or who signed the printed sheet: the trainee, whom the evidence names as the employee, or the examiner, named as the result's. A pending request of the slot is voided (`signed_on_paper`). A paper examiner fixes the result's examiner, as an electronic one does.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: resultParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: testSheetPaperSignatureRequestSchema.meta({
            id: 'TestSheetPaperSignatureRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The test sheet's slots after the mark",
      content: {
        'application/json': { schema: testSheetResponseSchema.meta({ id: 'TestSheetResponse' }) },
      },
    },
    400: {
      description:
        'Invalid path or body, or the result names no examiner (reason `examiner_required`)',
      content: errorContent,
    },
    404: noTestSheet,
    409: {
      description: 'The slot is signed already (reason `slot_signed`), or the client is archived',
      content: errorContent,
    },
    ...membershipErrors,
    503: sheetUnavailable,
  },
});
