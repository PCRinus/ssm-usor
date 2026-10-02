import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { RiskLibrary } from '@/features/evaluation-profiles/risk-library';

export const Route = createFileRoute('/_authenticated/risks/')({
  component: RisksPage,
});

function RisksPage() {
  const { session } = useAuth();
  return <RiskLibrary userId={session?.user.id ?? ''} />;
}
