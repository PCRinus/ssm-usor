import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/auth/auth-context';
import { ClientFilesCard } from '@/client-files/client-files-card';

export const Route = createFileRoute('/_authenticated/clients/$clientId/other-documents/')({
  component: OtherDocumentsPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function OtherDocumentsPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="other-documents-page" className="grid gap-6">
      <ClientFilesCard
        client={client}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
      />
    </div>
  );
}
