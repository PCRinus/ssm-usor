import type { SubscriptionPlan, SubscriptionSummary } from '@ssm-usor/contracts';

import { dateToIso, formatRoDate } from '@/lib/dates';

const dayMs = 86_400_000;

// The bar shows only from here on; earlier, the badge in the header is enough (ADR 029).
export const trialBarDays = 7;

export const contactEmail = 'contact@ssmusor.ro';
export const pricingUrl = 'https://ssmusor.ro/preturi/';
// The API sends the Stripe portal back here, so the path is fixed.
export const subscriptionPath = '/organization/subscription';

export const planNames: Record<SubscriptionPlan, string> = {
  start: 'Start',
  profesional: 'Profesional',
  enterprise: 'Enterprise',
};

export function roDate(timestamp: string) {
  return formatRoDate(dateToIso(new Date(timestamp)));
}

// Calendar days in the reader's zone: a trial that ends tonight ends "azi", whatever the hour.
export function daysUntil(timestamp: string, now = new Date()) {
  const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((day(new Date(timestamp)).getTime() - day(now).getTime()) / dayMs);
  return Math.max(0, days);
}

/** "azi", "mâine", "în 3 zile", "în 20 de zile". */
export function inDaysLabel(days: number) {
  if (days <= 0) return 'azi';
  if (days === 1) return 'mâine';
  return `în ${daysCount(days)}`;
}

/** "azi", "mâine", "3 zile", "20 de zile": what is left, on the badge. */
export function daysLeftLabel(days: number) {
  if (days <= 0) return 'azi';
  if (days === 1) return 'mâine';
  return daysCount(days);
}

function daysCount(days: number) {
  const tens = days % 100;
  return tens === 0 || tens >= 20 ? `${days} de zile` : `${days} zile`;
}

export type SealKind = 'trial' | 'readOnly' | SubscriptionPlan;

export interface Seal {
  kind: SealKind;
  label: string;
  // A paid plan whose renewal failed: still full access, but something to fix.
  attention: boolean;
}

export function sealFor(subscription: SubscriptionSummary, now = new Date()): Seal {
  if (subscription.access === 'read_only') {
    return { kind: 'readOnly', label: 'Doar citire', attention: false };
  }
  if (subscription.status === 'trialing' && subscription.trialEndsAt && !subscription.planChosen) {
    const days = daysUntil(subscription.trialEndsAt, now);
    return { kind: 'trial', label: `Probă · ${daysLeftLabel(days)}`, attention: false };
  }
  return {
    kind: subscription.plan,
    label: planNames[subscription.plan],
    attention: subscription.status === 'past_due',
  };
}

export function endedSentence({ status, accessUntil }: SubscriptionSummary) {
  const on = accessUntil ? ` pe ${roDate(accessUntil)}` : '';
  switch (status) {
    case 'trialing':
      return `Perioada de probă s-a încheiat${on}.`;
    case 'canceled':
      return `Abonamentul s-a încheiat${on}.`;
    case 'past_due':
      return `Plata abonamentului nu a reușit, iar accesul complet s-a încheiat${on}.`;
    case 'active':
      return `Accesul complet s-a încheiat${on}.`;
  }
}

export interface Bar {
  kind: 'trial' | 'pastDue' | 'readOnly';
  lead: string;
  // The lead on a phone, where the bar keeps to one line.
  short: string;
  // Left out on a phone.
  detail: string;
  closable: boolean;
}

export function barFor(subscription: SubscriptionSummary, now = new Date()): Bar | null {
  if (subscription.access === 'read_only') {
    const deletes = subscription.deletesAt ? ` până pe ${roDate(subscription.deletesAt)}` : '';
    return {
      kind: 'readOnly',
      lead: endedSentence(subscription),
      short:
        subscription.status === 'trialing'
          ? 'Proba s-a încheiat.'
          : subscription.status === 'past_due'
            ? 'Plata nu a reușit.'
            : 'Abonamentul s-a încheiat.',
      detail: `Vezi și descarci tot${deletes}; apoi datele se șterg.`,
      closable: false,
    };
  }
  if (subscription.status === 'past_due') {
    const until = subscription.accessUntil ? ` pe ${roDate(subscription.accessUntil)}` : '';
    return {
      kind: 'pastDue',
      lead: 'Plata abonamentului nu a reușit.',
      short: 'Plata nu a reușit.',
      detail: `Dacă nu reușește, contul trece în modul doar citire${until}.`,
      closable: false,
    };
  }
  if (subscription.status === 'trialing' && subscription.trialEndsAt && !subscription.planChosen) {
    const days = daysUntil(subscription.trialEndsAt, now);
    if (days > trialBarDays) return null;
    return {
      kind: 'trial',
      lead: `Perioada de probă se încheie ${inDaysLabel(days)}.`,
      short: `Proba se încheie ${inDaysLabel(days)}.`,
      detail: `Până pe ${roDate(subscription.trialEndsAt)} ai tot ce include Profesional.`,
      closable: days > 1,
    };
  }
  return null;
}

export interface OwnerAction {
  label: string;
  urgent: boolean;
}

export function ownerActionFor(subscription: SubscriptionSummary): OwnerAction {
  const ended = subscription.access === 'read_only';
  if (subscription.status === 'past_due') return { label: 'Actualizează cardul', urgent: true };
  if (subscription.status === 'trialing' && !subscription.planChosen) {
    return { label: 'Alege un plan', urgent: true };
  }
  if (ended) return { label: 'Reactivează abonamentul', urgent: true };
  return { label: 'Gestionează abonamentul', urgent: false };
}
