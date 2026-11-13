import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { ActsPage } from '@/features/legislation/acts-page';
import { actsSearchOf } from '@/features/legislation/api';

export const Route = createFileRoute('/legislation/acts')({
  validateSearch: actsSearchOf,
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'admin'),
  component: ActsRoute,
});

function ActsRoute() {
  return <ActsPage search={Route.useSearch()} />;
}
