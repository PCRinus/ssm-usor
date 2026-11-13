import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { changesSearchOf } from '@/features/legislation/api';
import { ChangesPage } from '@/features/legislation/changes-page';

export const Route = createFileRoute('/legislation/')({
  validateSearch: changesSearchOf,
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'admin'),
  component: ChangesRoute,
});

function ChangesRoute() {
  return <ChangesPage search={Route.useSearch()} />;
}
