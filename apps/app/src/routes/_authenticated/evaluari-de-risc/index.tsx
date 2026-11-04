import { createFileRoute } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { riskLibrarySearchSchema } from '@/features/evaluation-profiles/profile-schema';
import { RiskLibrary } from '@/features/evaluation-profiles/risk-library';

export const Route = createFileRoute('/_authenticated/evaluari-de-risc/')({
  validateSearch: riskLibrarySearchSchema,
  component: RisksPage,
});

function RisksPage() {
  const { session } = useAuth();
  return <RiskLibrary search={Route.useSearch()} userId={session?.user.id ?? ''} />;
}
