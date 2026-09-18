import { createRoute } from '@hono/zod-openapi';
import {
  waitlistConfirmQuerySchema,
  waitlistSubscribeRequestSchema,
  waitlistSubscribeResponseSchema,
} from '@ssm-usor/contracts';

import { errorContent, publicErrors } from '../../lib/openapi';

export const subscribeToWaitlistRoute = createRoute({
  method: 'post',
  path: '/waitlist',
  operationId: 'subscribeToWaitlist',
  summary: 'Ask to be told when accounts open',
  description:
    'Public. Stores the address as pending and emails a confirmation link. The response is the same whether or not the address was already known.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: waitlistSubscribeRequestSchema.meta({ id: 'WaitlistSubscribeRequest' }),
        },
      },
    },
  },
  responses: {
    202: {
      description: 'A confirmation email is on its way, unless one was sent recently',
      content: {
        'application/json': {
          schema: waitlistSubscribeResponseSchema.meta({ id: 'WaitlistSubscribeResponse' }),
        },
      },
    },
    400: { description: 'Invalid body or failed Turnstile check', content: errorContent },
    503: { description: 'A dependency is temporarily unavailable', content: errorContent },
    ...publicErrors,
  },
});

export const confirmWaitlistRoute = createRoute({
  method: 'get',
  path: '/waitlist/confirm',
  operationId: 'confirmWaitlistSubscription',
  summary: 'Confirm a waitlist subscription from the emailed link',
  description: 'Opened in a browser. Always redirects to a page on the marketing site.',
  request: { query: waitlistConfirmQuerySchema.meta({ id: 'WaitlistConfirmQuery' }) },
  responses: {
    303: { description: 'Redirect to the confirmed or the invalid-link page' },
  },
});
