import { createRoute, z } from '@hono/zod-openapi';
import {
  applyEvaluationProfileRequestSchema,
  applyEvaluationProfileResponseSchema,
  evaluationProfileListResponseSchema,
  evaluationProfileNameRequestSchema,
  evaluationProfileResponseSchema,
  riskFactorRequestSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const profileParams = z.object({ profileId: z.uuid() });
const factorParams = profileParams.extend({ factorId: z.uuid() });
const evaluationParams = z.object({ clientId: z.uuid(), evaluationId: z.uuid() });

const noSuchProfile = {
  description: 'The profile does not exist in this organization',
  content: errorContent,
};
const noSuchFactor = {
  description: 'The profile does not exist in this organization, or the factor on it',
  content: errorContent,
};
const nameTaken = {
  description: 'The library has a profile of this name (reason `evaluation_profile_name_taken`)',
  content: errorContent,
};
const profileContent = {
  'application/json': {
    schema: evaluationProfileResponseSchema.meta({ id: 'EvaluationProfileResponse' }),
  },
};
const nameBody = {
  required: true,
  content: {
    'application/json': {
      schema: evaluationProfileNameRequestSchema.meta({ id: 'EvaluationProfileNameRequest' }),
    },
  },
};
const factorBody = {
  required: true,
  content: {
    'application/json': { schema: riskFactorRequestSchema.meta({ id: 'RiskFactorRequest' }) },
  },
};

export const listEvaluationProfilesRoute = createRoute({
  method: 'get',
  path: '/evaluation-profiles',
  operationId: 'listEvaluationProfiles',
  summary: "List the organization's evaluation profiles",
  description:
    'The risk library (ADR 015) by name, each profile without its factors but with `factorCount`, `unacceptableFactorCount` and `globalRiskLevel`.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'The profiles',
      content: {
        'application/json': {
          schema: evaluationProfileListResponseSchema.meta({
            id: 'EvaluationProfileListResponse',
          }),
        },
      },
    },
    ...membershipErrors,
  },
});

export const createEvaluationProfileRoute = createRoute({
  method: 'post',
  path: '/evaluation-profiles',
  operationId: 'createEvaluationProfile',
  summary: 'Start an empty evaluation profile',
  description:
    'Two profiles of the organization differ in more than case and the spaces around the name.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { body: nameBody },
  responses: {
    201: { description: 'The profile, without factors', content: profileContent },
    400: { description: 'Invalid body', content: errorContent },
    409: nameTaken,
    ...membershipErrors,
  },
});

export const getEvaluationProfileRoute = createRoute({
  method: 'get',
  path: '/evaluation-profiles/{profileId}',
  operationId: 'getEvaluationProfile',
  summary: 'Read an evaluation profile with its factors',
  description:
    'The factors in their order, each with its `riskLevel` from the method’s grid and its prevention measures, and the profile’s `globalRiskLevel`, null without factors.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: profileParams },
  responses: {
    200: { description: 'The profile', content: profileContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchProfile,
    ...membershipErrors,
  },
});

export const renameEvaluationProfileRoute = createRoute({
  method: 'patch',
  path: '/evaluation-profiles/{profileId}',
  operationId: 'renameEvaluationProfile',
  summary: 'Rename an evaluation profile',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: profileParams, body: nameBody },
  responses: {
    200: { description: 'The profile after the change', content: profileContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: noSuchProfile,
    409: nameTaken,
    ...membershipErrors,
  },
});

export const removeEvaluationProfileRoute = createRoute({
  method: 'delete',
  path: '/evaluation-profiles/{profileId}',
  operationId: 'removeEvaluationProfile',
  summary: 'Delete an evaluation profile with its factors',
  description:
    'The factors it gave evaluations stay in them: a copy is the client’s and never refers back to the profile.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: profileParams },
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchProfile,
    ...membershipErrors,
  },
});

export const createEvaluationProfileFactorRoute = createRoute({
  method: 'post',
  path: '/evaluation-profiles/{profileId}/factors',
  operationId: 'createEvaluationProfileFactor',
  summary: 'Add a risk factor to a profile',
  description:
    'The same body as a factor of an evaluation. The factor goes after the others, with its prevention measures in the order sent. Answers with the whole profile.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: profileParams, body: factorBody },
  responses: {
    201: { description: 'The profile after the change', content: profileContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchProfile,
    ...membershipErrors,
  },
});

export const updateEvaluationProfileFactorRoute = createRoute({
  method: 'put',
  path: '/evaluation-profiles/{profileId}/factors/{factorId}',
  operationId: 'updateEvaluationProfileFactor',
  summary: "Replace a profile's risk factor and its prevention measures",
  description:
    'The factor keeps its place. Copies already made in evaluations stay as they are. Answers with the whole profile.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: factorParams, body: factorBody },
  responses: {
    200: { description: 'The profile after the change', content: profileContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchFactor,
    ...membershipErrors,
  },
});

export const removeEvaluationProfileFactorRoute = createRoute({
  method: 'delete',
  path: '/evaluation-profiles/{profileId}/factors/{factorId}',
  operationId: 'removeEvaluationProfileFactor',
  summary: "Remove a profile's risk factor",
  description: 'Answers with the whole profile.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: factorParams },
  responses: {
    200: { description: 'The profile after the change', content: profileContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchFactor,
    ...membershipErrors,
  },
});

export const saveRiskEvaluationAsProfileRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}/save-as-profile',
  operationId: 'saveRiskEvaluationAsProfile',
  summary: 'Save a risk evaluation as a profile of the library',
  description:
    'A new profile named `name` with copies of the evaluation’s factors, their classes, measures and plan fields, in their order. The work system texts stay with the evaluation. An archived client’s evaluation can be saved too.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: evaluationParams, body: nameBody },
  responses: {
    201: { description: 'The new profile', content: profileContent },
    400: { description: 'Invalid path or body', content: errorContent },
    404: {
      description: 'The evaluation does not exist under this client',
      content: errorContent,
    },
    409: nameTaken,
    ...membershipErrors,
  },
});

export const applyEvaluationProfileRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/risk-evaluations/{evaluationId}/factors/apply-profile',
  operationId: 'applyEvaluationProfile',
  summary: 'Copy the factors of a profile into a risk evaluation',
  description:
    'Adds copies of the profile’s factors, with their classes, measures and plan fields, after the factors the evaluation already has. `addedFactorCount` says how many. Later changes to the profile do not reach the copies.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: evaluationParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: applyEvaluationProfileRequestSchema.meta({
            id: 'ApplyEvaluationProfileRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'The evaluation after the copy',
      content: {
        'application/json': {
          schema: applyEvaluationProfileResponseSchema.meta({
            id: 'ApplyEvaluationProfileResponse',
          }),
        },
      },
    },
    400: {
      description: 'Invalid path or body, or the profile is not one of the library',
      content: errorContent,
    },
    404: {
      description: 'The evaluation does not exist under this client',
      content: errorContent,
    },
    409: {
      description: 'The client is archived (reason `client_archived`)',
      content: errorContent,
    },
    ...membershipErrors,
  },
});
