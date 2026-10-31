import { createRoute, z } from '@hono/zod-openapi';
import {
  billingCheckoutResponseSchema,
  billingChoiceSchema,
  billingInvoiceLinkSchema,
  billingOverviewSchema,
  billingPortalSessionSchema,
  billingPreviewSchema,
  cancelSubscriptionRequestSchema,
  changeSubscriptionRequestSchema,
  invoiceEmailSchema,
  smsCapRequestSchema,
  smsCapSchema,
} from '@ssm-usor/contracts';

import { allowWhileReadOnly } from '../../lib/access';
import { requireAuth } from '../../lib/auth';
import { requireMembership, requireOwnerInPerson } from '../../lib/membership';
import { bearerSecurity, errorContent, membershipErrors, ownerErrors } from '../../lib/openapi';

// Every billing route stays open while the organization is read-only: each one pays, ends a
// subscription or reads what was paid, which is how a read-only organization gets back.
const ownerMiddleware = [requireAuth, allowWhileReadOnly, requireMembership, requireOwnerInPerson];

const ownerOnlyErrors = {
  ...ownerErrors,
  403: {
    description: 'The caller is not the owner, or is an admin impersonating one',
    content: errorContent,
  },
} as const;

const choiceBody = {
  required: true,
  content: {
    'application/json': { schema: billingChoiceSchema.meta({ id: 'BillingChoice' }) },
  },
};

const conflictResponse = {
  409: {
    description:
      'The choice does not fit the organization, or the subscription is not in a state for it; see `reason`',
    content: errorContent,
  },
} as const;

const checkoutResponse = {
  description: 'What the Payment Element needs, if anything',
  content: {
    'application/json': {
      schema: billingCheckoutResponseSchema.meta({ id: 'BillingCheckoutResponse' }),
    },
  },
};

export const getBillingRoute = createRoute({
  method: 'get',
  path: '/billing',
  operationId: 'getBilling',
  summary: "The organization's subscription, usage and, for the owner, its payments",
  description:
    'Every member reads the plan, its status, the usage against the limits and the list prices. `owner` carries the next payment, the card, the email for invoices, a change waiting for the renewal and the invoices, for the owner in person only.',
  security: bearerSecurity,
  middleware: [requireAuth, requireMembership] as const,
  responses: {
    200: {
      description: 'The subscription tab',
      content: {
        'application/json': { schema: billingOverviewSchema.meta({ id: 'BillingOverview' }) },
      },
    },
    ...membershipErrors,
  },
});

export const previewBillingRoute = createRoute({
  method: 'post',
  path: '/billing/preview',
  operationId: 'previewBilling',
  summary: 'What a plan choice costs today and at the renewal',
  description:
    "Changes nothing. Prices a new subscription from the catalogue and a change of the current one with Stripe's prorations, and lists what keeps the choice out.",
  security: bearerSecurity,
  middleware: ownerMiddleware,
  request: { body: choiceBody },
  responses: {
    200: {
      description: 'The price of the choice',
      content: {
        'application/json': { schema: billingPreviewSchema.meta({ id: 'BillingPreview' }) },
      },
    },
    400: { description: 'Invalid request body', content: errorContent },
    409: { description: 'An Enterprise subscription; see `reason`', content: errorContent },
    ...ownerOnlyErrors,
  },
});

export const createSubscriptionRoute = createRoute({
  method: 'post',
  path: '/billing/subscription',
  operationId: 'createSubscription',
  summary: 'Choose a plan',
  description:
    "Creates the Stripe customer and subscription. During a trial the first charge falls on the trial's end and the answer carries a setup secret; otherwise it is charged now, with a payment secret. Also how a read-only organization subscribes again.",
  security: bearerSecurity,
  middleware: ownerMiddleware,
  request: { body: choiceBody },
  responses: {
    201: checkoutResponse,
    400: { description: 'Invalid request body', content: errorContent },
    ...conflictResponse,
    ...ownerOnlyErrors,
  },
});

export const changeSubscriptionRoute = createRoute({
  method: 'patch',
  path: '/billing/subscription',
  operationId: 'changeSubscription',
  summary: 'Change the plan, the interval, the packs or the members',
  description:
    'Upgrades and additions apply at once: on a monthly plan the difference goes on the next invoice, on an annual one it is charged now and may need the payment secret confirmed. Downgrades, removals and annual to monthly wait for the renewal. During a trial everything applies at once. An annual change that adds now and removes at the renewal is refused with `split_change`. `prorationDate`, from the preview, makes Stripe prorate as it showed.',
  security: bearerSecurity,
  middleware: ownerMiddleware,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: changeSubscriptionRequestSchema.meta({ id: 'ChangeSubscriptionRequest' }),
        },
      },
    },
  },
  responses: {
    200: checkoutResponse,
    400: { description: 'Invalid request body', content: errorContent },
    ...conflictResponse,
    ...ownerOnlyErrors,
  },
});

