import { catalogueProducts } from '@ssm-usor/contracts';
import type Stripe from 'stripe';

import type { AdminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { adminFileStore } from '../../lib/files';
import { creditsStore } from '../credits/store';
import { grantWelcomeGift } from '../credits/usage';
import { createOblioClient, type OblioClient, type OblioDocument, OblioRefused } from './oblio';
import {
  type OblioDocuments,
  type PaidInvoiceLine,
  shouldIssue,
  toOblioDocument,
  toStorno,
  vatPercentage,
} from './oblio-documents';
import type { BillingAlerts, FailureCause, StripeInvoiceRef } from './operator-alerts';
import { parseLookupKey } from './rules';
import {
  findSubscriptionByCustomer,
  insertInvoice,
  type InvoiceRow,
  loadCompany,
  loadInvoice,
  loadSubscription,
  markFirstPayment,
  organizationExists,
  ownerEmail,
  recordChange,
  updateInvoice,
} from './store';
import { idOf, isStripeError, type StripeAccess, type StripeCatalogue } from './stripe';
import { syncSubscription } from './sync';

export type InvoiceDeps = {
  env: ApiEnv['Bindings'];
  db: AdminClient;
  access: StripeAccess;
  catalogue: StripeCatalogue;
  alerts: BillingAlerts;
  // The Stripe event being handled, and whether an earlier delivery of it failed.
  delivery: { eventId: string; redelivered: boolean };
  oblio?: OblioClient;
  fetch?: typeof fetch;
};

export function oblioDocuments(env: ApiEnv['Bindings']): OblioDocuments {
  return env.OBLIO_DOCUMENTS?.trim() === 'invoice' ? 'invoice' : 'proforma';
}

function oblioFor(deps: InvoiceDeps) {
  if (deps.oblio) return deps.oblio;
  const clientId = deps.env.OBLIO_CLIENT_ID?.trim();
  const clientSecret = deps.env.OBLIO_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new ApiError('service_unavailable', 'Oblio is not configured.', undefined, 'oblio_unset');
  }
  return createOblioClient({ clientId, clientSecret }, { fetch: deps.fetch });
}

const productNames = new Map<string, string>(
  catalogueProducts.map((product) => [product.key, product.name])
);

const stepGroups = /\B(?=(\d{3})+(?!\d))/g;

function lineName(line: Stripe.InvoiceLineItem, catalogue: StripeCatalogue) {
  const price = line.pricing?.price_details?.price;
  const lookupKey = price ? catalogue.lookupKeys.get(idOf(price) ?? '') : undefined;
  const parsed = parseLookupKey(lookupKey);
  const product = parsed && productNames.get(parsed.product);
  const step = parsed?.step;
  const name =
    (product && step
      ? `${product}, până la ${String(step).replace(stepGroups, '.')} de lucrători`
      : product) ??
    line.description ??
    'SSM Ușor';
  if (!line.parent?.subscription_item_details?.proration) return name;
  return line.amount < 0
    ? `${name}: credit pentru perioada nefolosită`
    : `${name}: diferența pentru perioada rămasă`;
}

export const lineTax = (line: Stripe.InvoiceLineItem) =>
  (line.taxes ?? []).reduce((sum, tax) => sum + tax.amount, 0);

// Oblio works out each line's VAT itself, to the cent. Stripe rounds the invoice's VAT once and
// spreads it over the lines, so a line can carry the cent the other way. A VAT of exactly half a
// cent is left to no rounding rule: such a line goes with its VAT included.
export function oblioRoundsAsStripe(net: number, tax: number) {
  const exact = Math.abs(net) * vatPercentage;
  if (exact % 100 === 50) return false;
  return Math.sign(net) * Math.round(exact / 100) === tax;
}

