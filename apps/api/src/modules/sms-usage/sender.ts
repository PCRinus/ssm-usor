import {
  isRomanianNumber,
  type SmsReceipt,
  type SmsRefusalReason,
  type SmsService,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { adminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { type OverageSend, reportOverageLater } from './overage';
import { type SmsPolicy, smsPolicy, type SmsSubscription } from './policy';
import { type SmsKind, type SmsUsageStore, smsUsageStore } from './store';

export type SmsOutcome =
  | { sent: true; id: string; overage: boolean; receipt: SmsReceipt }
  | { sent: false; reason: SmsRefusalReason };

export type SmsSendInput = {
  organizationId: string;
  kind: SmsKind;
  to: string;
  deliver: (sms: SmsService) => Promise<SmsReceipt>;
};

const refusalMessages: Record<SmsRefusalReason, string> = {
  sms_trial: 'No SMS is sent during a trial without a plan; use an email address.',
  sms_foreign_number: 'SMS go to Romanian numbers (+40) only.',
  sms_allowance_reached: "This month's signing codes by SMS are used up.",
  sms_cap_reached: "This month's signing codes by SMS reached the safety cap.",
};

export function smsRefusalError(reason: SmsRefusalReason) {
  return new ApiError(
    reason === 'sms_foreign_number' ? 'unprocessable' : 'conflict',
    refusalMessages[reason],
    undefined,
    reason
  );
}

export function refusalOf(policy: SmsPolicy, to: string): SmsRefusalReason | null {
  if (!policy.sends) return 'sms_trial';
  if (!isRomanianNumber(to)) return 'sms_foreign_number';
  return null;
}

/**
 * The one way the API sends an SMS (ADR 029): a trial sends none, only +40 numbers get one, and
 * a signing code is counted against the month's allowance and cap before it leaves.
 */
export function createSmsSender(deps: {
  sms: SmsService | undefined;
  store: SmsUsageStore;
  onOverage: (send: OverageSend) => void;
  now?: () => Date;
}) {
  const now = () => deps.now?.() ?? new Date();

  return {
    subscription: (organizationId: string) => deps.store.subscription(organizationId),

    /** What a send would answer before anything is counted, for a caller that saves first. */
    async gate(organizationId: string, to: string, subscription?: SmsSubscription | null) {
      const row =
        subscription === undefined ? await deps.store.subscription(organizationId) : subscription;
      return refusalOf(smsPolicy(row, now()), to);
    },

    async send(input: SmsSendInput, subscription?: SmsSubscription | null): Promise<SmsOutcome> {
      if (!deps.sms) throw new Error('No SMS binding');
      const row =
        subscription === undefined
          ? await deps.store.subscription(input.organizationId)
          : subscription;
      const policy = smsPolicy(row, now());
      const refusal = refusalOf(policy, input.to);
      if (refusal || !policy.sends) return { sent: false, reason: refusal ?? 'sms_trial' };

      const counted = input.kind === 'signing_code';
      const claim = await deps.store.claim({
        organizationId: input.organizationId,
        kind: input.kind,
        period: policy.period,
        allowance: counted ? policy.allowance : null,
        cap: counted ? policy.cap : null,
      });
      if ('refusal' in claim) return { sent: false, reason: claim.refusal };

      let receipt: SmsReceipt;
      try {
        receipt = await input.deliver(deps.sms);
      } catch (error) {
        await deps.store
          .release(claim.id)
          .catch(() => console.error(`SMS ${claim.id} failed and stays counted.`));
        throw error;
      }

      const sentAt = now();
      try {
        await deps.store.markSent(claim.id, receipt.id, sentAt);
      } catch {
        // The message has left; the row still counts it, it only lacks the provider's id.
        console.error(`SMS ${claim.id} went out but was not marked sent.`);
        return { sent: true, id: claim.id, overage: claim.overage, receipt };
      }
      if (claim.overage && policy.bills && row?.stripe_customer_id) {
        deps.onOverage({ id: claim.id, sentAt, customerId: row.stripe_customer_id });
      }
      return { sent: true, id: claim.id, overage: claim.overage, receipt };
    },
  };
}

export type SmsSender = ReturnType<typeof createSmsSender>;

// Hono's executionCtx throws where the runtime gives none, as in tests.
function waitUntilOf(c: Context<ApiEnv>) {
  return (work: Promise<unknown>) => {
    try {
      c.executionCtx.waitUntil(work);
    } catch {
      void work;
    }
  };
}

export function smsSenderFor(env: ApiEnv['Bindings'], later: (work: Promise<unknown>) => void) {
  return createSmsSender({
    sms: env.SMS,
    store: smsUsageStore(adminClient(env)),
    onOverage: (send) => later(reportOverageLater(env, send)),
  });
}

export const smsSenderOf = (c: Context<ApiEnv>) => smsSenderFor(c.env, waitUntilOf(c));
