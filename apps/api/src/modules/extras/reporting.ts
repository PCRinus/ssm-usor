import { creditsExtra } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { adminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { errorMessage } from '../../lib/errors';
import { later } from '../../lib/later';
import { meterReporter } from '../billing/meter-reports';
import { stripeFor } from '../billing/stripe';
import { noticeDepsFor } from '../billing/usage-notices';
import type { CreditsHooks } from '../credits/store';
import { createExtrasNotices, extrasNoticeDeps } from './notices';

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

export const reportBlocks = blockMeter.sweep;

export const scheduledBlockReports = blockMeter.scheduled;

export function blocksReporter(env: ApiEnv['Bindings']) {
  return async (organizationId: string) => {
    const db = adminClient(env);
    if (env.STRIPE_SECRET_KEY?.trim()) {
      await reportBlocks({ db, stripe: stripeFor(env).stripe }, { organizationId });
    }
    const notices = createExtrasNotices(extrasNoticeDeps(db, noticeDepsFor(env, db)));
    await notices(organizationId, 'credits', new Date());
  };
}

/** For a request: the report runs after the response, so a slow Stripe never holds the import. */
export function blocksReporterOf(c: Context<ApiEnv>): CreditsHooks {
  const report = blocksReporter(c.env);
  return {
    blocksBought: (organizationId) => {
      const work = report(organizationId).catch((error: unknown) => {
        console.error(
          `Credit blocks of ${organizationId} not reported yet: ${errorMessage(error)}`
        );
      });
      later(c, work);
    },
  };
}
