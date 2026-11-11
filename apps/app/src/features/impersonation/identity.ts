import type { QueryClient } from '@tanstack/react-query';

import { getGetMeQueryKey, type MeResponse } from '@/api/generated/api';

const endedKey = 'ssm-usor:impersonation-ended';

export const identityPage = {
  openHome: () => window.location.replace('/'),
};

// The cache is keyed by the signed-in user, who stays the admin while the member he acts as
// changes, so only a fresh page cannot show one member's data under another.
export function leaveIdentity({ ended }: { ended: boolean }) {
  try {
    if (ended) sessionStorage.setItem(endedKey, '1');
    else sessionStorage.removeItem(endedKey);
  } catch {
    // Without storage the page after it says only that he acts as no member.
  }
  identityPage.openHome();
}

export function takeEndedImpersonation() {
  try {
    const ended = sessionStorage.getItem(endedKey) === '1';
    sessionStorage.removeItem(endedKey);
    return ended;
  } catch {
    return false;
  }
}

export function watchEffectiveIdentity(queryClient: QueryClient) {
  const [mePath] = getGetMeQueryKey();
  let seen: { userId: string; target: string | null } | undefined;
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    if (event.query.queryKey[0] !== mePath) return;
    const me = event.query.state.data as MeResponse | undefined;
    if (!me?.user) return;
    const current = { userId: me.user.id, target: me.impersonation?.targetMemberId ?? null };
    const before = seen;
    seen = current;
    if (!before || before.userId !== current.userId || before.target === current.target) return;
    leaveIdentity({ ended: current.target === null });
  });
}