export const cancelSubscriptionRoute = createRoute({
  method: 'post',
  path: '/billing/subscription/cancel',
  operationId: 'cancelSubscription',
  summary: 'Cancel the subscription',
  description:
    'The plan runs to the end of the period paid, then the organization is read-only for 30 days. Before the first charge of a trial the plan goes at once and the trial carries on.',
  security: bearerSecurity,
  middleware: ownerMiddleware,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: cancelSubscriptionRequestSchema.meta({ id: 'CancelSubscriptionRequest' }),
        },
      },
    },
  },
  responses: {
    204: { description: 'Cancelled' },
    400: { description: 'Invalid request body', content: errorContent },
    ...conflictResponse,
    ...ownerOnlyErrors,
  },
});

export const resumeSubscriptionRoute = createRoute({
  method: 'post',
  path: '/billing/subscription/resume',
  operationId: 'resumeSubscription',
  summary: 'Withdraw a cancellation that waits for the end of the period',
  security: bearerSecurity,
  middleware: ownerMiddleware,
  responses: {
    204: { description: 'The subscription renews again' },
    ...conflictResponse,
    ...ownerOnlyErrors,
  },
});

export const createPortalSessionRoute = createRoute({
  method: 'post',
  path: '/billing/portal-session',
  operationId: 'createBillingPortalSession',
  summary: "A link to Stripe's page for changing the card",
  description:
    'The page offers the card alone and returns to the subscription tab. A card saved there pays an invoice left open by a failed renewal.',
  security: bearerSecurity,
  middleware: ownerMiddleware,
  responses: {
    201: {
      description: 'The link, valid for a few minutes',
      content: {
        'application/json': {
          schema: billingPortalSessionSchema.meta({ id: 'BillingPortalSession' }),
        },
      },
    },
    ...conflictResponse,
    ...ownerOnlyErrors,
  },
});

export const updateInvoiceEmailRoute = createRoute({
  method: 'put',
  path: '/billing/invoice-email',
  operationId: 'updateInvoiceEmail',
  summary: 'Where the invoices are emailed',
  description: "Null sends them to the owner's email.",
  security: bearerSecurity,
  middleware: ownerMiddleware,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: invoiceEmailSchema.meta({ id: 'InvoiceEmail' }) } },
    },
  },
  responses: {
    200: {
      description: 'The saved address',
      content: { 'application/json': { schema: invoiceEmailSchema } },
    },
    400: { description: 'Invalid request body', content: errorContent },
    ...conflictResponse,
    ...ownerOnlyErrors,
  },
});

export const getInvoicePdfRoute = createRoute({
  method: 'get',
  path: '/billing/invoices/{stripeInvoiceId}/pdf',
  operationId: 'getBillingInvoicePdf',
  summary: "A short-lived link to our copy of an invoice's PDF",
  security: bearerSecurity,
  middleware: ownerMiddleware,
  request: {
    params: z.object({ stripeInvoiceId: z.string().regex(/^[a-z]+_[A-Za-z0-9]+$/) }),
  },
  responses: {
    200: {
      description: 'The link, valid for a minute',
      content: {
        'application/json': { schema: billingInvoiceLinkSchema.meta({ id: 'BillingInvoiceLink' }) },
      },
    },
    400: { description: 'Invalid path', content: errorContent },
    404: { description: 'No such invoice in the organization', content: errorContent },
    409: { description: 'The PDF is not stored yet; see `reason`', content: errorContent },
    ...ownerOnlyErrors,
  },
});

export const updateSmsCapRoute = createRoute({
  method: 'put',
  path: '/billing/sms-cap',
  operationId: 'updateSmsCap',
  summary: "The safety cap on the month's signing codes by SMS",
  description:
    "A multiple of the plan's allowance, from 3 (the default) to 20; codes granted by hand come on top. Past the cap no signing code goes by SMS. Recorded in the subscription's change log.",
  security: bearerSecurity,
  middleware: ownerMiddleware,
  request: {
    body: {
      required: true,
      content: {
        'application/json': { schema: smsCapRequestSchema.meta({ id: 'SmsCapRequest' }) },
      },
    },
  },
  responses: {
    200: {
      description: 'The saved cap',
      content: { 'application/json': { schema: smsCapSchema.meta({ id: 'SmsCap' }) } },
    },
    400: { description: 'Invalid request body', content: errorContent },
    409: {
      description:
        'No plan is chosen (`no_subscription`) or the plan is Enterprise (`enterprise_plan`)',
      content: errorContent,
    },
    ...ownerOnlyErrors,
  },
});