// Stripe writes its line descriptions in English, so the invoice names the catalogue's products.
// A prorated line is not unit × quantity, so it goes as one unit of its amount; a credit as a
// negative quantity, the way a Romanian invoice shows a reduction. A line whose VAT Oblio would
// not round as Stripe did goes with its VAT included, as one unit, so the document's total is the
// amount charged (ADR 029, amendment "the invoice total is the amount charged").
export function toPaidLines(
  lines: Stripe.InvoiceLineItem[],
  catalogue: StripeCatalogue
): PaidInvoiceLine[] {
  return lines
    .filter((line) => line.amount !== 0 || lineTax(line) !== 0)
    .map((line) => {
      const tax = lineTax(line);
      const vatIncluded = !oblioRoundsAsStripe(line.amount, tax);
      const amount = vatIncluded ? line.amount + tax : line.amount;
      const quantity = line.quantity && line.quantity > 0 ? line.quantity : 1;
      const perUnit = line.amount % quantity === 0 ? Math.abs(line.amount) / quantity : null;
      const units = !vatIncluded && perUnit !== null ? quantity : 1;
      return {
        description: lineName(line, catalogue),
        unitAmount: Math.abs(amount) / units,
        quantity: amount < 0 ? -units : units,
        vatIncluded,
        ...(vatIncluded &&
          quantity > 1 &&
          perUnit !== null && { counted: { quantity, unitAmount: perUnit } }),
        period: {
          start: new Date(line.period.start * 1000),
          end: new Date(line.period.end * 1000),
        },
      };
    });
}

export class LinesTotalMismatch extends Error {
  constructor(
    invoice: Stripe.Invoice,
    readonly linesCents: number
  ) {
    super(
      `Stripe invoice ${invoice.id}: its lines with their VAT make ${linesCents} cents, not the ${invoice.total} charged; no Oblio document was issued.`
    );
  }
}

export class MissingCompanyDetails extends Error {
  constructor(organizationId: string) {
    super(`Organization ${organizationId} lacks its company name, CUI or an email.`);
  }
}

export function failureCause(error: unknown): FailureCause {
  if (error instanceof LinesTotalMismatch) return { kind: 'lines_total' };
  if (error instanceof MissingCompanyDetails) return { kind: 'company_details' };
  if (error instanceof OblioRefused) {
    return error.reason === 'oblio_refused'
      ? { kind: 'oblio_refused', status: error.status }
      : { kind: 'oblio_unavailable' };
  }
  if (error instanceof ApiError) {
    if (error.reason === 'oblio_unavailable') return { kind: 'oblio_unavailable' };
    return { kind: 'other', code: `ApiError/${error.reason ?? error.code}` };
  }
  if (isStripeError(error)) return { kind: 'other', code: error.type };
  return { kind: 'other', code: error instanceof Error ? error.constructor.name : 'unknown' };
}

const settingCodes = new Set(['ApiError/oblio_login_refused', 'ApiError/oblio_unset']);

// These fail the same way on every retry until someone acts; anything else may pass on Stripe's
// next delivery, so it is posted only once a redelivery fails too.
export function failsUntilFixed(cause: FailureCause) {
  return cause.kind === 'other' ? settingCodes.has(cause.code) : cause.kind !== 'oblio_unavailable';
}

export function checkLinesMakeTotal(invoice: Stripe.Invoice, lines: Stripe.InvoiceLineItem[]) {
  const sum = lines.reduce((total, line) => total + line.amount + lineTax(line), 0);
  if (sum !== invoice.total) throw new LinesTotalMismatch(invoice, sum);
}

async function allLines(stripe: Stripe, invoice: Stripe.Invoice) {
  if (!invoice.lines.has_more) return invoice.lines.data;
  return stripe.invoices
    .listLineItems(invoice.id, { limit: 100 })
    .autoPagingToArray({ limit: 1000 });
}

function paymentReference(invoice: Stripe.Invoice) {
  const payment = invoice.payments?.data.find((entry) => entry.status === 'paid')?.payment;
  return idOf(payment?.payment_intent) ?? idOf(payment?.charge) ?? invoice.id;
}

const safe = (part: string) => part.replace(/[^A-Za-z0-9_-]/g, '');

export function pdfPath(
  organizationId: string,
  document: Pick<OblioDocument, 'seriesName' | 'number'>
) {
  return `${organizationId}/${safe(document.seriesName)}-${safe(document.number)}.pdf`;
}

