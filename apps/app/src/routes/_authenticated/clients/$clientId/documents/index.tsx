import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '../../../../../auth/auth-context';
import { DocumentsCard } from '../../../../../documents/documents-card';

export const Route = createFileRoute('/_authenticated/clients/$clientId/documents/')({
  component: DocumentsPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function DocumentsPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="documents-page" className="grid gap-6">
      <DocumentsCard
        clientId={client.id}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
      />
    </div>
  );
}
