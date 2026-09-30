import { createFileRoute, redirect } from '@tanstack/react-router';

import { OnboardingPage } from '@/features/auth/onboarding-page';

// Where a signed-in account without an organization lands (ADR 004): after registering,
// after being removed from one, or before accepting an invitation. It sits outside the app
// shell, whose pages all need an organization.
export const Route = createFileRoute('/onboarding')({
  staticData: { title: 'Configurează organizația' },
  beforeLoad: async ({ context: { auth } }) => {
    await auth.ready;
    if (!auth.getSnapshot().session) throw redirect({ to: '/login', replace: true });
  },
  component: OnboardingPage,
});
