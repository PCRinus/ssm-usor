import { createRoute } from '@hono/zod-openapi';
import { dashboardSummarySchema } from '@ssm-usor/contracts';

import { requireAuth } from '../../lib/auth';
import { requireMembership } from '../../lib/membership';
import { bearerSecurity, membershipErrors } from '../../lib/openapi';

export const getDashboardSummaryRoute = createRoute({
  method: 'get',
  path: '/dashboard/summary',
  operationId: 'getDashboardSummary',
  summary: "Get the dashboard's counts for the caller's organization",
  description:
    'Every count of the dashboard in one answer (ADR 027), computed on each request. `contracts` is null unless the caller is an owner.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: "The organization's counts",
      content: {
        'application/json': { schema: dashboardSummarySchema.meta({ id: 'DashboardSummary' }) },
      },
    },
    ...membershipErrors,
  },
});
