import { smsOverage } from '@ssm-usor/contracts';
import type Stripe from 'stripe';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { stripeFor } from '../billing/stripe';

export type OverageSend = { id: string; sentAt: Date; customerId: string };

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Stripe takes a meter event at most 35 days old.
const meterWindowMs = 35 * 86_400_000;

// A send's own report runs right after it; the daily retry leaves it that long first.
const retryAfterMs = 10 * 60_000;

/**
 * Reports one billed code. The row is marked before Stripe is called and unmarked if the call
 * fails, so a crash in between bills a code too few rather than twice; within Stripe's 24 hours
 * the row id as identifier makes a repeat count once anyway.
 */
export async function reportOverage(
  deps: { db: AdminClient; stripe: Stripe },
  send: OverageSend
): Promise<boolean> {
  const marked = await deps.db
    .from('sms_sends')
    .update({ reported_at: new Date().toISOString() })
    .eq('id', send.id)
    .is('reported_at', null)
    .select('id');
  if (marked.error) throw fromDatabaseError(marked.error, 'sms overage mark');
  if (marked.data.length === 0) return false;
  try {
    await deps.stripe.billing.meterEvents.create({
      event_name: smsOverage.meterEventName,
      identifier: send.id,
      timestamp: Math.floor(send.sentAt.getTime() / 1000),
      payload: { stripe_customer_id: send.customerId, value: '1' },
    });
  } catch (error) {
    const unmarked = await deps.db
      .from('sms_sends')
      .update({ reported_at: null })
      .eq('id', send.id);
    if (unmarked.error) console.error(`SMS ${send.id} stays marked as reported, though it failed.`);
    throw error;
  }
  return true;
}

export function reportOverageLater(env: ApiEnv['Bindings'], send: OverageSend) {
  return (async () => {
    try {
      await reportOverage({ db: adminClient(env), stripe: stripeFor(env).stripe }, send);
    } catch (error) {
      console.error(`SMS overage ${send.id} not reported yet: ${describe(error)}`);
    }
  })();
}

export async function retryOverageReports(
  deps: { db: AdminClient; stripe: Stripe },
  now = new Date()
) {
  const { data, error } = await deps.db
    .from('sms_sends')
    .select('id, organization_id, sent_at')
    .eq('overage', true)
    .is('reported_at', null)
    .not('sent_at', 'is', null)
    .gt('sent_at', new Date(now.getTime() - meterWindowMs).toISOString())
    .lt('sent_at', new Date(now.getTime() - retryAfterMs).toISOString())
    .order('sent_at')
    .limit(1000);
  if (error) throw fromDatabaseError(error, 'sms overage unreported');
  if (data.length === 0) return { reported: 0, failed: 0 };

  const organizations = [...new Set(data.map((row) => row.organization_id))];
  const customers = await deps.db
    .from('subscriptions')
    .select('organization_id, stripe_customer_id')
    .in('organization_id', organizations);
  if (customers.error) throw fromDatabaseError(customers.error, 'sms overage customers');
  const customerOf = new Map(
    customers.data.map((row) => [row.organization_id, row.stripe_customer_id])
  );

  let reported = 0;
  let failed = 0;
  for (const row of data) {
    const customerId = customerOf.get(row.organization_id);
    if (!customerId) {
      failed += 1;
      continue;
    }
    try {
      if (await reportOverage(deps, { id: row.id, sentAt: new Date(row.sent_at!), customerId })) {
        reported += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`SMS overage ${row.id} not reported: ${describe(error)}`);
    }
  }
  return { reported, failed };
}

export async function scheduledOverageReports(env: ApiEnv['Bindings']) {
  if (!env.STRIPE_SECRET_KEY?.trim()) return;
  try {
    const result = await retryOverageReports({
      db: adminClient(env),
      stripe: stripeFor(env).stripe,
    });
    if (result.reported || result.failed) {
      console.log(`SMS overage retried: ${result.reported} reported, ${result.failed} failed.`);
    }
  } catch (error) {
    console.error(`SMS overage retry failed: ${describe(error)}`);
  }
}
