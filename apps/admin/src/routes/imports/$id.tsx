import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { ImportDetailPage } from '@/features/imports/import-detail-page';

export const Route = createFileRoute('/imports/$id')({
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'admin'),
  component: ImportDetailRoute,
});

function ImportDetailRoute() {
  const { id } = Route.useParams();
  return <ImportDetailPage key={id} id={id} />;
}
