import { createRoute, z } from '@hono/zod-openapi';
import {
  employeeTrainingRecordListResponseSchema,
  listEmployeeTrainingRecordsQuerySchema,
  listTrainingsQuerySchema,
  trainingListResponseSchema,
  trainingProposalQuerySchema,
  trainingProposalSchema,
  trainingRequestSchema,
  trainingResponseSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const trainingParams = clientParams.extend({ trainingId: z.uuid() });
const employeeParams = clientParams.extend({ employeeId: z.uuid() });

const noSuchClient = {
  description: 'The client does not exist in the organization',
  content: errorContent,
};
const noSuchTraining = {
  description: 'The client, or the training under it, does not exist',
  content: errorContent,
};
const refusedClient = {
  description: 'The client is archived (reason `client_archived`) or a lead (`client_is_lead`)',
  content: errorContent,
};
const refusedSigners = {
  description:
    'A signer who is neither a member of the organization nor an active participant of the client (reason `signer_not_of_client`, an issue on the slot), or a slot the record does not have (`slot_not_on_record`)',
  content: errorContent,
};
const invalidBody = {
  description:
    'Invalid path or body, a day after today, an attendee who is not an employee of this client (an issue on `employeeIds`), or a themes revision of another client (on `themesRevisionId`)',
  content: errorContent,
};
const trainingContent = {
  'application/json': { schema: trainingResponseSchema.meta({ id: 'TrainingResponse' }) },
};
const trainingBody = {
  required: true,
  content: {
    'application/json': { schema: trainingRequestSchema.meta({ id: 'TrainingRequest' }) },
  },
};

export const listTrainingsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/trainings',
  operationId: 'listTrainings',
  summary: "List a client's trainings held",
  description:
    'Every training held at the client, newest first, each with its number of attendees; not paginated. Filtered by domain and phase when given (ADR 021).',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, query: listTrainingsQuerySchema },
  responses: {
    200: {
      description: 'The trainings held',
      content: {
        'application/json': {
          schema: trainingListResponseSchema.meta({ id: 'TrainingListResponse' }),
        },
      },
    },
    400: { description: 'Invalid path or query', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const getTrainingProposalRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/trainings/proposal',
  operationId: 'getTrainingProposal',
  summary: 'Propose the facts of a training held from the plan',
  description:
    "The duration, the material, the trainer, the verifier and who admits to work, as the plan proposes them for the domain, the phase, the day and the job position (ADR 021): a periodic training takes the session of that month, else the last one before it, from the client's newest training themes revision of the domain, by position for occupational safety and by the position's staff category for fire safety; a hiring training the templates' plan, 240 or 480 minutes; a supplementary training 60 minutes and no material. Each value is null where nothing can be proposed.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, query: trainingProposalQuerySchema },
  responses: {
    200: {
      description: 'The proposal',
      content: {
        'application/json': { schema: trainingProposalSchema.meta({ id: 'TrainingProposal' }) },
      },
    },
    400: {
      description: 'Invalid path or query, or a job position of another client',
      content: errorContent,
    },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const createTrainingRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/trainings',
  operationId: 'createTraining',
  summary: 'Record a training held with its attendees',
  description:
    'Every attendee gets a training record carrying the name of their job position as the occupation. The attendees are employees of the client in any status, since a record typed from paper may belong to someone who has left. `admission`, "admis la lucru", is given to every attendee and only on a workplace training.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, body: trainingBody },
  responses: {
    201: { description: 'The training with its records', content: trainingContent },
    400: invalidBody,
    404: noSuchClient,
    409: refusedClient,
    422: refusedSigners,
    ...membershipErrors,
  },
});

export const getTrainingRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/trainings/{trainingId}',
  operationId: 'getTraining',
  summary: 'Read a training held with its records',
  description: "The records by the attendee's name.",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: trainingParams },
  responses: {
    200: { description: 'The training with its records', content: trainingContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchTraining,
    ...membershipErrors,
  },
});

export const updateTrainingRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/trainings/{trainingId}',
  operationId: 'updateTraining',
  summary: "Replace a training's facts and attendees",
  description:
    'An attendee who stays keeps their record and the occupation it printed; one who is left out loses theirs; a new one gets a record with the name of their current job position.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: trainingParams, body: trainingBody },
  responses: {
    200: { description: 'The training after the change', content: trainingContent },
    400: invalidBody,
    404: noSuchTraining,
    409: {
      description:
        'The client is archived (reason `client_archived`) or a lead (`client_is_lead`), or a record of the training carries a live electronic signature and a signed fact changed (`record_signed`)',
      content: errorContent,
    },
    422: refusedSigners,
    ...membershipErrors,
  },
});

export const deleteTrainingRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/trainings/{trainingId}',
  operationId: 'deleteTraining',
  summary: 'Delete a training held and its records',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: trainingParams },
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchTraining,
    409: refusedClient,
    ...membershipErrors,
  },
});

export const listEmployeeTrainingRecordsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/employees/{employeeId}/training-records',
  operationId: 'listEmployeeTrainingRecords',
  summary: "List an employee's training records",
  description:
    'Each record with the facts of its training held, newest first, of one domain when given.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: employeeParams, query: listEmployeeTrainingRecordsQuerySchema },
  responses: {
    200: {
      description: 'The training records',
      content: {
        'application/json': {
          schema: employeeTrainingRecordListResponseSchema.meta({
            id: 'EmployeeTrainingRecordListResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path or query', content: errorContent },
    404: {
      description: 'The employee does not exist under this client in the organization',
      content: errorContent,
    },
    ...membershipErrors,
  },
});
