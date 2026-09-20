import { createRoute, z } from '@hono/zod-openapi';
import {
  clientDocumentDetailsResponseSchema,
  organizationContractDetailsResponseSchema,
  organizationLegalDetailsResponseSchema,
  responsiblePersonListResponseSchema,
  responsiblePersonRequestSchema,
  responsiblePersonResponseSchema,
  updateClientDocumentDetailsRequestSchema,
  updateOrganizationContractDetailsRequestSchema,
  updateOrganizationLegalDetailsRequestSchema,
  workplaceListResponseSchema,
  workplaceRequestSchema,
  workplaceResponseSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwner } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors, ownerErrors } from '../../lib/openapi';

const clientParams = z.object({ clientId: z.uuid() });
const workplaceParams = clientParams.extend({ workplaceId: z.uuid() });
const responsiblePersonParams = clientParams.extend({ responsiblePersonId: z.uuid() });

const noSuchClient = {
  description: 'The client does not exist in the organization',
  content: errorContent,
};

const legalDetailsContent = {
  'application/json': {
    schema: organizationLegalDetailsResponseSchema.meta({
      id: 'OrganizationLegalDetailsResponse',
    }),
  },
};
const documentDetailsContent = {
  'application/json': {
    schema: clientDocumentDetailsResponseSchema.meta({ id: 'ClientDocumentDetailsResponse' }),
  },
};
const workplaceContent = {
  'application/json': { schema: workplaceResponseSchema.meta({ id: 'WorkplaceResponse' }) },
};
const workplaceBody = {
  required: true,
  content: {
    'application/json': { schema: workplaceRequestSchema.meta({ id: 'WorkplaceRequest' }) },
  },
};
const responsiblePersonContent = {
  'application/json': {
    schema: responsiblePersonResponseSchema.meta({ id: 'ResponsiblePersonResponse' }),
  },
};
const responsiblePersonBody = {
  required: true,
  content: {
    'application/json': {
      schema: responsiblePersonRequestSchema.meta({ id: 'ResponsiblePersonRequest' }),
    },
  },
};

export const getOrganizationLegalDetailsRoute = createRoute({
  method: 'get',
  path: '/organization/legal-details',
  operationId: 'getOrganizationLegalDetails',
  summary: "Read the organization's legal details",
  description: 'What documents print about the provider. Any member reads them.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: { description: 'The legal details', content: legalDetailsContent },
    ...membershipErrors,
  },
});

export const updateOrganizationLegalDetailsRoute = createRoute({
  method: 'put',
  path: '/organization/legal-details',
  operationId: 'updateOrganizationLegalDetails',
  summary: "Replace the organization's legal details",
  description: 'Owners only. A field left out or null is cleared.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateOrganizationLegalDetailsRequestSchema.meta({
            id: 'UpdateOrganizationLegalDetailsRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The legal details after the change', content: legalDetailsContent },
    400: { description: 'Invalid request body', content: errorContent },
    ...ownerErrors,
  },
});

const contractDetailsContent = {
  'application/json': {
    schema: organizationContractDetailsResponseSchema.meta({
      id: 'OrganizationContractDetailsResponse',
    }),
  },
};

export const getOrganizationContractDetailsRoute = createRoute({
  method: 'get',
  path: '/organization/contract-details',
  operationId: 'getOrganizationContractDetails',
  summary: 'Read what a service contract prints about the organization',
  description:
    'Owners only, as service contracts are. The phone, the bank account, the certificate of authorization, whether the organization pays VAT, and the fire-safety technician. All optional; generating a contract is what asks for them.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  responses: {
    200: { description: 'The contract details', content: contractDetailsContent },
    ...ownerErrors,
  },
});

export const updateOrganizationContractDetailsRoute = createRoute({
  method: 'put',
  path: '/organization/contract-details',
  operationId: 'updateOrganizationContractDetails',
  summary: 'Replace what a service contract prints about the organization',
  description:
    'Owners only. A field left out or null is cleared. The IBAN is taken with or without spaces, checked, and stored without them.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership, requireOwner] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateOrganizationContractDetailsRequestSchema.meta({
            id: 'UpdateOrganizationContractDetailsRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The contract details after the change', content: contractDetailsContent },
    400: { description: 'Invalid request body', content: errorContent },
    ...ownerErrors,
  },
});

