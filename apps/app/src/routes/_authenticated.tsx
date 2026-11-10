import { createFileRoute, Navigate, notFound, redirect } from '@tanstack/react-router';

import { AppShell } from '@/app/app-shell';
import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';
import { requireSecondFactor } from '@/features/auth/second-factor';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context: { auth }, location, matches }) => {
    await auth.ready;
    if (!auth.getSnapshot().session) {
      // An unknown address is not found for everyone, not a sign-in prompt.
      if (matches.at(-1)?.routeId === '/_authenticated/$') throw notFound();
      throw redirect({ to: '/autentificare', replace: true });
    }
    await requireSecondFactor(auth, location.href);
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session } = useAuth();
  // Hide stale content immediately while the router rechecks a changed session.
  return session ? <MembershipGate /> : null;
}

// Every page in the shell needs an organization. An account the API reports as having none
// sets one up first; while that is unknown, or the request failed, the shell shows and its
// pages report the failure. A component of its own, so that signing out unmounts the account
// query instead of leaving a disabled one in the emptied cache.
function MembershipGate() {
  const me = useMe();
  if (me.data?.membership === null) return <Navigate to="/configurare" replace />;
  return <AppShell />;
}
