import {
  creditsExtra,
  type ExtraKind,
  type ExtrasUnavailable,
  extraUnitCents,
  extraUnitsWithin,
  smsOverage,
} from '@ssm-usor/contracts';

import { isPaid, type SmsSubscription } from '../sms-usage/policy';

/**
 * Extras apply only on a subscription that has paid and is in good standing (ADR 029): a trial
 * has nothing to bill them to, and one past due or ended stops them until it pays again. Settings
 * the owner made stay while past due and come back with the payment.
 */
export function extrasUnavailable(row: SmsSubscription | null): ExtrasUnavailable | null {
  if (!row) return 'no_subscription';
  if (row.plan === 'enterprise') return 'enterprise';
  if (row.status === 'canceled') return 'canceled';
  if (!row.stripe_subscription_id || !isPaid(row) || row.status === 'trialing') return 'trial';
  if (row.status !== 'active') return 'past_due';
  return null;
}

export const smsExtraCents = (row: SmsSubscription | null) =>
  extrasUnavailable(row) === null ? smsOverage.price.unitAmount : null;

export const creditBlockCents = (row: SmsSubscription | null) =>
  extrasUnavailable(row) === null ? creditsExtra.price.unitAmount : null;

export type ExtraSpend = { limit: number; used: number; spentCents: number };

/** `used` is codes past the allowance, or credits bought in blocks; `limit` likewise. */
export function extraSpend(kind: ExtraKind, ceilingCents: number, used: number): ExtraSpend {
  const units = kind === 'sms' ? used : Math.ceil(used / creditsExtra.blockCredits);
  const limit = extraUnitsWithin(kind, ceilingCents);
  return {
    limit: kind === 'sms' ? limit : limit * creditsExtra.blockCredits,
    used,
    spentCents: units * extraUnitCents(kind),
  };
}

export type ExtraLevel = 'ok' | 'near' | 'reached';

export function extraLevel(spend: Pick<ExtraSpend, 'limit' | 'used'>): ExtraLevel {
  if (spend.used >= spend.limit) return 'reached';
  return spend.used >= spend.limit * 0.8 ? 'near' : 'ok';
}
