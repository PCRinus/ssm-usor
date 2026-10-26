import type { SubscriptionSummary } from '@ssm-usor/contracts';

import { dateToIso, formatRoDate } from '@/lib/dates';

const dayMs = 86_400_000;

// Until then the trial is only mentioned in the account menu, so a 30-day trial does not open
// every page with a banner.
export const trialNoticeDays = 7;

export const contactEmail = 'contact@ssmusor.ro';

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
  const tens = days % 100;
  return tens === 0 || tens >= 20 ? `în ${days} de zile` : `în ${days} zile`;
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
