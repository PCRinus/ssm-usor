import type { ExtraKind } from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { type EntitlementRow, loadEntitlementRow } from '../billing/entitlements';
import { type NoticeDeps, sendNoticeOnce, usageNoticeStore } from '../billing/usage-notices';
import { creditPolicy } from '../credits/policy';
import { creditsStore } from '../credits/store';
import { smsPolicy } from '../sms-usage/policy';
import { smsUsageStore } from '../sms-usage/store';
import { extraLevel, extraSpend, extrasUnavailable } from './policy';
import { extrasStore } from './store';

export type ExtrasMonth = {
  periodStart: string;
  periodEnd: string;
  used: number;
};

export type ExtrasNoticeDeps = NoticeDeps & {
  subscription: (organizationId: string) => Promise<EntitlementRow | null>;
  ceiling: (organizationId: string, kind: ExtraKind) => Promise<number | null>;
  month: (
    organizationId: string,
    kind: ExtraKind,
    row: EntitlementRow,
    now: Date
  ) => Promise<ExtrasMonth | null>;
  subscriptionUrl: () => string;
};

/**
 * Emails the owner at 80 % of what a ceiling buys and when nothing more fits under it, once per
 * kind, level and month (ADR 029). Only the highest level reached is sent, as for the allowance.
 */
export function createExtrasNotices(deps: ExtrasNoticeDeps) {
  return async function noticeAfterExtra(organizationId: string, kind: ExtraKind, now: Date) {
    const row = await deps.subscription(organizationId);
    if (extrasUnavailable(row) !== null || !row) return null;
    const ceilingCents = await deps.ceiling(organizationId, kind);
    if (ceilingCents === null) return null;
    const month = await deps.month(organizationId, kind, row, now);
    if (!month) return null;
    const spend = extraSpend(kind, ceilingCents, month.used);
    const level = extraLevel(spend);
    if (level === 'ok') return null;

    const notice = `${kind}_extra${level === 'near' ? '80' : '100'}`;
    const outcome = await sendNoticeOnce(
      deps,
      { organizationId, periodStart: month.periodStart, kind: notice, whenNoRecipient: 'keep' },
      (mail, recipient) =>
        mail.sendExtrasNotice({
          to: recipient.to,
          kind,
          level,
          organizationName: recipient.organizationName,
          ceilingCents,
          spentCents: spend.spentCents,
          used: spend.used,
          limit: spend.limit,
          periodEnd: month.periodEnd,
          subscriptionUrl: deps.subscriptionUrl(),
        })
    );
    return outcome === 'duplicate' ? null : notice;
  };
}

export type ExtrasNotices = ReturnType<typeof createExtrasNotices>;

export function extrasNoticeDeps(
  db: AdminClient,
  rest: Pick<ExtrasNoticeDeps, 'recipient' | 'mail' | 'subscriptionUrl'>
): ExtrasNoticeDeps {
  const sms = smsUsageStore(db);
  const credits = creditsStore(db);
  const extras = extrasStore(db);
  return {
    subscription: (organizationId) => loadEntitlementRow(db, organizationId),
    ceiling: async (organizationId, kind) => (await extras.ceilings(organizationId))[kind],
    async month(organizationId, kind, row, now) {
      if (kind === 'sms') {
        const policy = smsPolicy(row, now);
        if (!policy.sends) return null;
        const counts = await sms.periodUsage(organizationId, policy.period);
        return {
          periodStart: policy.period.start.toISOString(),
          periodEnd: policy.period.end.toISOString(),
          used: counts.overage,
        };
      }
      const policy = creditPolicy(row, now);
      const balance = await credits.balance(organizationId, policy);
      return {
        periodStart: policy.period.start.toISOString(),
        periodEnd: policy.period.end.toISOString(),
        used: balance.extra,
      };
    },
    store: usageNoticeStore(db),
    ...rest,
  };
}
