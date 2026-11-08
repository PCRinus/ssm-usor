import { createFileRoute } from '@tanstack/react-router';

import { ContractStep } from '@/features/auth/onboarding-steps';

export const Route = createFileRoute('/configurare/contract')({
  staticData: { title: 'Datele pentru contract' },
  component: ContractStep,
});
