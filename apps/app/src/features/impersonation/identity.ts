import type { QueryClient } from '@tanstack/react-query';

import { getGetMeQueryKey, type MeResponse } from '@/api/generated/api';

import { actingAsSelf } from './acting-as';

const endedKey = 'ssm-usor:impersonation-ended';

export const identityPage = {
  openHome: () => window.location.replace('/'),
};

// Read once, when the page starts, so that a page that never shows it cannot leave it behind for
// an unrelated visit later.
function takeEndedMark() {
  try {
    const ended = sessionStorage.getItem(endedKey) === '1';
    sessionStorage.removeItem(endedKey);
    return ended;
  } catch {
    return false;
  }
}

function markEnded(ended: boolean) {
  try {
    if (ended) sessionStorage.setItem(endedKey, '1');
    else sessionStorage.removeItem(endedKey);
  } catch {
    // Without storage the page after it says only that he acts as no member.
  }
}

export const actingAsOf = (me: Pick<MeResponse, 'impersonation'>) =>
  me.impersonation?.targetMemberId ?? actingAsSelf;

export type PageIdentity = ReturnType<typeof createPageIdentity>;

/**
 * Whom this page was built for: the member a platform admin acts as, or himself, from the first
 * `/me` of the page load. The cache is keyed by the signed-in user, who stays the admin while the
 * member he acts as changes, so only a fresh page cannot show one member's data under another.
 */
export function createPageIdentity({
  queryClient,
  userId,
  isPlatformAdmin,
  readMe,
}: {
  queryClient: QueryClient;
  userId: () => string | undefined;
  isPlatformAdmin: () => boolean;
  readMe: () => Promise<MeResponse>;
}) {
  const endedOnArrival = takeEndedMark();
  const builtFor = new Map<string, string>();
  let leaving: { ended: boolean } | null = null;
  let checking = false;
  const listeners = new Set<() => void>();

  // The blocking state comes first: a page with unsaved changes asks before it unloads, and
  // whoever stays must not be left with a page that still works.
  function leave(ended: boolean) {
    leaving = { ended };
    listeners.forEach((listener) => listener());
    markEnded(ended);
    identityPage.openHome();
  }

  function compare(me: MeResponse | undefined) {
    if (!me?.user) return false;
    const now = actingAsOf(me);
    const first = builtFor.get(me.user.id);
    if (first === undefined) {
      builtFor.set(me.user.id, now);
      return false;
    }
    if (first === now) return false;
    leave(first !== actingAsSelf && now === actingAsSelf);
    return true;
  }

  async function identityChanged() {
    if (checking) return;
    checking = true;
    if (!leaving) {
      leaving = { ended: false };
      listeners.forEach((listener) => listener());
    }
    try {
      if (!compare(await readMe())) leave(false);
    } catch {
      leave(false);
    } finally {
      checking = false;
    }
  }

  const [mePath] = getGetMeQueryKey();
  const unwatch = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    if (event.query.queryKey[0] !== mePath) return;
    compare(event.query.state.data as MeResponse | undefined);
  });

  // The admin app starts, switches and ends it in another window, often side by side with this
  // one, where the tab never turns hidden.
  function askAgain() {
    if (!isPlatformAdmin()) return;
    if (leaving) {
      readMe().then(compare, () => undefined);
      return;
    }
    void queryClient.refetchQueries(
      { queryKey: getGetMeQueryKey(), type: 'active' },
      { cancelRefetch: false }
    );
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible') askAgain();
  };
  window.addEventListener('focus', askAgain);
  window.addEventListener('pageshow', askAgain);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    endedOnArrival,
    header() {
      const id = userId();
      return id === undefined ? undefined : builtFor.get(id);
    },
    identityChanged: () => void identityChanged(),
    leave,
    reload: () => leave(leaving?.ended ?? false),
    leaving: () => leaving,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      unwatch();
      window.removeEventListener('focus', askAgain);
      window.removeEventListener('pageshow', askAgain);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
