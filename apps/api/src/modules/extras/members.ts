import type { BillingCreditsUsage, BillingSmsUsage } from '@ssm-usor/contracts';

// The ceiling and the spend are the owner's (ADR 029): with the codes sent past the included ones,
// or the credits bought and left to buy, a member could work both out. A member keeps whether
// extras are on and the state the server computed from them.
export function smsForMember(sms: BillingSmsUsage): BillingSmsUsage {
  if (sms.overage === 0) return sms;
  return {
    ...sms,
    used: sms.included === null ? sms.used : Math.min(sms.used, sms.included),
    overage: 0,
  };
}

export function creditsForMember(credits: BillingCreditsUsage): BillingCreditsUsage {
  return { ...credits, extra: 0, extraLeft: 0 };
}
