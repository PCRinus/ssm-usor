import type {
  BillingCreditsUsage,
  BillingExtra,
  BillingExtras,
  BillingSmsUsage,
  ExtraKind,
} from '@ssm-usor/contracts';

import { extraSpend, extrasUnavailable } from './policy';
import type { Ceilings } from './store';

const hidden: Omit<BillingExtra, 'enabled'> = {
  ceilingCents: null,
  limit: null,
  used: null,
  spentCents: null,
};

export function extrasView(input: {
  row: Parameters<typeof extrasUnavailable>[0];
  ceilings: Ceilings;
  sms: Pick<BillingSmsUsage, 'overage'>;
  credits: Pick<BillingCreditsUsage, 'extra'>;
  owner: boolean;
}): BillingExtras {
  const unavailable = extrasUnavailable(input.row);
  const kind = (name: ExtraKind, used: number): BillingExtra => {
    const ceilingCents = input.ceilings[name];
    const enabled = ceilingCents !== null;
    if (!input.owner) return { enabled, ...hidden };
    if (!enabled) {
      const spend = extraSpend(name, 0, used);
      return { enabled, ceilingCents: null, limit: null, used, spentCents: spend.spentCents };
    }
    return { enabled, ceilingCents, ...extraSpend(name, ceilingCents, used) };
  };
  return {
    unavailable,
    sms: kind('sms', input.sms.overage),
    credits: kind('credits', input.credits.extra),
  };
}
