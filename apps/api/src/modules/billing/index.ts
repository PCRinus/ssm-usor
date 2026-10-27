import { createRouter } from '../../router';
import { stripeWebhook } from './webhook';

// The webhook is not part of the OpenAPI document: Stripe is its only caller, it reads the raw
// body to check the signature, and the SPA client has no use for it.
export const billingRouter = createRouter().post('/billing/stripe-webhook', stripeWebhook);
