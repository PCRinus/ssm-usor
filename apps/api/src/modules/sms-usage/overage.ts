import { smsOverage } from '@ssm-usor/contracts';

import { adminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { errorMessage } from '../../lib/errors';
import { type MeterDeps, meterReporter } from '../billing/meter-reports';
import { stripeFor } from '../billing/stripe';

export type OverageSend = { id: string; sentAt: Date; customerId: string };

const overageMeter = meterReporter({
  table: 'sms_sends',
  at: 'sent_at',
  match: { overage: true },
  eventName: smsOverage.meterEventName,
  context: 'sms overage',
  labels: {
    row: 'SMS',
    item: 'SMS overage',
    retried: 'SMS overage retried',
    retryFailed: 'SMS overage retry failed',
  },
});

const reportOverage = (deps: MeterDeps, send: OverageSend) =>
  overageMeter.report(deps, { id: send.id, at: send.sentAt, customerId: send.customerId });

export const scheduledOverageReports = overageMeter.scheduled;

export function reportOverageLater(env: ApiEnv['Bindings'], send: OverageSend) {
  return (async () => {
    try {
      await reportOverage({ db: adminClient(env), stripe: stripeFor(env).stripe }, send);
    } catch (error) {
      const message = errorMessage(error);
      console.error(`SMS overage ${send.id} not reported yet: ${message}`);
    }
  })();
}
