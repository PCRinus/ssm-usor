import { useMe } from '@/features/account/use-me';

import { creditsBalance } from './import-credits';

export function useCreditsBalance() {
  const me = useMe();
  const isOwner = me.data?.membership?.role === 'owner' && !me.data.impersonation;
  return { balance: creditsBalance(me.data, { owner: isOwner }), isOwner };
}
