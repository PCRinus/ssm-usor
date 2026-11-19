import { createFileRoute } from '@tanstack/react-router';

import { riskLibrarySearchSchema } from '@/features/evaluation-profiles/profile-schema';
import { RiskLibrary } from '@/features/evaluation-profiles/risk-library';

export const Route = createFileRoute('/_authenticated/evaluari-de-risc/')({
  validateSearch: riskLibrarySearchSchema,
  component: RisksPage,
});

function RisksPage() {
  return <RiskLibrary search={Route.useSearch()} />;
}
