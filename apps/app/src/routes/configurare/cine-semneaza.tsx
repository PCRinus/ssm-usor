import { createFileRoute } from '@tanstack/react-router';

import { SignatoryStep } from '@/features/auth/onboarding-steps';

export const Route = createFileRoute('/configurare/cine-semneaza')({
  staticData: { title: 'Cine semnează' },
  component: SignatoryStep,
});
