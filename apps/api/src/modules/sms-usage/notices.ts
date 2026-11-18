import {
  extraUnitsWithin,
  type PaidPlan,
  smsOverage,
  type SmsUsageNoticeKind,
  type SmsUsageState,
} from '@ssm-usor/contracts';

import type { EntitlementRow } from '../billing/entitlements';
import { type NoticeDeps, sendNoticeOnce } from '../billing/usage-notices';
import { smsPolicy } from './policy';
import type { SmsUsageStore } from './store';
import { smsUsageOf } from './usage';

// Only the highest threshold the count has reached is sent: a month that jumps past 80 % straight
// to 100 % hears of 100 % alone, and never of 80 % afterwards.
const noticeOfState: Partial<Record<SmsUsageState, SmsUsageNoticeKind>> = {
  near: 'sms_80',
  extra: 'sms_100',
  stopped: 'sms_100',
};

const planNames: Record<PaidPlan, string> = { start: 'Start', profesional: 'Profesional' };

export type SmsNoticeStore = Pick<SmsUsageStore, 'periodUsage' | 'smsCeiling'> &
  NoticeDeps['store'];

export function createUsageNotices(
  deps: NoticeDeps & { store: SmsNoticeStore; subscriptionUrl: () => string }
) {
  return async function noticeAfterCount(
    organizationId: string,
    row: EntitlementRow | null,
    now: Date
  ): Promise<SmsUsageNoticeKind | null> {
    const policy = smsPolicy(row, now);
    if (!policy.sends || policy.allowance === null) return null;
    const usage = await smsUsageOf(deps.store, organizationId, row, now);
    const kind = noticeOfState[usage.state];
    const { used, included, periodStart, periodEnd } = usage;
    if (!kind || included === null || !periodStart || !periodEnd) return null;

    const ceilingCents =
      policy.extraCents === null ? null : await deps.store.smsCeiling(organizationId);
    const extraCodes = ceilingCents === null ? null : extraUnitsWithin('sms', ceilingCents);

    const outcome = await sendNoticeOnce(
      deps,
      { organizationId, periodStart, kind, whenNoRecipient: 'keep' },
      (mail, recipient) =>
        mail.sendSmsUsageNotice({
          to: recipient.to,
          kind,
          organizationName: recipient.organizationName,
          planName: row?.stripe_subscription_id ? planNames[row.plan as PaidPlan] : null,
          billed: extraCodes !== null,
          used,
          included,
          cap: extraCodes === null ? null : included + extraCodes,
          overageCents: smsOverage.price.unitAmount,
          periodStart,
          periodEnd,
          subscriptionUrl: deps.subscriptionUrl(),
        })
    );
    return outcome === 'duplicate' ? null : kind;
  };
}

export type UsageNotices = ReturnType<typeof createUsageNotices>;