export const getClientDocumentDetailsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/document-details',
  operationId: 'getClientDocumentDetails',
  summary: "Read the representative's role and the training schedule of a client",
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: { description: 'The document details', content: documentDetailsContent },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const updateClientDocumentDetailsRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/document-details',
  operationId: 'updateClientDocumentDetails',
  summary: "Replace the representative's role and the training schedule of a client",
  description:
    'A field left out or null is cleared. The intervals are months between two periodic trainings; the first month and the days say when in the year they fall.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: {
    params: clientParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: updateClientDocumentDetailsRequestSchema.meta({
            id: 'UpdateClientDocumentDetailsRequest',
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The document details after the change', content: documentDetailsContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const listWorkplacesRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/workplaces',
  operationId: 'listWorkplaces',
  summary: "List a client's workplaces",
  description: 'The registered office first, then by name. Archived workplaces are not listed.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The workplaces',
      content: {
        'application/json': {
          schema: workplaceListResponseSchema.meta({ id: 'WorkplaceListResponse' }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const createWorkplaceRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/workplaces',
  operationId: 'createWorkplace',
  summary: 'Add a workplace to a client',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, body: workplaceBody },
  responses: {
    201: { description: 'The created workplace', content: workplaceContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: noSuchClient,
    409: {
      description: 'The client is archived, or it already has a registered office',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateWorkplaceRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/workplaces/{workplaceId}',
  operationId: 'updateWorkplace',
  summary: 'Replace a workplace',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: workplaceParams, body: workplaceBody },
  responses: {
    200: { description: 'The workplace after the change', content: workplaceContent },
    400: { description: 'Invalid path or request body', content: errorContent },
    404: { description: 'The workplace does not exist under this client', content: errorContent },
    409: { description: 'The client already has a registered office', content: errorContent },
    ...membershipErrors,
  },
});

export const archiveWorkplaceRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/workplaces/{workplaceId}',
  operationId: 'archiveWorkplace',
  summary: 'Archive a workplace',
  description: 'A soft delete: the row stays, and lists and documents leave it out.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: workplaceParams },
  responses: {
    204: { description: 'Archived' },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'The workplace does not exist under this client', content: errorContent },
    ...membershipErrors,
  },
});

export const listResponsiblePersonsRoute = createRoute({
  method: 'get',
  path: '/clients/{clientId}/responsible-persons',
  operationId: 'listResponsiblePersons',
  summary: 'List the people a client designates by decision',
  description: 'By name. Archived rows are not listed.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams },
  responses: {
    200: {
      description: 'The responsible persons',
      content: {
        'application/json': {
          schema: responsiblePersonListResponseSchema.meta({
            id: 'ResponsiblePersonListResponse',
          }),
        },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: noSuchClient,
    ...membershipErrors,
  },
});

export const createResponsiblePersonRoute = createRoute({
  method: 'post',
  path: '/clients/{clientId}/responsible-persons',
  operationId: 'createResponsiblePerson',
  summary: 'Add a responsible person to a client',
  description:
    'A name, a job title, and one or more roles. `employeeId` is optional: the administrator is often designated without being an employee.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: clientParams, body: responsiblePersonBody },
  responses: {
    201: { description: 'The created responsible person', content: responsiblePersonContent },
    400: {
      description: 'Invalid path or body, or an employee who is not of this client',
      content: errorContent,
    },
    404: noSuchClient,
    409: {
      description: 'The client is archived, or the employee is already a responsible person',
      content: errorContent,
    },
    ...membershipErrors,
  },
});

export const updateResponsiblePersonRoute = createRoute({
  method: 'put',
  path: '/clients/{clientId}/responsible-persons/{responsiblePersonId}',
  operationId: 'updateResponsiblePerson',
  summary: 'Replace a responsible person',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: responsiblePersonParams, body: responsiblePersonBody },
  responses: {
    200: {
      description: 'The responsible person after the change',
      content: responsiblePersonContent,
    },
    400: {
      description: 'Invalid path or body, or an employee who is not of this client',
      content: errorContent,
    },
    404: {
      description: 'The responsible person does not exist under this client',
      content: errorContent,
    },
    409: { description: 'The employee is already a responsible person', content: errorContent },
    ...membershipErrors,
  },
});

export const archiveResponsiblePersonRoute = createRoute({
  method: 'delete',
  path: '/clients/{clientId}/responsible-persons/{responsiblePersonId}',
  operationId: 'archiveResponsiblePerson',
  summary: 'Archive a responsible person',
  description: 'A soft delete: the row stays, and lists and documents leave it out.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  request: { params: responsiblePersonParams },
  responses: {
    204: { description: 'Archived' },
    400: { description: 'Invalid path', content: errorContent },
    404: {
      description: 'The responsible person does not exist under this client',
      content: errorContent,
    },
    ...membershipErrors,
  },
});
