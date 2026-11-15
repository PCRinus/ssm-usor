import { noPreview } from '@ssm-usor/discord';
import type { Context } from 'hono';

import type { AdminClient } from '../../lib/admin-db';
import { type AlertMessage, alertSender } from '../../lib/alerts';
import { fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { recordChange } from './store';

export type StripeObjectRef = { id: string; accountId: string; livemode: boolean };
export type StripeInvoiceRef = StripeObjectRef & { number: string | null };
export type OblioDocumentRef = { kind: 'invoice' | 'proforma'; series: string; number: string };

type Money = { cents: number; currency: string };

export type BillingAlert = { organizationId: string } & (
  | {
      kind: 'invoice_not_issued';
      invoice: StripeInvoiceRef;
      document: 'invoice' | 'proforma';
      charged: Money;
      // Set when the lines and their VAT did not make the amount charged.
      linesCents: number | null;
      reason: string;
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
      reason: string;
    }
  | { kind: 'payment_failed'; invoice: StripeInvoiceRef; due: Money; accessUntil: string | null }
  | { kind: 'canceled_unpaid'; subscription: StripeObjectRef; accessUntil: string | null }
);

export interface BillingAlerts {
  // Returns at once: the post runs after the response and never fails billing.
  notify(alert: BillingAlert): void;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const describeFailure = (error: unknown) =>
  reasonOf(error)
    .replace(/[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[A-Za-z]{2,}/g, '[email]')
    .slice(0, 300);

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

export function billingAlertMessage(alert: BillingAlert, organizationName: string): AlertMessage {
  const organization = `Organizația: ${organizationName} · ${alert.organizationId}`;
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
          `Motiv: ${alert.reason}`,
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
          `Motiv: ${alert.reason}`,
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

function subjectOf(alert: BillingAlert) {
  return alert.kind === 'canceled_unpaid'
    ? { stripe_subscription: alert.subscription.id }
    : { stripe_invoice: alert.invoice.id };
}

async function alreadyPosted(db: AdminClient, alert: BillingAlert) {
  const { count, error } = await db
    .from('subscription_changes')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', alert.organizationId)
    .eq('change', 'operator_alerted')
    .contains('details', { alert: alert.kind, ...subjectOf(alert) });
  if (error) throw fromDatabaseError(error, 'billing alert lookup');
  return (count ?? 0) > 0;
}

async function organizationName(db: AdminClient, organizationId: string) {
  const { data } = await db
    .from('organizations')
    .select('name, legal_name')
    .eq('id', organizationId)
    .maybeSingle();
  return data?.legal_name?.trim() || data?.name?.trim() || 'necunoscută';
}

// The mark is written only once Discord took the post, so an invoice left unissued or a payment
// that fails again is posted on Stripe's next delivery after Discord was down.
async function post(db: AdminClient, sender: ReturnType<typeof alertSender>, alert: BillingAlert) {
  if (await alreadyPosted(db, alert)) return;
  const message = billingAlertMessage(alert, await organizationName(db, alert.organizationId));
  if (!(await sender.send(message))) return;
  await recordChange(db, alert.organizationId, {
    source: 'stripe',
    change: 'operator_alerted',
    details: { alert: alert.kind, ...subjectOf(alert) },
  });
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
            `A billing alert (${alert.kind}) was not posted: ${describeFailure(error)}`
          );
        })
      );
    },
  };
}

// Hono's executionCtx throws where the runtime gives none, as in tests.
export function laterOf(c: Context<ApiEnv>) {
  return (work: Promise<unknown>) => {
    try {
      c.executionCtx.waitUntil(work);
    } catch {
      void work;
    }
  };
}
