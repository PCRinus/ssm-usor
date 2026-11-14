import { creditsExtra } from '@ssm-usor/contracts';
import type { Context } from 'hono';
import type Stripe from 'stripe';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import { type ApiEnv, appOrigin } from '../../lib/env';
import { stripeFor } from '../billing/stripe';
import type { CreditsHooks } from '../credits/store';
import { noticeRecipient } from '../sms-usage/notices';
import { createExtrasNotices, extrasNoticeDeps } from './notices';

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Stripe takes a meter event at most 35 days old; one that reaches it after the month's invoice
// is final is accepted and never billed, so a block is reported as soon as it is bought.
const meterWindowMs = 35 * 86_400_000;

type Deps = { db: AdminClient; stripe: Stripe };
type Block = { id: string; boughtAt: Date; customerId: string };

/**
 * Reports one block. Marked before Stripe is called and unmarked if the call fails, so a crash in
 * between bills a block too few rather than twice; the block's id as the event's identifier makes
 * a repeat within Stripe's 24 hours count once anyway.
 */
export async function reportBlock(deps: Deps, block: Block): Promise<boolean> {
  const marked = await deps.db
    .from('credit_extra_blocks')
    .update({ reported_at: new Date().toISOString() })
    .eq('id', block.id)
    .is('reported_at', null)
    .select('id');
  if (marked.error) throw fromDatabaseError(marked.error, 'credit block mark');
  if (marked.data.length === 0) return false;
  try {
    await deps.stripe.billing.meterEvents.create({
      event_name: creditsExtra.meterEventName,
      identifier: block.id,
      timestamp: Math.floor(block.boughtAt.getTime() / 1000),
      payload: { stripe_customer_id: block.customerId, value: '1' },
    });
  } catch (error) {
    const unmarked = await deps.db
      .from('credit_extra_blocks')
      .update({ reported_at: null })
      .eq('id', block.id);
    if (unmarked.error)
      console.error(`Block ${block.id} stays marked as reported, though it failed.`);
    throw error;
  }
  return true;
}

async function customersOf(db: AdminClient, organizationIds: string[]) {
  const { data, error } = await db
    .from('subscriptions')
    .select('organization_id, stripe_customer_id')
    .in('organization_id', organizationIds);
  if (error) throw fromDatabaseError(error, 'credit block customers');
  return new Map(data.map((row) => [row.organization_id, row.stripe_customer_id]));
}

export async function reportBlocks(
  deps: Deps,
  options: { organizationId?: string; olderThan?: Date; now?: Date } = {}
) {
  const now = options.now ?? new Date();
  let query = deps.db
    .from('credit_extra_blocks')
    .select('id, organization_id, created_at')
    .is('reported_at', null)
    .gt('created_at', new Date(now.getTime() - meterWindowMs).toISOString());
  if (options.organizationId) query = query.eq('organization_id', options.organizationId);
  if (options.olderThan) query = query.lt('created_at', options.olderThan.toISOString());
  const { data, error } = await query.order('created_at').limit(1000);
  if (error) throw fromDatabaseError(error, 'credit blocks unreported');
  if (data.length === 0) return { reported: 0, failed: 0 };

  const customerOf = await customersOf(deps.db, [
    ...new Set(data.map((row) => row.organization_id)),
  ]);
  let reported = 0;
  let failed = 0;
  for (const row of data) {
    const customerId = customerOf.get(row.organization_id);
    if (!customerId) {
      failed += 1;
      continue;
    }
    try {
      if (await reportBlock(deps, { id: row.id, boughtAt: new Date(row.created_at), customerId })) {
        reported += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`Credit block ${row.id} not reported: ${describe(error)}`);
    }
  }
  return { reported, failed };
}

export function blocksReporter(env: ApiEnv['Bindings']) {
  return async (organizationId: string) => {
    const db = adminClient(env);
    if (env.STRIPE_SECRET_KEY?.trim()) {
      await reportBlocks({ db, stripe: stripeFor(env).stripe }, { organizationId });
    }
    const notices = createExtrasNotices(
      extrasNoticeDeps(db, {
        recipient: (id) => noticeRecipient(db, id),
        mail: env.MAIL,
        subscriptionUrl: () => new URL('/organizatie/abonament', appOrigin(env)).href,
      })
    );
    await notices(organizationId, 'credits', new Date());
  };
}

// A block's own report runs right after the charge that bought it; the daily retry leaves it that
// long first.
const retryAfterMs = 10 * 60_000;

export async function scheduledBlockReports(env: ApiEnv['Bindings']) {
  if (!env.STRIPE_SECRET_KEY?.trim()) return;
  try {
    const now = new Date();
    const result = await reportBlocks(
      { db: adminClient(env), stripe: stripeFor(env).stripe },
      { olderThan: new Date(now.getTime() - retryAfterMs), now }
    );
    if (result.reported || result.failed) {
      console.log(`Credit blocks retried: ${result.reported} reported, ${result.failed} failed.`);
    }
  } catch (error) {
    console.error(`Credit block retry failed: ${describe(error)}`);
  }
}

/** For a request: the report runs after the response, so a slow Stripe never holds the import. */
export function blocksReporterOf(c: Context<ApiEnv>): CreditsHooks {
  const report = blocksReporter(c.env);
  return {
    blocksBought: (organizationId) => {
      const work = report(organizationId).catch((error: unknown) => {
        console.error(`Credit blocks of ${organizationId} not reported yet: ${describe(error)}`);
      });
      // Hono's executionCtx throws where the runtime gives none, as in tests.
      try {
        c.executionCtx.waitUntil(work);
      } catch {
        void work;
      }
    },
  };
}
