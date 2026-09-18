import { apiErrorResponseSchema } from '@ssm-usor/contracts';

// Shared OpenAPI building blocks for module route definitions.

export const errorContent = {
  'application/json': { schema: apiErrorResponseSchema.meta({ id: 'ApiErrorResponse' }) },
};

export const publicErrors = {
  500: { description: 'Unexpected API error', content: errorContent },
} as const;

export const authErrors = {
  401: { description: 'A valid user access token is required', content: errorContent },
  503: { description: 'A dependency is temporarily unavailable', content: errorContent },
  500: { description: 'Unexpected API error', content: errorContent },
} as const;

export const membershipErrors = {
  ...authErrors,
  403: { description: 'The account is not a member of an organization', content: errorContent },
} as const;

export const ownerErrors = {
  ...authErrors,
  403: { description: 'The account is not an owner of an organization', content: errorContent },
} as const;

export const bearerSecurity = [{ bearerAuth: [] }];

export const openApiConfig = {
  openapi: '3.0.3',
  info: { title: 'SSM Ușor API', version: '0.3.0' },
};
