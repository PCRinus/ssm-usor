import { createFileRoute } from '@tanstack/react-router';

import { SigningPage } from '@/features/signing/signing-page';

export const Route = createFileRoute('/_participant/_portal/semneaza')({
  validateSearch: (search: Record<string, unknown>): { acord?: string; doar?: 'acte' } => ({
    ...(typeof search.acord === 'string' ? { acord: search.acord } : {}),
    ...(search.doar === 'acte' ? { doar: 'acte' as const } : {}),
  }),
  component: SigningRoute,
});

function SigningRoute() {
  const { acord, doar } = Route.useSearch();
  return <SigningPage agreementOnly={acord} agreementsOnly={doar === 'acte'} />;
}
