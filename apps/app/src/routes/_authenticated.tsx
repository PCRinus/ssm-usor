import { createFileRoute, Navigate, notFound, redirect } from '@tanstack/react-router';

import { AppShell } from '@/app/app-shell';
import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';
import { requireSecondFactor } from '@/features/auth/second-factor';
import { AdminWithoutOrganizationPage } from '@/features/impersonation/admin-without-organization-page';
import { isPlatformAdmin } from '@/features/impersonation/platform-admin';

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
// query instead of leaving a disabled one in the emptied cache. A platform admin without one
// of his own has just stopped acting as a member, or is about to start: he is never sent to
// create an organization.
function MembershipGate() {
  const { session } = useAuth();
  const me = useMe();
  if (me.data?.membership === null) {
    if (isPlatformAdmin(session)) return <AdminWithoutOrganizationPage me={me.data} />;
    return <Navigate to="/configurare" replace />;
  }
  return <AppShell />;
}
