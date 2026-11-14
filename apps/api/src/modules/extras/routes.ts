import { createRoute, z } from '@hono/zod-openapi';
import { billingExtrasSchema, extraKindSchema, setExtraRequestSchema } from '@ssm-usor/contracts';

import { allowWhileReadOnly } from '../../lib/access';
import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwnerInPerson } from '../../lib/membership';
import { bearerSecurity, errorContent, ownerErrors } from '../../lib/openapi';

export const setExtraRoute = createRoute({
  method: 'put',
  path: '/billing/extras/{kind}',
  operationId: 'setBillingExtra',
  summary: 'Turn an extra on with a monthly ceiling, change the ceiling, or turn it off',
  description:
    'Past what the plan includes, signing codes go on by SMS at 0.10 € each (`sms`), or AI credits are bought in blocks of 100 at 1.50 € each (`credits`), up to the ceiling in whole euro, on the next invoice. A new ceiling or `null` applies at once; what was already used stays on the invoice. Only on a paid subscription in good standing; otherwise 409 `extras_unavailable`. The owner in person only.',
  security: bearerSecurity,
  // Off is how an owner stops a cost, which a read-only organization may still want.
  middleware: [requireAuth, allowWhileReadOnly, requireMembership, requireOwnerInPerson] as const,
  request: {
    params: z.object({ kind: extraKindSchema }),
    body: {
      required: true,
      content: {
        'application/json': { schema: setExtraRequestSchema.meta({ id: 'SetExtraRequest' }) },
      },
    },
  },
  responses: {
    200: {
      description: 'Both kinds of extras as they are now',
      content: {
        'application/json': { schema: billingExtrasSchema.meta({ id: 'BillingExtras' }) },
      },
    },
    400: { description: 'Invalid request body', content: errorContent },
    409: {
      description: 'Extras cannot be turned on for this subscription; see `reason`',
      content: errorContent,
    },
    ...ownerErrors,
    403: {
      description: 'The caller is not the owner, or is an admin impersonating one',
      content: errorContent,
    },
  },
});
