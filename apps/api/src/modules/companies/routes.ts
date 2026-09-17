import { createRoute } from '@hono/zod-openapi';
import { companyLookupQuerySchema, companyLookupResponseSchema } from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors } from '../../lib/openapi';

export const lookupCompanyRoute = createRoute({
  method: 'get',
  path: '/companies/lookup',
  operationId: 'lookupCompany',
  summary: 'Look up public company data by CUI (ANAF)',
  security: bearerSecurity,
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
