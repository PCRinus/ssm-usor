import { createFileRoute, redirect } from '@tanstack/react-router';

import { useAuth } from '../auth/auth-context';
import { AppShell } from '../components/app-shell';

// Pathless layout: every child route requires a session and renders inside the shell.
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
  return session ? <AppShell /> : null;
}
