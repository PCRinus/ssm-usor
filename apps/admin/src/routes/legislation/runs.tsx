import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { runsSearchOf } from '@/features/legislation/api';
import { RunsPage } from '@/features/legislation/runs-page';

export const Route = createFileRoute('/legislation/runs')({
  validateSearch: runsSearchOf,
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'admin'),
  component: RunsRoute,
});

function RunsRoute() {
  return <RunsPage search={Route.useSearch()} />;
}
