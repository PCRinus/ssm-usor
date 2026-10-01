import { createRoute, z } from '@hono/zod-openapi';
import {
  copyRiskFactorsRequestSchema,
  createRiskEvaluationRequestSchema,
  jobPositionRiskEvaluationResponseSchema,
  riskEvaluationListResponseSchema,
  riskEvaluationResponseSchema,
  riskFactorOrderRequestSchema,
  riskFactorRequestSchema,
  riskFactorSuggestionsQuerySchema,
  riskFactorSuggestionsResponseSchema,
  updateRiskEvaluationRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const evaluationParams = clientParams.extend({ evaluationId: z.uuid() });
const factorParams = evaluationParams.extend({ factorId: z.uuid() });
const positionParams = clientParams.extend({ jobPositionId: z.uuid() });

const noSuchClient = {
  description: 'The client does not exist in this organization',
  content: errorContent,
};
const noSuchEvaluation = {
  description: 'The evaluation does not exist under this client',
  content: errorContent,
};
const noSuchFactor = {
  description: 'The evaluation does not exist under this client, or the factor on it',
  content: errorContent,
};
const archivedClient = {
  description: 'The client is archived (reason `client_archived`)',
  content: errorContent,
};
const evaluationContent = {
  'application/json': {
    schema: riskEvaluationResponseSchema.meta({ id: 'RiskEvaluationResponse' }),
  },
};
const factorBody = {
  required: true,
  content: {
    'application/json': { schema: riskFactorRequestSchema.meta({ id: 'RiskFactorRequest' }) },
  },
};

export const listRiskEvaluationsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/risk-evaluations',
  operationId: 'listRiskEvaluations',
  summary: "List a client's risk evaluations",
  description:
    'Every evaluation of the client without its factors: those of its positions in the order of the positions, then the sensitive groups, then the other ones by name. Evaluations of archived positions are left out. Each carries `factorCount`, `unacceptableFactorCount` and `globalRiskLevel` (ADR 015).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The evaluations',
      content: {
        'application/json': {
          schema: riskEvaluationListResponseSchema.meta({ id: 'RiskEvaluationListResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const createRiskEvaluationRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/risk-evaluations',
  operationId: 'createRiskEvaluation',
  summary: 'Start a risk evaluation',
  description:
    'For one of the client’s positions (`kind: job_position`), for its sensitive groups, or for another named work system (`kind: other`). A position and the sensitive groups have one evaluation at most (reason `risk_evaluation_exists`); two other evaluations of a client differ in name (reason `risk_evaluation_name_taken`). `exposure` defaults to "8 h / schimb".',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createRiskEvaluationRequestSchema.meta({ id: 'CreateRiskEvaluationRequest' }),
        },
      },
    },
  },
  responses: {
    201: { description: 'The evaluation, without factors', content: evaluationContent },
    400: {
      description: 'Invalid path or body, or the position is not a current one of this client',
      content: errorContent,
    },
    404: noSuchClient,
    409: {
      description:
        'The client is archived or a lead, the position or the sensitive groups are evaluated already, or the name is taken',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const getRiskEvaluationRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}',
  operationId: 'getRiskEvaluation',
  summary: 'Read a risk evaluation with its factors',
  description:
    'The factors in their order, each with its `riskLevel` from the method’s grid and its prevention measures in their order, and the evaluation’s `globalRiskLevel`, null without factors.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: evaluationParams },
  responses: {
    200: { description: 'The evaluation', content: evaluationContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEvaluation,
    ...membershipErrors,
  },
});

export const getJobPositionRiskEvaluationRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/job-positions/{jobPositionId}/risk-evaluation',
  operationId: 'getJobPositionRiskEvaluation',
  summary: "Read a job position's risk evaluation",
  description:
    'The same as reading the evaluation by its id; `evaluation` is null until one is started.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: positionParams },
  responses: {
    200: {
      description: 'The evaluation, or null',
      content: {
        'application/json': {
          schema: jobPositionRiskEvaluationResponseSchema.meta({
            id: 'JobPositionRiskEvaluationResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: {
      description: 'The job position does not exist under this client, or is archived',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateRiskEvaluationRoute = createRoute({
  method: 'patch',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}',
  operationId: 'updateRiskEvaluation',
  summary: 'Change what a risk evaluation says about its work system',
  description:
    'A field left out stays as it is; `null` clears `meansOfProduction` or `workEnvironment`. Only an evaluation of kind `other` takes a `name`.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: evaluationParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateRiskEvaluationRequestSchema.meta({ id: 'UpdateRiskEvaluationRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The evaluation after the change', content: evaluationContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchEvaluation,
    409: {
      description:
        'The client is archived, or the name is taken (reason `risk_evaluation_name_taken`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const removeRiskEvaluationRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}',
  operationId: 'removeRiskEvaluation',
  summary: 'Delete a risk evaluation with its factors',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: evaluationParams },
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchEvaluation,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const createRiskFactorRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}/factors',
  operationId: 'createRiskFactor',
  summary: 'Add a risk factor to an evaluation',
  description:
    'The factor goes after the others, with its prevention measures in the order sent. Answers with the whole evaluation, since the global level changes with every factor.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: evaluationParams, body: factorBody },
  responses: {
    201: { description: 'The evaluation after the change', content: evaluationContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchEvaluation,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const updateRiskFactorRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}/factors/{factorId}',
  operationId: 'updateRiskFactor',
  summary: 'Replace a risk factor and its prevention measures',
  description: 'The factor keeps its place. Answers with the whole evaluation.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: factorParams, body: factorBody },
  responses: {
    200: { description: 'The evaluation after the change', content: evaluationContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchFactor,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const removeRiskFactorRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}/factors/{factorId}',
  operationId: 'removeRiskFactor',
  summary: 'Remove a risk factor',
  description: 'Answers with the whole evaluation.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: factorParams },
  responses: {
    200: { description: 'The evaluation after the change', content: evaluationContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchFactor,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const reorderRiskFactorsRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}/factor-order',
  operationId: 'reorderRiskFactors',
  summary: "Reorder an evaluation's risk factors",
  description:
    '`factorIds` names every factor of the evaluation once, in the new order; anything else answers `400` on `factorIds`.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: evaluationParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: riskFactorOrderRequestSchema.meta({ id: 'RiskFactorOrderRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The evaluation after the change', content: evaluationContent },
    400: { description: 'Invalid path or body, or not every factor once', content: errorContent },
    404: noSuchEvaluation,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const copyRiskFactorsRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}/factors/copy',
  operationId: 'copyRiskFactors',
  summary: 'Copy the factors of another evaluation of the client',
  description:
    'Adds copies of the factors of `fromEvaluationId`, with their classes, measures and plan fields, after the factors the evaluation already has.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: evaluationParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: copyRiskFactorsRequestSchema.meta({ id: 'CopyRiskFactorsRequest' }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The evaluation after the copy', content: evaluationContent },
    400: {
      description:
        'Invalid path or body, or the source is the evaluation itself or not one of this client',
      content: errorContent,
    },
    404: noSuchEvaluation,
    409: archivedClient,
    ...membershipErrors,
  },
});

export const riskFactorSuggestionsRoute = createRoute({
  method: 'get',
  path: '/risk-factor-suggestions',
  operationId: 'listRiskFactorSuggestions',
  summary: 'Groups or plan fields typed before, for autocomplete',
  description:
    'The distinct values of `field` across the organization’s risk factors that contain `query`, most recently used first, at most twenty.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { query: riskFactorSuggestionsQuerySchema },
  responses: {
    200: {
      description: 'The suggestions',
      content: {
        'application/json': {
          schema: riskFactorSuggestionsResponseSchema.meta({ id: 'RiskFactorSuggestionsResponse' }),
        },
      },
    },
    400: { description: 'Invalid query', content: errorContent },
    ...membershipErrors,
  },
});
