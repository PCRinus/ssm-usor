import { creditsExtra } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { adminClient } from '../../lib/admin-db';
import { type ApiEnv, subscriptionUrl } from '../../lib/env';
import { later } from '../../lib/later';
import { type MeterDeps, meterReporter } from '../billing/meter-reports';
import { stripeFor } from '../billing/stripe';
import { noticeRecipient } from '../billing/usage-notices';
import type { CreditsHooks } from '../credits/store';
import { createExtrasNotices, extrasNoticeDeps } from './notices';

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Block = { id: string; boughtAt: Date; customerId: string };

const blockMeter = meterReporter({
  table: 'credit_extra_blocks',
  at: 'created_at',
  eventName: creditsExtra.meterEventName,
  context: 'credit block',
  labels: {
    row: 'Block',
    item: 'Credit block',
    retried: 'Credit blocks retried',
    retryFailed: 'Credit block retry failed',
  },
});

export const reportBlock = (deps: MeterDeps, block: Block) =>
  blockMeter.report(deps, { id: block.id, at: block.boughtAt, customerId: block.customerId });

export const reportBlocks = blockMeter.sweep;

export const scheduledBlockReports = blockMeter.scheduled;

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
        subscriptionUrl: () => subscriptionUrl(env),
      })
    );
    await notices(organizationId, 'credits', new Date());
  };
}

/** For a request: the report runs after the response, so a slow Stripe never holds the import. */
export function blocksReporterOf(c: Context<ApiEnv>): CreditsHooks {
  const report = blocksReporter(c.env);
  return {
    blocksBought: (organizationId) => {
      const work = report(organizationId).catch((error: unknown) => {
        console.error(`Credit blocks of ${organizationId} not reported yet: ${describe(error)}`);
      });
      later(c, work);
    },
  };
}
