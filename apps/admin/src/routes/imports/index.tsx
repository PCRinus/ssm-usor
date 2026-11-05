import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { importsSearchOf } from '@/features/imports/api';
import { ImportsPage } from '@/features/imports/imports-page';

export const Route = createFileRoute('/imports/')({
  validateSearch: importsSearchOf,
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'admin'),
  component: ImportsRoute,
});

function ImportsRoute() {
  return <ImportsPage search={Route.useSearch()} />;
}
