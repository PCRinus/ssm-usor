import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { ChangeDetailPage } from '@/features/legislation/change-detail-page';

export const Route = createFileRoute('/legislation/changes/$id')({
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'admin'),
  component: ChangeRoute,
});

function ChangeRoute() {
  const { id } = Route.useParams();
  return <ChangeDetailPage key={id} id={id} />;
}
