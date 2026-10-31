import type {
  BillingCreditsUsage,
  CreditsShort,
  CreditsUsageState,
  ImportCredits,
} from '@ssm-usor/contracts';

import type { SmsSubscription } from '../sms-usage/policy';
import { type CreditPolicy, creditPolicy, welcomeCreditsOf } from './policy';
import type { Balance, CreditsStore, ImportCreditEntry } from './store';

export function creditsState(included: number | null, left: number | null, giftLeft: number) {
  if (included === null || left === null) return 'unlimited' satisfies CreditsUsageState;
  const available = left + giftLeft;
  if (left < 0 && available < 0) return 'negative' satisfies CreditsUsageState;
  if (available <= 0) return 'out' satisfies CreditsUsageState;
  return available < included * 0.2 ? 'near' : 'ok';
}

// A trial without a plan never renews: credits come back only with a plan's first payment.
export const renewsAt = (policy: CreditPolicy) =>
  policy.limited && (policy.kind === 'month' || policy.giftPending > 0)
    ? policy.period.end.toISOString()
    : null;

export function usageView(policy: CreditPolicy, balance: Balance): BillingCreditsUsage {
  const limited = policy.limited ? policy : null;
  const included = limited ? limited.allowance + balance.granted : null;
  return {
    // A refund made in a later month than its charges can take the month's count below zero.
    used: Math.max(0, balance.used),
    included,
    allowance: limited?.allowance ?? null,
    granted: balance.granted,
    shortfall: balance.shortfall,
    left: balance.balance,
    giftLeft: balance.giftLeft,
    giftPending: limited?.giftPending ?? 0,
    period: limited?.kind ?? 'month',
    periodStart: policy.period.start.toISOString(),
    periodEnd: policy.period.end.toISOString(),
    state: creditsState(included, balance.balance, balance.giftLeft),
  };
}

export async function creditsUsageOf(
  store: Pick<CreditsStore, 'balance'>,
  organizationId: string,
  row: SmsSubscription | null,
  now: Date
): Promise<BillingCreditsUsage> {
  const policy = creditPolicy(row, now);
  return usageView(policy, await store.balance(organizationId, policy));
}

export function importCreditsOf(entries: ImportCreditEntry[]): ImportCredits | null {
  if (!entries.some((entry) => entry.kind === 'import_start')) return null;
  const sum = (kinds: string[]) =>
    entries
      .filter((entry) => kinds.includes(entry.kind))
      .reduce((total, entry) => total + entry.credits, 0);
  return {
    used: Math.max(0, -sum(['import_start', 'import_pages', 'scanned_page', 'refund'])),
    atStart: Math.max(0, -sum(['import_start', 'import_pages'])),
    scannedPages: entries.filter((entry) => entry.kind === 'scanned_page').length,
    refunded: entries.some((entry) => entry.kind === 'refund'),
  };
}

export type StartCharge = { started: true } | { started: false; short: CreditsShort };

export function importCharges(store: CreditsStore, now: () => Date = () => new Date()) {
  const policyOf = async (organizationId: string) =>
    creditPolicy(await store.subscription(organizationId), now());

  return {
    async start(organizationId: string, importId: string, credits: number): Promise<StartCharge> {
      const policy = await policyOf(organizationId);
      const result = await store.charge({
        organizationId,
        policy,
        kind: 'import_start',
        credits,
        importId,
        key: `start:${importId}`,
        require: true,
      });
      if (!result.refused) return { started: true };
      return {
        started: false,
        short: {
          needed: credits,
          left: (result.balance ?? 0) + result.giftLeft,
          renewsAt: renewsAt(policy),
        },
      };
    },

    releaseStart: (importId: string) => store.releaseStart(`start:${importId}`),

    async scannedPage(organizationId: string, importId: string, fileId: string, page: number) {
      await store.charge({
        organizationId,
        policy: await policyOf(organizationId),
        kind: 'scanned_page',
        credits: 1,
        importId,
        fileId,
        page,
        key: `page:${fileId}:${page}`,
        require: false,
      });
    },

    /**
     * An employee import's pages as the extractor counted them, against what its start was
     * charged for. False when the balance does not cover the pages counted past it: the import
     * never goes below zero (ADR 032).
     */
    async settlePages(organizationId: string, importId: string, extra: number) {
      const key = `pages:${importId}`;
      if (extra < 0) {
        await store.giveBack(importId, -extra, key);
        return true;
      }
      if (extra === 0) return true;
      const result = await store.charge({
        organizationId,
        policy: await policyOf(organizationId),
        kind: 'import_pages',
        credits: extra,
        importId,
        key,
        require: true,
      });
      return !result.refused;
    },
  };
}

export type ImportCharges = ReturnType<typeof importCharges>;

/**
 * Once the first payment went through, the gift is brought up to the plan's: all of it at the
 * first payment, the difference when Start moves up to Profesional (ADR 030). Before that a plan
 * chosen during the trial brings nothing, since cancelling before the first charge costs nothing.
 */
export async function grantWelcomeGift(
  store: Pick<CreditsStore, 'welcomeGift'>,
  row: { organization_id: string; plan: string; first_paid_at: string | null } | null
) {
  if (!row?.first_paid_at) return 0;
  const credits = welcomeCreditsOf(row.plan);
  return credits > 0 ? store.welcomeGift(row.organization_id, credits) : 0;
}
