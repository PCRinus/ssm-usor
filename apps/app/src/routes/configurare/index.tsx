import { createFileRoute } from '@tanstack/react-router';

import { OnboardingPage } from '@/features/auth/onboarding-page';

export const Route = createFileRoute('/configurare/')({
  staticData: { title: 'Configurează organizația' },
  component: OnboardingPage,
});
