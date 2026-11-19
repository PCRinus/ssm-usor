import type { BillingChoice, BillingOverview } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';

import { getGetBillingQueryKey, getGetMeQueryKey, useGetBilling } from '@/api/generated/api';
import { useApi } from '@/api/use-api';

export type BillingSubscription = NonNullable<BillingOverview['subscription']>;
export type BillingOwner = NonNullable<BillingOverview['owner']>;

export function useBilling({ refetchOnWindowFocus = true } = {}) {
  const { request, key } = useApi();
  return useGetBilling({
    request,
    query: { queryKey: key(getGetBillingQueryKey()), refetchOnWindowFocus },
  });
}

export const billingPreviewKey = ['billing-preview'] as const;

// The plan badge and the bars read the subscription from the account, so both refresh; a
// preview priced against the subscription before the change is stale too.
export function refreshBilling(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: getGetBillingQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    queryClient.invalidateQueries({ queryKey: billingPreviewKey }),
  ]);
}

export type SubscriptionView =
  'none' | 'enterprise' | 'trial' | 'trialChosen' | 'active' | 'canceling' | 'pastDue' | 'readOnly';

export function viewOf(subscription: BillingSubscription | null): SubscriptionView {
  if (!subscription) return 'none';
  if (subscription.access === 'read_only') return 'readOnly';
  if (subscription.plan === 'enterprise') return 'enterprise';
  switch (subscription.status) {
    case 'trialing':
      return subscription.planChosen ? 'trialChosen' : 'trial';
    case 'past_due':
      return subscription.cancelsAt ? 'canceling' : 'pastDue';
    case 'active':
      return subscription.cancelsAt ? 'canceling' : 'active';
    case 'canceled':
      return 'canceling';
  }
}

// A Stripe subscription that still renews or retries: changed with PATCH, never bought again.
export function hasLiveSubscription(subscription: BillingSubscription | null) {
  return Boolean(subscription?.planChosen) && subscription?.status !== 'canceled';
}

export function currentChoice(subscription: BillingSubscription | null): BillingChoice | null {
  if (
    !subscription?.planChosen ||
    subscription.plan === 'enterprise' ||
    !subscription.interval ||
    subscription.step === null
  ) {
    return null;
  }
  return { plan: subscription.plan, step: subscription.step, interval: subscription.interval };
}
