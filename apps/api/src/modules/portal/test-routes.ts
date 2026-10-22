import { createRoute, z } from '@hono/zod-openapi';
import {
  fileLinkResponseSchema,
  knowledgeTestSchema,
  portalTestsResponseSchema,
  testAttemptAnswerRequestSchema,
  testAttemptOutcomeSchema,
  testAttemptResponseSchema,
  testSittingSize,
  testStudyCardSchema,
  trainingDomainSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { authErrors, bearerSecurity, errorContent } from '../../lib/openapi';
import { requireParticipant } from '../../lib/participant';

const tags = ['portal'];

const participantParams = z.object({ participantId: z.uuid() });
const testParams = participantParams.extend({
  domain: trainingDomainSchema,
  test: knowledgeTestSchema,
});
const attemptParams = participantParams.extend({ attemptId: z.uuid() });
const answerParams = attemptParams.extend({
  // A string of digits: a coerced number would be described as an optional, nullable parameter.
  questionIndex: z
    .string()
    .regex(/^[0-9]+$/)
    .refine((index) => Number(index) < testSittingSize, {
      message: `A sitting holds ${testSittingSize} questions.`,
    }),
});

const ownErrors = {
  ...authErrors,
  403: { description: 'The account is not a participant of any client', content: errorContent },
  404: {
    description:
      "The participation is not the account's, or it is a client administrator's who is not an employee",
    content: errorContent,
  },
} as const;

const attemptErrors = {
  ...ownErrors,
  404: {
    description: "The participation or the attempt is not the account's",
    content: errorContent,
  },
  409: {
    description: 'The attempt is finished (reason `attempt_finished`)',
    content: errorContent,
  },
} as const;

const linkContent = {
  'application/json': { schema: fileLinkResponseSchema.meta({ id: 'FileLinkResponse' }) },
};

const attemptContent = {
  'application/json': { schema: testAttemptResponseSchema.meta({ id: 'TestAttemptResponse' }) },
};

export const getPortalTestsRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/tests',
  operationId: 'getPortalTests',
  tags,
  summary: "The participant's knowledge tests",
  description:
    'Per domain: the test state and the test that awaits, which _Acasă_ lists beside the signature requests; the results newest first; the finished attempts with their score, newest first; and the attempt in progress of the test that awaits, if any, as it was drawn and answered so far, without its key.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams },
  responses: {
    200: {
      description: 'The tests of both domains',
      content: {
        'application/json': {
          schema: portalTestsResponseSchema.meta({ id: 'PortalTestsResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    ...ownErrors,
  },
});

export const getPortalTestStudyCardRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/tests/{domain}/{test}/study-card',
  operationId: 'getPortalTestStudyCard',
  tags,
  summary: 'What to know before a test (_ce trebuie să știi_)',
  description:
    "The explanations of the test's active questions that have one, and the client's issued revision of the material the test closes, whose PDF `GET …/materials/{domain}` serves; `material` is null while none is issued.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: testParams },
  responses: {
    200: {
      description: 'The study card',
      content: {
        'application/json': { schema: testStudyCardSchema.meta({ id: 'TestStudyCard' }) },
      },
    },
    400: {
      description: 'Invalid path, or an annual occupational safety test',
      content: errorContent,
    },
    ...ownErrors,
  },
});

export const startPortalTestAttemptRoute = createRoute({
  method: 'post',
  path: '/portal/participants/{participantId}/tests/{domain}/{test}/attempts',
  operationId: 'startPortalTestAttempt',
  tags,
  summary: 'Start a test, or resume the attempt in progress',
  description:
    'Ten of the active questions drawn at random, each with its options shuffled. The attempt in progress is answered as it stands, so a dropped connection resumes where it stopped. The attempt records the issued material shown with the test, the client address and the user agent. Refused while the test does not await the employee (reason `test_not_awaiting`): the hiring test while it is pending, the annual test once it is due.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: testParams },
  responses: {
    200: { description: 'The attempt, without its key', content: attemptContent },
    400: {
      description: 'Invalid path, or an annual occupational safety test',
      content: errorContent,
    },
    ...ownErrors,
    409: {
      description:
        'The test does not await the employee (reason `test_not_awaiting`), the bank holds fewer than ten active questions (reason `test_below_minimum`), or the client is archived',
      content: errorContent,
    },
  },
});

export const answerPortalTestAttemptRoute = createRoute({
  method: 'put',
  path: '/portal/participants/{participantId}/test-attempts/{attemptId}/answers/{questionIndex}',
  operationId: 'answerPortalTestAttempt',
  tags,
  summary: 'Save the options chosen for one question',
  description:
    "`questionIndex` is the question's place in the attempt, from 0; `chosen` the indices of the options as shown, empty to leave it unanswered. Saved as it is given.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: {
    params: answerParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: testAttemptAnswerRequestSchema.meta({ id: 'TestAttemptAnswerRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The attempt with the answer', content: attemptContent },
    400: {
      description:
        'Invalid path or body, or a question or option the attempt does not have (reasons `question_out_of_range`, `option_out_of_range`)',
      content: errorContent,
    },
    ...attemptErrors,
  },
});

export const finishPortalTestAttemptRoute = createRoute({
  method: 'post',
  path: '/portal/participants/{participantId}/test-attempts/{attemptId}/finish',
  operationId: 'finishPortalTestAttempt',
  tags,
  summary: 'Finish an attempt and see the outcome',
  description:
    'A question counts when the options chosen are exactly the correct ones; seven of ten pass. A failed attempt lists each question answered wrong with its explanation, the correct option never marked, and the test can be taken again at once. A pass records the test result, the examiner proposed, and fills its row of the stored signed sheet.',
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: attemptParams },
  responses: {
    200: {
      description: 'The outcome',
      content: {
        'application/json': {
          schema: testAttemptOutcomeSchema.meta({ id: 'TestAttemptOutcome' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    ...attemptErrors,
  },
});

export const getPortalMaterialRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/materials/{domain}',
  operationId: 'getPortalMaterial',
  tags,
  summary: 'The material a test closes, as its issued PDF',
  description:
    "The newest issued revision of the client's general training material (`ssm`) or fire-safety own instructions (`psi`), the IPSU with its annexes. 404 with reason `material_not_issued` while there is none.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams.extend({ domain: trainingDomainSchema }) },
  responses: {
    200: {
      description: 'The PDF, named in `Content-Disposition`',
      content: {
        'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    ...authErrors,
    403: ownErrors[403],
    404: {
      description:
        "The participation is not the account's, or the material is not issued (reason `material_not_issued`)",
      content: errorContent,
    },
    503: { description: 'Storage is unavailable', content: errorContent },
  },
});

export const getPortalTestSheetRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/tests/results/{resultId}/sheet',
  operationId: 'getPortalTestSheet',
  tags,
  summary: "A result's test sheet as its stored PDF",
  description:
    "The test sheet of a pass in the portal (ADR 024), with the signatures given so far, shown inline: the employee's own, or for the client administrator any employee's of the client. A paper result has none (reason `test_sheet_not_available`).",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams.extend({ resultId: z.uuid() }) },
  responses: {
    200: {
      description: 'The PDF, named in `Content-Disposition`',
      content: {
        'application/pdf': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    ...authErrors,
    403: ownErrors[403],
    404: {
      description:
        "The participation is not the account's, the result is not one it reads, or the result has no test sheet (reason `test_sheet_not_available`)",
      content: errorContent,
    },
    503: {
      description:
        'The sheet could not be drawn up or read (reasons `pdf_unavailable`, `signer_unavailable`, `template_missing`)',
      content: errorContent,
    },
  },
});

export const getPortalMaterialLinkRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/materials/{domain}/link',
  operationId: 'getPortalMaterialLink',
  tags,
  summary: 'A short-lived link to the issued PDF of the material a test closes',
  description:
    "For a real link on the page, which the browser opens through `GET /files/download`: shown `inline`, the PDF opens in the browser's viewer, which the in-app browser of a mail client can do where it cannot download. The same material as `GET …/materials/{domain}`. Valid for ten minutes.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams.extend({ domain: trainingDomainSchema }) },
  responses: {
    200: { description: 'The link', content: linkContent },
    400: { description: 'Invalid path', content: errorContent },
    ...authErrors,
    403: ownErrors[403],
    404: {
      description:
        "The participation is not the account's, or the material is not issued (reason `material_not_issued`)",
      content: errorContent,
    },
    503: { description: 'Storage is unavailable', content: errorContent },
  },
});

export const getPortalTestSheetLinkRoute = createRoute({
  method: 'get',
  path: '/portal/participants/{participantId}/tests/results/{resultId}/sheet/link',
  operationId: 'getPortalTestSheetLink',
  tags,
  summary: "A short-lived link to a result's stored test sheet",
  description:
    "For a real link on the page, which the browser opens through `GET /files/download`, read as `GET …/tests/results/{resultId}/sheet` is. Only a stored sheet has one: a sheet the pass could not draw up answers 404 (reason `test_sheet_not_available`) and is drawn up by the PDF route. The link names the sheet's version at the time, with every signature given so far. Valid for ten minutes.",
  security: bearerSecurity,
  middleware: [requireAuth, requireParticipant] as const,
  request: { params: participantParams.extend({ resultId: z.uuid() }) },
  responses: {
    200: { description: 'The link', content: linkContent },
    400: { description: 'Invalid path', content: errorContent },
    ...authErrors,
    403: ownErrors[403],
    404: {
      description:
        "The participation is not the account's, the result is not one it reads, or the result has no stored test sheet (reason `test_sheet_not_available`)",
      content: errorContent,
    },
    503: { description: 'Storage is unavailable', content: errorContent },
  },
});