async function storePdf(deps: InvoiceDeps, row: InvoiceRow) {
  if (row.pdf_path || !row.oblio_link || !row.oblio_series || !row.oblio_number) return row;
  const response = await (deps.fetch ?? fetch)(row.oblio_link);
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.includes('pdf')) {
    throw new Error(
      `Oblio's link for ${row.stripe_invoice_id} answered ${response.status} ${type}.`
    );
  }
  const path = pdfPath(row.organization_id, {
    seriesName: row.oblio_series,
    number: row.oblio_number,
  });
  await adminFileStore(deps.env).writeBillingInvoice(
    path,
    new Uint8Array(await response.arrayBuffer())
  );
  return updateInvoice(deps.db, row.stripe_invoice_id, { pdf_path: path });
}

const issued = (document: OblioDocument) => ({
  issued_at: new Date().toISOString(),
  oblio_series: document.seriesName,
  oblio_number: document.number,
  oblio_link: document.link,
});

// The first invoice can be paid before the checkout's row has the customer; the subscription
// carries the organization from its creation.
async function organizationOfInvoice(deps: InvoiceDeps, invoice: Stripe.Invoice) {
  const customerId = idOf(invoice.customer);
  const byCustomer = customerId ? await findSubscriptionByCustomer(deps.db, customerId) : null;
  if (byCustomer) return { byCustomer, organizationId: byCustomer.organization_id };
  const fromMetadata = invoice.parent?.subscription_details?.metadata?.organization_id;
  const known = fromMetadata ? await organizationExists(deps.db, fromMetadata) : false;
  return { byCustomer: null, organizationId: known ? fromMetadata! : null };
}

// The first payment's event can come before the subscription's own, while the row still holds the
// trial: the welcome credits, fixed at the first payment, must be of the step paid for.
async function adoptFirstSubscription(
  deps: InvoiceDeps,
  invoice: Stripe.Invoice,
  byCustomer: Awaited<ReturnType<typeof findSubscriptionByCustomer>>,
  organizationId: string
) {
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  if (invoice.billing_reason !== 'subscription_create' || !subscriptionId) {
    return byCustomer ?? (await loadSubscription(deps.db, organizationId));
  }
  const subscription = await deps.access.stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(deps.db, subscription, {
    accountId: deps.catalogue.accountId,
    now: new Date(),
    record: { source: 'stripe', change: 'invoice.paid', details: { stripe_invoice: invoice.id } },
  });
  return loadSubscription(deps.db, organizationId);
}

