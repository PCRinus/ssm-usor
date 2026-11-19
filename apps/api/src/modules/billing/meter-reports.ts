import type Stripe from 'stripe';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { errorMessage } from '../../lib/errors';
import { stripeFor } from './stripe';

export type MeterDeps = { db: AdminClient; stripe: Stripe };
type MeterItem = { id: string; at: Date; customerId: string };
type MeterSweep = { organizationId?: string; olderThan?: Date; now?: Date };

// Stripe takes a meter event at most 35 days old; one that reaches it after the month's invoice
// is final is accepted and never billed, so a row is reported as soon as it is written.
const meterWindowMs = 35 * 86_400_000;

// A row's own report runs right after it is written; the daily retry leaves it that long first.
const retryAfterMs = 10 * 60_000;

type MeterSource =
  | { table: 'sms_sends'; at: 'sent_at'; match: { overage: true } }
  | { table: 'credit_extra_blocks'; at: 'created_at'; match?: undefined };

type Pending = { id: string; organization_id: string } & Record<MeterSource['at'], string>;

type Labels = { row: string; item: string; retried: string; retryFailed: string };

/**
 * Each row is one meter event named by the row's id. The row is marked before Stripe is called
 * and unmarked if the call fails, so a crash in between bills one too few rather than twice; within
 * Stripe's 24 hours the id as identifier makes a repeat count once anyway.
 */
export function meterReporter(
  options: MeterSource & { eventName: string; context: string; labels: Labels }
) {
  const { table, at, eventName, context, labels } = options;

  async function report(deps: MeterDeps, item: MeterItem): Promise<boolean> {
    const marked = await deps.db
      .from(table)
      .update({ reported_at: new Date().toISOString() })
      .eq('id', item.id)
      .is('reported_at', null)
      .select('id');
    if (marked.error) throw fromDatabaseError(marked.error, `${context} mark`);
    if (marked.data.length === 0) return false;
    try {
      await deps.stripe.billing.meterEvents.create({
        event_name: eventName,
        identifier: item.id,
        timestamp: Math.floor(item.at.getTime() / 1000),
        payload: { stripe_customer_id: item.customerId, value: '1' },
      });
    } catch (error) {
      const unmarked = await deps.db.from(table).update({ reported_at: null }).eq('id', item.id);
      if (unmarked.error) {
        console.error(`${labels.row} ${item.id} stays marked as reported, though it failed.`);
      }
      throw error;
    }
    return true;
  }

  async function unreported(db: AdminClient, filter: MeterSweep, now: Date) {
    let query = db.from(table).select(`id, organization_id, ${at}`);
    if (options.match) query = query.match(options.match);
    query = query
      .is('reported_at', null)
      .gt(at, new Date(now.getTime() - meterWindowMs).toISOString());
    if (filter.organizationId) query = query.eq('organization_id', filter.organizationId);
    if (filter.olderThan) query = query.lt(at, filter.olderThan.toISOString());
    const { data, error } = await query.order(at).limit(1000).returns<Pending[]>();
    if (error) throw fromDatabaseError(error, `${context} unreported`);
    return data;
  }

  async function sweep(deps: MeterDeps, filter: MeterSweep = {}) {
    const now = filter.now ?? new Date();
    const rows = await unreported(deps.db, filter, now);
    if (rows.length === 0) return { reported: 0, failed: 0 };

    const customers = await deps.db
      .from('subscriptions')
      .select('organization_id, stripe_customer_id')
      .in('organization_id', [...new Set(rows.map((row) => row.organization_id))]);
    if (customers.error) throw fromDatabaseError(customers.error, `${context} customers`);
    const customerOf = new Map(
      customers.data.map((row) => [row.organization_id, row.stripe_customer_id])
    );

    let reported = 0;
    let failed = 0;
    for (const row of rows) {
      const customerId = customerOf.get(row.organization_id);
      if (!customerId) {
        failed += 1;
        continue;
      }
      try {
        if (await report(deps, { id: row.id, at: new Date(row[at]), customerId })) reported += 1;
      } catch (error) {
        failed += 1;
        console.error(`${labels.item} ${row.id} not reported: ${errorMessage(error)}`);
      }
    }
    return { reported, failed };
  }

  const retry = (deps: MeterDeps, now = new Date()) =>
    sweep(deps, { olderThan: new Date(now.getTime() - retryAfterMs), now });

  async function scheduled(env: ApiEnv['Bindings']) {
    if (!env.STRIPE_SECRET_KEY?.trim()) return;
    try {
      const result = await retry({ db: adminClient(env), stripe: stripeFor(env).stripe });
      if (result.reported || result.failed) {
        console.log(`${labels.retried}: ${result.reported} reported, ${result.failed} failed.`);
      }
    } catch (error) {
      console.error(`${labels.retryFailed}: ${errorMessage(error)}`);
    }
  }

  return { report, sweep, retry, scheduled };
}
