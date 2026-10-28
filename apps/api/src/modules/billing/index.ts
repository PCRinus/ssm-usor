import { createRouter } from '../../router';
import {
  cancelSubscriptionHandler,
  changeSubscriptionHandler,
  createPortalSession,
  createSubscriptionHandler,
  getBilling,
  getInvoicePdf,
  previewBilling,
  resumeSubscriptionHandler,
  updateInvoiceEmail,
} from './handlers';
import {
  cancelSubscriptionRoute,
  changeSubscriptionRoute,
  createPortalSessionRoute,
  createSubscriptionRoute,
  getBillingRoute,
  getInvoicePdfRoute,
  previewBillingRoute,
  resumeSubscriptionRoute,
  updateInvoiceEmailRoute,
} from './routes';
import { stripeWebhook } from './webhook';

// The webhook is not part of the OpenAPI document: Stripe is its only caller, it reads the raw
// body to check the signature, and the SPA client has no use for it.
export const billingRouter = createRouter()
  .openapi(getBillingRoute, getBilling)
  .openapi(previewBillingRoute, previewBilling)
  .openapi(createSubscriptionRoute, createSubscriptionHandler)
  .openapi(changeSubscriptionRoute, changeSubscriptionHandler)
  .openapi(cancelSubscriptionRoute, cancelSubscriptionHandler)
  .openapi(resumeSubscriptionRoute, resumeSubscriptionHandler)
  .openapi(createPortalSessionRoute, createPortalSession)
  .openapi(updateInvoiceEmailRoute, updateInvoiceEmail)
  .openapi(getInvoicePdfRoute, getInvoicePdf)
  .post('/billing/stripe-webhook', stripeWebhook);
