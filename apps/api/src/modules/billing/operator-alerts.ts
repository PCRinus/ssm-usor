import { noPreview } from '@ssm-usor/discord';

import type { AdminClient } from '../../lib/admin-db';
import { type AlertMessage, alertSender } from '../../lib/alerts';
import { fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';

export type StripeObjectRef = { id: string; accountId: string; livemode: boolean };
export type StripeInvoiceRef = StripeObjectRef & { number: string | null };
export type OblioDocumentRef = { kind: 'invoice' | 'proforma'; series: string; number: string };

type Money = { cents: number; currency: string };

// A failure's own text never reaches Discord: Oblio's and validation messages can quote a
// company's name, a PFA's CUI, an address or an email (ADR 037). It stays in the Worker's log.
export type FailureCause =
  | { kind: 'lines_total' }
  | { kind: 'company_details' }
  | { kind: 'oblio_refused'; status: number }
  | { kind: 'oblio_unavailable' }
  // Our own error class or code, such as ApiError/oblio_login_refused or StripeRateLimitError.
  | { kind: 'other'; code: string };

export type BillingAlert = { organizationId: string } & (
  | {
      kind: 'invoice_not_issued';
      invoice: StripeInvoiceRef;
      eventId: string;
      document: 'invoice' | 'proforma';
      charged: Money;
      // Set when the lines and their VAT did not make the amount charged.
      linesCents: number | null;
      cause: FailureCause;
    }
  | {
      kind: 'oblio_total_mismatch';
      invoice: StripeInvoiceRef;
      document: OblioDocumentRef;
      charged: Money;
      oblioCents: number;
    }
  | {
      kind: 'oblio_total_unchecked';
      invoice: StripeInvoiceRef;
      document: OblioDocumentRef;
      charged: Money;
      cause: FailureCause;
    }
  | {
      kind: 'payment_failed';
      invoice: StripeInvoiceRef;
      due: Money;
      // Null unless the subscription is past due, when its full access ends then.
      accessUntil: string | null;
    }
  | { kind: 'canceled_unpaid'; subscription: StripeObjectRef; accessUntil: string | null }
);

export interface BillingAlerts {
  // Returns at once: the post runs after the response and never fails billing.
  notify(alert: BillingAlert): void;
}

const codePattern = /^[A-Za-z][A-Za-z0-9_./-]{0,59}$/;

export const ownCode = (code: string) => (codePattern.test(code) ? code : 'Error');

function causeLine(cause: FailureCause) {
  switch (cause.kind) {
    case 'lines_total':
      return 'Motiv: liniile cu TVA nu dau totalul plătit.';
    case 'company_details':
      return 'Motiv: lipsesc numele firmei, CUI-ul sau emailul pentru factură.';
    case 'oblio_refused':
      return `Motiv: Oblio a refuzat cererea (HTTP ${cause.status}).`;
    case 'oblio_unavailable':
      return 'Motiv: Oblio nu a putut fi contactat.';
    case 'other':
      return `Motiv: altă eroare (\`${ownCode(cause.code)}\`).`;
  }
}

function stripeLink(ref: StripeObjectRef, path: string) {
  return noPreview(
    `https://dashboard.stripe.com/${ref.accountId}${ref.livemode ? '' : '/test'}/${path}/${ref.id}`
  );
}

const amount = ({ cents, currency }: Money) =>
  `${(cents / 100).toFixed(2).replace('.', ',')} ${currency.toUpperCase()}`;

const documentNames = { invoice: 'factura', proforma: 'proforma' } as const;
const bareDocumentNames = { invoice: 'factură', proforma: 'proformă' } as const;

const documentLine = (document: OblioDocumentRef) =>
  `Document Oblio: ${documentNames[document.kind]} ${document.series} ${document.number}`;

const invoiceLines = (invoice: StripeInvoiceRef) => [
  `Factura Stripe: ${invoice.number ?? 'fără număr'} · ${invoice.id}`,
  stripeLink(invoice, 'invoices'),
];

const day = (iso: string) => iso.slice(0, 10);

export function billingAlertMessage(alert: BillingAlert): AlertMessage {
  const organization = `Organizația: ${alert.organizationId}`;
  switch (alert.kind) {
    case 'invoice_not_issued': {
      const linesMismatch = alert.linesCents !== null;
      const document = bareDocumentNames[alert.document];
      return {
        severity: 'now',
        title: linesMismatch
          ? `Plată fără ${document}: liniile nu dau totalul plătit`
          : `Plată fără ${document}: documentul nu a putut fi emis`,
        lines: [
          organization,
          ...invoiceLines(alert.invoice),
          linesMismatch
            ? `Total Stripe: ${amount(alert.charged)} · liniile cu TVA: ${amount({ ...alert.charged, cents: alert.linesCents! })}`
            : `Total Stripe: ${amount(alert.charged)}`,
          causeLine(alert.cause),
          `Detalii în jurnalul Worker-ului, la evenimentul Stripe ${alert.eventId}.`,
          linesMismatch
            ? `Clientul a plătit și nu are ${document}; reîncercările lui Stripe, timp de trei zile, vor eșua la fel.`
            : `Clientul a plătit și nu are ${document}; Stripe reîncearcă evenimentul timp de trei zile, iar dacă o reîncercare reușește, documentul se emite singur.`,
          linesMismatch
            ? 'Ce faci: emite-o manual în Oblio și nu mai retrimite evenimentul, sau corectează cauza și retrimite-l din Stripe.'
            : `Ce faci: corectează cauza, dacă nu trece singură, și retrimite evenimentul din Stripe. Nu o emite manual cât timp Stripe reîncearcă, ca să nu iasă două; verifică întâi în Oblio dacă nu există deja.`,
        ],
      };
    }
    case 'oblio_total_mismatch':
      return {
        severity: 'now',
        title: 'Documentul emis are alt total decât plata',
        lines: [
          organization,
          ...invoiceLines(alert.invoice),
          documentLine(alert.document),
          `Total Stripe: ${amount(alert.charged)} · total Oblio: ${amount({ ...alert.charged, cents: alert.oblioCents })}`,
          'Documentul a plecat deja la client și, dacă e factură, în SPV.',
          'Ce faci: stornează-l în Oblio și emite unul cu totalul plătit.',
        ],
      };
    case 'oblio_total_unchecked':
      return {
        severity: 'now',
        title: 'Totalul documentului emis nu a putut fi verificat',
        lines: [
          organization,
          ...invoiceLines(alert.invoice),
          documentLine(alert.document),
          `Total Stripe: ${amount(alert.charged)}`,
          causeLine(alert.cause),
          `Detalii în jurnalul Worker-ului, la factura Stripe ${alert.invoice.id}.`,
          'Ce faci: compară totalul din Oblio cu cel din Stripe; dacă diferă, stornează documentul și emite unul cu totalul plătit.',
        ],
      };
    case 'payment_failed':
      return {
        severity: 'week',
        title: 'Plata unei reînnoiri sau modificări a eșuat',
        lines: [
          organization,
          ...invoiceLines(alert.invoice),
          `De plată: ${amount(alert.due)}`,
          alert.accessUntil
            ? `Stripe reîncearcă plata; acces complet până la ${day(alert.accessUntil)}.`
            : 'Stripe reîncearcă plata.',
          'Ce faci: nimic deocamdată; dacă plata nu trece, ia legătura cu clientul.',
        ],
      };
    case 'canceled_unpaid':
      return {
        severity: 'week',
        title: 'Abonament anulat de Stripe după plăți eșuate',
        lines: [
          organization,
          `Abonament Stripe: ${alert.subscription.id}`,
          stripeLink(alert.subscription, 'subscriptions'),
          alert.accessUntil
            ? `Organizația trece pe doar citire la ${day(alert.accessUntil)}.`
            : 'Organizația trece pe doar citire.',
          'Ce faci: ia legătura cu clientul, dacă vrei să-l păstrezi.',
        ],
      };
  }
}

// A later failure of another kind for the same invoice is a new problem, posted once more.
function claimDetails(alert: BillingAlert) {
  switch (alert.kind) {
    case 'canceled_unpaid':
      return {
        alert: alert.kind,
        stripe_subscription: alert.subscription.id,
        alert_key: `${alert.kind}:${alert.subscription.id}`,
      };
    case 'invoice_not_issued':
      return {
        alert: alert.kind,
        stripe_invoice: alert.invoice.id,
        cause: alert.cause.kind,
        alert_key: `${alert.kind}:${alert.invoice.id}:${alert.cause.kind}`,
      };
    default:
      return {
        alert: alert.kind,
        stripe_invoice: alert.invoice.id,
        alert_key: `${alert.kind}:${alert.invoice.id}`,
      };
  }
}

// The unique index on alert_key makes the insert the claim, so two deliveries at once post once.
async function claim(db: AdminClient, alert: BillingAlert) {
  const { data, error } = await db
    .from('subscription_changes')
    .insert({
      organization_id: alert.organizationId,
      source: 'stripe',
      change: 'operator_alerted',
      details: claimDetails(alert),
    })
    .select('id')
    .single();
  if (error?.code === '23505') return null;
  if (error) throw fromDatabaseError(error, 'billing alert claim');
  return data.id;
}

async function release(db: AdminClient, claimId: number) {
  const { error } = await db.from('subscription_changes').delete().eq('id', claimId);
  if (error) throw fromDatabaseError(error, 'billing alert release');
}

// A claim Discord did not take is released, so the next delivery of the same problem posts it.
async function post(db: AdminClient, sender: ReturnType<typeof alertSender>, alert: BillingAlert) {
  const claimId = await claim(db, alert);
  if (claimId === null) return;
  if (!(await sender.send(billingAlertMessage(alert)))) await release(db, claimId);
}

export function billingAlerts(
  env: ApiEnv['Bindings'],
  db: AdminClient,
  later: (work: Promise<unknown>) => void,
  fetcher?: typeof fetch
): BillingAlerts {
  const sender = alertSender(env, fetcher, env.DISCORD_BILLING_WEBHOOK);
  return {
    notify(alert) {
      if (!sender.enabled) return;
      later(
        post(db, sender, alert).catch((error: unknown) => {
          console.error(
            `A billing alert (${alert.kind}) was not posted: ${error instanceof Error ? error.message : String(error)}`
          );
        })
      );
    },
  };
}
