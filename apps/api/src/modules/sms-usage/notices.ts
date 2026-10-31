import {
  type MailService,
  type PaidPlan,
  smsOverage,
  type SmsUsageNoticeKind,
  type SmsUsageState,
} from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { ownerEmail } from '../billing/store';
import { smsPolicy, type SmsSubscription } from './policy';
import type { SmsUsageStore } from './store';
import { smsUsageOf } from './usage';

// Only the highest threshold the count has reached is sent: a month that jumps past 80 % straight
// to 100 % hears of 100 % alone, and never of 80 % afterwards.
const noticeOfState: Partial<Record<SmsUsageState, SmsUsageNoticeKind>> = {
  near: 'sms_80',
  over: 'sms_100',
  stopped: 'sms_100',
  capped: 'sms_cap',
};

const planNames: Record<PaidPlan, string> = { start: 'Start', profesional: 'Profesional' };

export type NoticeRecipient = { to: string; organizationName: string };

export type UsageNoticeStore = Pick<SmsUsageStore, 'periodUsage' | 'recordNotice' | 'forgetNotice'>;

export function createUsageNotices(deps: {
  store: UsageNoticeStore;
  recipient: (organizationId: string) => Promise<NoticeRecipient | null>;
  mail: MailService | undefined;
  subscriptionUrl: () => string;
}) {
  return async function noticeAfterCount(
    organizationId: string,
    row: SmsSubscription | null,
    now: Date
  ): Promise<SmsUsageNoticeKind | null> {
    const policy = smsPolicy(row, now);
    if (!policy.sends || policy.allowance === null) return null;
    const usage = await smsUsageOf(deps.store, organizationId, row, now);
    const kind = noticeOfState[usage.state];
    if (!kind || usage.included === null || !usage.periodStart || !usage.periodEnd) return null;

    // Recorded before it is sent, so two codes counted at once, or a retry, send it once.
    const recorded = await deps.store.recordNotice(organizationId, usage.periodStart, kind);
    if (!recorded) return null;

    try {
      if (!deps.mail) throw new Error('No MAIL binding');
      const recipient = await deps.recipient(organizationId);
      if (!recipient) {
        console.error(`Organization ${organizationId} has no owner to tell of ${kind}.`);
        return kind;
      }
      await deps.mail.sendSmsUsageNotice({
        to: recipient.to,
        kind,
        organizationName: recipient.organizationName,
        planName: row?.stripe_subscription_id ? planNames[row.plan as PaidPlan] : null,
        billed: usage.cap !== null,
        used: usage.used,
        included: usage.included,
        cap: usage.cap,
        overageCents: smsOverage.price.unitAmount,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
        subscriptionUrl: deps.subscriptionUrl(),
      });
      return kind;
    } catch (error) {
      // Taken back so that the next code counted tries again.
      await deps.store.forgetNotice(organizationId, usage.periodStart, kind).catch(() => {
        console.error(`Usage notice ${kind} for ${organizationId} stays recorded, unsent.`);
      });
      throw error;
    }
  };
}

export type UsageNotices = ReturnType<typeof createUsageNotices>;

export async function noticeRecipient(
  db: AdminClient,
  organizationId: string
): Promise<NoticeRecipient | null> {
  const [to, organization] = await Promise.all([
    ownerEmail(db, organizationId),
    db.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
  ]);
  if (organization.error) throw fromDatabaseError(organization.error, 'notice organization');
  if (!to || !organization.data) return null;
  return { to, organizationName: organization.data.name };
}
