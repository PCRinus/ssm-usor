import {
  type BillingCreditsUsage,
  type CreditsShort,
  type CreditsUsageState,
  type ImportCredits,
  importCredits,
  type ImportLibraryPart,
  instructionsPartDomains,
  isInstructionsPart,
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
  const sum = (kinds: string[], of: (entry: ImportCreditEntry) => boolean = () => true) =>
    entries
      .filter((entry) => kinds.includes(entry.kind) && of(entry))
      .reduce((total, entry) => total + entry.credits, 0);
  const risks = (entry: ImportCreditEntry) => entry.import_part === 'risk_evaluations';
  return {
    used: Math.max(
      0,
      -sum([
        'import_start',
        'import_pages',
        'scanned_page',
        'refund',
        'library_part',
        'library_part_refund',
      ])
    ),
    atStart: Math.max(0, -sum(['import_start', 'import_pages'])),
    scannedPages: entries.filter((entry) => entry.kind === 'scanned_page').length,
    ownInstructions: Math.max(
      0,
      -sum(['library_part', 'library_part_refund'], (entry) => !risks(entry))
    ),
    riskEvaluations: Math.max(0, -sum(['library_part', 'library_part_refund'], risks)),
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

    /**
     * One reading of a library part, when its request is sent, never refused: an import that has
     * started is never stopped for credits (ADR 030, ADR 034). The key is the database's
     * `library_part_charge_key`, so a redelivery is charged once and a reading again anew.
     */
    async libraryPart(
      organizationId: string,
      importId: string,
      part: ImportLibraryPart,
      attempt: number
    ) {
      await store.charge({
        organizationId,
        policy: await policyOf(organizationId),
        kind: 'library_part',
        credits: isInstructionsPart(part)
          ? importCredits.ownInstructions[instructionsPartDomains[part]]
          : importCredits.riskEvaluations,
        importId,
        importPart: part,
        key: `library:${importId}:${part}:${attempt}`,
        require: false,
      });
    },

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
 * One reading of a safety data sheet, refused unless the balance covers it, and given back when
 * it fails or the file is refused (ADR 030).
 */
export function safetySheetCharges(store: CreditsStore, now: () => Date = () => new Date()) {
  return {
    async charge(organizationId: string, key: string): Promise<StartCharge> {
      const policy = creditPolicy(await store.subscription(organizationId), now());
      const credits = importCredits.safetySheet;
      const result = await store.charge({
        organizationId,
        policy,
        kind: 'safety_sheet',
        credits,
        importId: null,
        key,
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
    refund: (key: string) => store.refundSafetySheet(key),
  };
}

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
