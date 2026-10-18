import { createFileRoute } from '@tanstack/react-router';

import { SigningPage } from '@/features/signing/signing-page';

export const Route = createFileRoute('/_participant/_portal/semneaza')({
  validateSearch: (search: Record<string, unknown>): { acord?: string } =>
    typeof search.acord === 'string' ? { acord: search.acord } : {},
  component: SigningRoute,
});

function SigningRoute() {
  return <SigningPage agreementOnly={Route.useSearch().acord} />;
}
