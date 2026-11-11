import { apiErrorResponseSchema } from '@ssm-usor/contracts';

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

const impersonationRefused =
  'or is a platform admin impersonating a member, who neither signs nor sends an email or SMS in their name (reason `impersonation_refused`)';

export const inPersonMembershipErrors = {
  ...authErrors,
  403: {
    description: `The account is not a member of an organization, ${impersonationRefused}`,
    content: errorContent,
  },
} as const;

export const inPersonOwnerErrors = {
  ...authErrors,
  403: {
    description: `The account is not an owner of an organization, ${impersonationRefused}`,
    content: errorContent,
  },
} as const;

export const bearerSecurity = [{ bearerAuth: [] }];

export const openApiConfig = {
  openapi: '3.0.3',
  info: { title: 'SSM Ușor API', version: '0.3.0' },
};
