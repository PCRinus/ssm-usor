import { createRoute } from '@hono/zod-openapi';
import {
  apiErrorResponseSchema,
  apiHealthSchema,
  clientListResponseSchema,
  clientResponseSchema,
  companyLookupQuerySchema,
  companyLookupResponseSchema,
  createClientRequestSchema,
  meResponseSchema,
} from '@ssm-usor/contracts';

import { requireAuth } from './auth';
import { requireMembership } from './membership';

const errorContent = {
  'application/json': { schema: apiErrorResponseSchema.meta({ id: 'ApiErrorResponse' }) },
};

const authErrors = {
  401: { description: 'A valid user access token is required', content: errorContent },
  503: { description: 'A dependency is temporarily unavailable', content: errorContent },
  500: { description: 'Unexpected API error', content: errorContent },
} as const;

const membershipErrors = {
  ...authErrors,
  403: { description: 'The account is not a member of an organization', content: errorContent },
} as const;

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  operationId: 'getHealth',
  summary: 'Check API availability',
  responses: {
    200: {
      description: 'API is running',
      content: { 'application/json': { schema: apiHealthSchema.meta({ id: 'ApiHealth' }) } },
    },
    500: { description: 'Unexpected API error', content: errorContent },
  },
});

export const meRoute = createRoute({
  method: 'get',
  path: '/me',
  operationId: 'getMe',
  summary: 'Get the authenticated user',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth] as const,
  responses: {
    200: {
      description: 'Verified user identity',
      content: { 'application/json': { schema: meResponseSchema.meta({ id: 'MeResponse' }) } },
    },
    ...authErrors,
  },
});

export const listClientsRoute = createRoute({
  method: 'get',
  path: '/clients',
  operationId: 'listClients',
  summary: "List the organization's active clients",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'Active clients ordered by legal name',
      content: {
        'application/json': {
          schema: clientListResponseSchema.meta({ id: 'ClientListResponse' }),
        },
      },
    },
    ...membershipErrors,
  },
});

export const createClientRoute = createRoute({
  method: 'post',
  path: '/clients',
  operationId: 'createClient',
  summary: 'Create a client in the organization',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth, requireMembership] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: createClientRequestSchema.meta({ id: 'CreateClientRequest' }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'The created client',
      content: {
        'application/json': { schema: clientResponseSchema.meta({ id: 'ClientResponse' }) },
      },
    },
    400: { description: 'Invalid request body', content: errorContent },
    409: { description: 'A client with this CUI already exists', content: errorContent },
    ...membershipErrors,
  },
});

export const lookupCompanyRoute = createRoute({
  method: 'get',
  path: '/companies/lookup',
  operationId: 'lookupCompany',
  summary: 'Look up public company data by CUI (ANAF)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth, requireMembership] as const,
  request: { query: companyLookupQuerySchema.meta({ id: 'CompanyLookupQuery' }) },
  responses: {
    200: {
      description: 'Public registry data to prefill a client',
      content: {
        'application/json': {
          schema: companyLookupResponseSchema.meta({ id: 'CompanyLookupResponse' }),
        },
      },
    },
    400: { description: 'Invalid CUI', content: errorContent },
    404: { description: 'No company registered with this CUI', content: errorContent },
    ...membershipErrors,
  },
});

export const openApiConfig = {
  openapi: '3.0.3',
  info: { title: 'SSM Ușor API', version: '0.2.0' },
};
