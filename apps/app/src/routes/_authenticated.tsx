import { createFileRoute, Navigate, redirect } from '@tanstack/react-router';

import { useMe } from '../account/use-me';
import { useAuth } from '../auth/auth-context';
import { AppShell } from '../components/app-shell';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context: { auth } }) => {
    await auth.ready;
    if (!auth.getSnapshot().session) throw redirect({ to: '/login', replace: true });
  },
  component: AuthenticatedLayout,
});

export function AuthenticatedLayout() {
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
  if (me.data?.membership === null) return <Navigate to="/onboarding" replace />;
  return <AppShell />;
}
