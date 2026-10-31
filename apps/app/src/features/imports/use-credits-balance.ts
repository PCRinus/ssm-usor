import { useMe } from '@/features/account/use-me';

import { creditsBalance } from './import-credits';

export function useCreditsBalance() {
  const me = useMe();
  return {
    balance: creditsBalance(me.data),
    isOwner: me.data?.membership?.role === 'owner' && !me.data.impersonation,
  };
}
