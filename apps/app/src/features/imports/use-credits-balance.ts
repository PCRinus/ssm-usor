import { useMe } from '@/features/account/use-me';
import { useBilling } from '@/features/subscription/use-billing';

import { creditsBalance } from './import-credits';

export function useCreditsBalance() {
  const billing = useBilling();
  const me = useMe();
  return {
    balance: creditsBalance(billing.data),
    isOwner: me.data?.membership?.role === 'owner' && !me.data.impersonation,
  };
}
