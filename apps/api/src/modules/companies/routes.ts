import { createRoute } from '@hono/zod-openapi';
import { companyLookupQuerySchema, companyLookupResponseSchema } from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireConfirmedEmailOrMembership } from '../../lib/membership';
import { authErrors, bearerSecurity, errorContent } from '../../lib/openapi';

export const lookupCompanyRoute = createRoute({
  method: 'get',
  path: '/companies/lookup',
  operationId: 'lookupCompany',
  summary: 'Look up public company data by CUI (ANAF)',
  description:
    'For members, and for an account with a confirmed email and no membership yet, whose onboarding looks up its own firm.',
  security: bearerSecurity,
  middleware: [requireAuth, requireConfirmedEmailOrMembership] as const,
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
    403: {
      description: 'The email is not confirmed and the account is not a member of an organization',
      content: errorContent,
    },
    ...authErrors,
  },
});
