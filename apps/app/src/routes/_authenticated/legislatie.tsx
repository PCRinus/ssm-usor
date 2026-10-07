import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { LegislationPage } from '@/features/legislation/legislation-page';

export const Route = createFileRoute('/_authenticated/legislatie')({
  staticData: { title: 'Legislație' },
  component: LegislationRoute,
});

function LegislationRoute() {
  const { session } = useAuth();
  return <LegislationPage userId={session?.user.id ?? ''} />;
}
