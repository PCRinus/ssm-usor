import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { requireSecondFactor } from '@/features/auth/second-factor';

// Where a signed-in account without an organization lands (ADR 004): after registering,
// after being removed from one, or before accepting an invitation. It sits outside the app
// shell, whose pages all need an organization; the optional steps after it have addresses of
// their own, so a reload keeps the new owner in the flow.
export const Route = createFileRoute('/configurare')({
  beforeLoad: async ({ context: { auth }, location }) => {
    await auth.ready;
    if (!auth.getSnapshot().session) throw redirect({ to: '/autentificare', replace: true });
    await requireSecondFactor(auth, location.href);
  },
  component: Outlet,
});
