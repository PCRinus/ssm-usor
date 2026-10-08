import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { LegalChanges } from '@/features/legislation/legal-changes';

export const Route = createFileRoute('/_authenticated/legislatie/modificari')({
  staticData: { title: 'Modificări' },
  component: LegalChangesRoute,
});

function LegalChangesRoute() {
  const { session } = useAuth();
  return <LegalChanges userId={session?.user.id ?? ''} />;
}
