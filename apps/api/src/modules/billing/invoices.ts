import { catalogueProducts } from '@ssm-usor/contracts';
import type Stripe from 'stripe';

import type { AdminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { adminFileStore } from '../../lib/files';
import { createOblioClient, type OblioClient, type OblioDocument } from './oblio';
import {
  type OblioDocuments,
  type PaidInvoiceLine,
  shouldIssue,
  toOblioDocument,
  toStorno,
} from './oblio-documents';
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
import { idOf, type StripeAccess, type StripeCatalogue } from './stripe';

export type InvoiceDeps = {
  env: ApiEnv['Bindings'];
  db: AdminClient;
  access: StripeAccess;
  catalogue: StripeCatalogue;
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

const productNames = new Map(catalogueProducts.map((product) => [product.key, product.name]));

function lineName(line: Stripe.InvoiceLineItem, catalogue: StripeCatalogue) {
  const price = line.pricing?.price_details?.price;
  const lookupKey = price ? catalogue.lookupKeys.get(idOf(price) ?? '') : undefined;
  const product = parseLookupKey(lookupKey)?.product;
  const name = (product && productNames.get(product)) ?? line.description ?? 'SSM Ușor';
  if (!line.parent?.subscription_item_details?.proration) return name;
  return line.amount < 0
    ? `${name}: credit pentru perioada nefolosită`
    : `${name}: diferența pentru perioada rămasă`;
}

// Stripe writes its line descriptions in English, so the invoice names the catalogue's products.
// A prorated line is not unit × quantity, so it goes as one unit of its amount; a credit as a
// negative quantity, the way a Romanian invoice shows a reduction.
export function toPaidLines(
  lines: Stripe.InvoiceLineItem[],
  catalogue: StripeCatalogue
): PaidInvoiceLine[] {
  return lines
    .filter((line) => line.amount !== 0)
    .map((line) => {
      const quantity = line.quantity && line.quantity > 0 ? line.quantity : 1;
      const exact = line.amount % quantity === 0;
      const units = exact ? quantity : 1;
      const unitAmount = Math.abs(line.amount) / units;
      return {
        description: lineName(line, catalogue),
        unitAmount,
        quantity: line.amount < 0 ? -units : units,
        period: {
          start: new Date(line.period.start * 1000),
          end: new Date(line.period.end * 1000),
        },
      };
    });
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
  const subscription = byCustomer ?? (await loadSubscription(deps.db, organizationId));
  const paidAt = new Date((invoice.status_transitions.paid_at ?? invoice.created) * 1000);
  if (subscription && (await markFirstPayment(deps.db, organizationId, paidAt))) {
    await recordChange(deps.db, organizationId, {
      source: 'stripe',
      change: 'first_payment',
      details: { stripe_invoice: invoice.id },
    });
  }

  let row =
    (await loadInvoice(deps.db, invoice.id)) ??
    (await insertInvoice(deps.db, {
      stripe_invoice_id: invoice.id,
      organization_id: organizationId,
      stripe_account: subscription?.stripe_account ?? deps.catalogue.accountId,
      kind: oblioDocuments(deps.env),
      amount_cents: invoice.total,
      currency: invoice.currency,
    }));

  if (!row.issued_at) {
    const company = await loadCompany(deps.db, organizationId);
    const recipientEmail =
      subscription?.invoice_email ??
      (await ownerEmail(deps.db, organizationId)) ??
      invoice.customer_email;
    if (!company.name || !company.cui || !recipientEmail) {
      throw new Error(`Organization ${organizationId} lacks its company name, CUI or an email.`);
    }
    const lines = await allLines(stripe, invoice);
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
    row = await updateInvoice(deps.db, invoice.id, issued(document));
  }
  return storePdf(deps, row);
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
      currency: original.currency,
      storno_of: original.stripe_invoice_id,
      ...issued(document),
    });
  }
  return storePdf(deps, row);
}