// The document is issued and numbered by now, so a difference is recorded for a person to settle
// with a storno; failing the event would only retry what cannot change.
async function compareTotals(
  deps: InvoiceDeps,
  row: InvoiceRow,
  organizationId: string,
  invoice: StripeInvoiceRef
) {
  const series = row.oblio_series!;
  const number = row.oblio_number!;
  const alerted = {
    organizationId,
    invoice,
    document: { kind: row.kind, series, number },
    charged: { cents: row.amount_cents, currency: row.currency },
  };
  const details = {
    stripe_invoice: row.stripe_invoice_id,
    oblio_document: `${series}-${number}`,
    stripe_total_cents: row.amount_cents,
  };
  let oblioTotal: number;
  try {
    oblioTotal = await oblioFor(deps).documentTotalCents(row.kind, series, number);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Oblio ${row.kind} ${series} ${number} for Stripe invoice ${row.stripe_invoice_id}: its total could not be checked against the ${row.amount_cents} cents charged: ${message}`
    );
    await recordChange(deps.db, organizationId, {
      source: 'stripe',
      change: 'oblio_total_unchecked',
      reason: message,
      details,
    });
    deps.alerts.notify({
      ...alerted,
      kind: 'oblio_total_unchecked',
      cause: failureCause(error),
    });
    return;
  }
  if (oblioTotal === row.amount_cents) return;
  console.error(
    `Oblio ${row.kind} ${series} ${number} totals ${oblioTotal} cents, but Stripe invoice ${row.stripe_invoice_id} charged ${row.amount_cents}.`
  );
  await recordChange(deps.db, organizationId, {
    source: 'stripe',
    change: 'oblio_total_mismatch',
    details: { ...details, oblio_total_cents: oblioTotal },
  });
  deps.alerts.notify({ ...alerted, kind: 'oblio_total_mismatch', oblioCents: oblioTotal });
}

const invoiceRef = (deps: InvoiceDeps, invoice: Stripe.Invoice): StripeInvoiceRef => ({
  id: invoice.id,
  number: invoice.number,
  accountId: deps.catalogue.accountId,
  livemode: deps.access.livemode,
});

async function issueDocument(
  deps: InvoiceDeps,
  invoice: Stripe.Invoice,
  row: InvoiceRow,
  subscription: Awaited<ReturnType<typeof loadSubscription>>,
  paidAt: Date
) {
  const organizationId = row.organization_id;
  const company = await loadCompany(deps.db, organizationId);
  const recipientEmail =
    subscription?.invoice_email ??
    (await ownerEmail(deps.db, organizationId)) ??
    invoice.customer_email;
  if (!company.name || !company.cui || !recipientEmail) {
    throw new MissingCompanyDetails(organizationId);
  }
  const lines = await allLines(deps.access.stripe, invoice);
  checkLinesMakeTotal(invoice, lines);
  const request = toOblioDocument(
    row.kind,
    { ...company, name: company.name, cui: company.cui, recipientEmail },
    {
      id: invoice.id,
      lines: toPaidLines(lines, deps.catalogue),
      total: invoice.total,
      paymentReference: paymentReference(invoice),
      paidAt,
    }
  );
  const document = await oblioFor(deps).issue(request);
  return updateInvoice(deps.db, invoice.id, issued(document));
}

// Each step checks what is already done, so a retried event finishes the work without issuing
// twice; Oblio's idempotency key covers a crash between its answer and our write.
export async function handleInvoicePaid(deps: InvoiceDeps, invoiceId: string) {
  const { stripe } = deps.access;
  const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['payments'] });
  if (!shouldIssue(invoice)) return null;
  const { byCustomer, organizationId } = await organizationOfInvoice(deps, invoice);
  if (!organizationId) {
    console.warn(`Paid Stripe invoice ${invoice.id} names no organization here; left alone.`);
    return null;
  }
  const progress: Progress = { issued: false, kind: oblioDocuments(deps.env) };
  try {
    return await settleInvoice(deps, invoice, byCustomer, organizationId, progress);
  } catch (error) {
    const cause = failureCause(error);
    if (!progress.issued && (deps.delivery.redelivered || failsUntilFixed(cause))) {
      deps.alerts.notify({
        kind: 'invoice_not_issued',
        organizationId,
        invoice: invoiceRef(deps, invoice),
        document: progress.kind,
        charged: { cents: invoice.total, currency: invoice.currency },
        linesCents: error instanceof LinesTotalMismatch ? error.linesCents : null,
        eventId: deps.delivery.eventId,
        cause,
      });
    }
    throw error;
  }
}

type Progress = { issued: boolean; kind: InvoiceRow['kind'] };

async function settleInvoice(
  deps: InvoiceDeps,
  invoice: Stripe.Invoice,
  byCustomer: Awaited<ReturnType<typeof findSubscriptionByCustomer>>,
  organizationId: string,
  progress: Progress
) {
  const subscription = await adoptFirstSubscription(deps, invoice, byCustomer, organizationId);
  const paidAt = new Date((invoice.status_transitions.paid_at ?? invoice.created) * 1000);
  // A row still holding the trial would size the welcome credits, which never change after, from
  // the trial's placeholder plan rather than the step paid for.
  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
  const followed =
    subscription !== null &&
    subscriptionId !== null &&
    subscription.stripe_subscription_id === subscriptionId;
  if (followed && (await markFirstPayment(deps.db, organizationId, paidAt))) {
    await recordChange(deps.db, organizationId, {
      source: 'stripe',
      change: 'first_payment',
      details: { stripe_invoice: invoice.id },
    });
  }
  // Every paid invoice, not only the one that marked the first payment: a retried event whose
  // first delivery stopped between the two writes still brings the gift. The database grants it
  // once, at the step of the first payment, and never changes it after (ADR 029).
  if (followed) {
    await grantWelcomeGift(creditsStore(deps.db), await loadSubscription(deps.db, organizationId));
  }

  let row =
    (await loadInvoice(deps.db, invoice.id)) ??
    (await insertInvoice(deps.db, {
      stripe_invoice_id: invoice.id,
      organization_id: organizationId,
      stripe_account: subscription?.stripe_account ?? deps.catalogue.accountId,
      kind: oblioDocuments(deps.env),
      amount_cents: invoice.total,
      subtotal_cents: invoice.subtotal,
      currency: invoice.currency,
    }));
  progress.kind = row.kind;
  progress.issued = Boolean(row.issued_at);

  if (!row.issued_at) {
    row = await issueDocument(deps, invoice, row, subscription, paidAt);
    progress.issued = true;
    await compareTotals(deps, row, organizationId, invoiceRef(deps, invoice));
  }
  const stored = await storePdf(deps, row);
  // Stripe delivers the event again, and the first payment and its credits are recorded then.
  if (!followed && invoice.billing_reason === 'subscription_create' && subscriptionId) {
    throw new Error(`The first invoice ${invoice.id} is paid before its subscription is followed.`);
  }
  return stored;
}

async function invoiceOfCharge(stripe: Stripe, charge: Stripe.Charge) {
  const paymentIntent = idOf(charge.payment_intent);
  if (!paymentIntent) return null;
  const payments = await stripe.invoicePayments.list({
    payment: { type: 'payment_intent', payment_intent: paymentIntent },
    limit: 1,
  });
  return idOf(payments.data[0]?.invoice);
}

// Only a whole refund is reversed: Oblio's storno takes back the entire invoice, and the terms
// refund nothing, so a refund is the seller's own decision for a whole payment (ADR 029).
export async function handleChargeRefunded(deps: InvoiceDeps, charge: Stripe.Charge) {
  if (!charge.refunded) {
    console.warn(`Charge ${charge.id} was refunded in part; its invoice is left as it is.`);
    return null;
  }
  const { stripe } = deps.access;
  const invoiceId = await invoiceOfCharge(stripe, charge);
  if (!invoiceId) return null;
  const original = await loadInvoice(deps.db, invoiceId);
  // Refunded before its invoice was issued: the event fails, so Stripe delivers it again once
  // invoice.paid has issued the invoice the storno reverses.
  let awaitsIssue = original ? !original.issued_at : false;
  if (!original) {
    const invoice = await stripe.invoices.retrieve(invoiceId);
    awaitsIssue =
      shouldIssue(invoice) && (await organizationOfInvoice(deps, invoice)).organizationId !== null;
  }
  if (awaitsIssue) {
    throw new Error(`Charge ${charge.id} is refunded before invoice ${invoiceId} was issued.`);
  }
  if (!original?.oblio_series || !original.oblio_number) return null;

  const oblio = oblioFor(deps);
  if (original.kind === 'proforma') {
    await oblio.cancel('proforma', original.oblio_series, original.oblio_number);
    return null;
  }

  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 });
  const refund = [...refunds.data].sort((a, b) => b.created - a.created)[0];
  if (!refund) throw new Error(`Charge ${charge.id} is refunded but lists no refund.`);

  let row = await loadInvoice(deps.db, refund.id);
  if (!row) {
    const document = await oblio.storno(
      toStorno({ seriesName: original.oblio_series, number: original.oblio_number }, refund.id)
    );
    row = await insertInvoice(deps.db, {
      stripe_invoice_id: refund.id,
      organization_id: original.organization_id,
      stripe_account: original.stripe_account,
      kind: 'invoice',
      amount_cents: -original.amount_cents,
      subtotal_cents: original.subtotal_cents === null ? null : -original.subtotal_cents,
      currency: original.currency,
      storno_of: original.stripe_invoice_id,
      ...issued(document),
    });
  }
  return storePdf(deps, row);
}
