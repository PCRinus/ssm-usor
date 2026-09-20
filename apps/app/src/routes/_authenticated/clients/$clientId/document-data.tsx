import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '../../../../auth/auth-context';
import { DocumentDetailsCards } from '../../../../document-data/document-details-card';
import { ResponsiblePersonsCard } from '../../../../document-data/responsible-persons-card';
import { WorkplacesCard } from '../../../../document-data/workplaces-card';

// What a client's generated documentation prints beyond its registration data (ADR 005).
export const Route = createFileRoute('/_authenticated/clients/$clientId/document-data')({
  staticData: { title: 'Date pentru documente' },
  component: DocumentDataPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function DocumentDataPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="document-data-page" className="grid gap-6">
      {client.archivedAt && (
        <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
          Clientul este arhivat. Datele rămân vizibile, dar nu mai pot fi modificate.
        </p>
      )}
      <DocumentDetailsCards client={client} userId={session.user.id} />
      <WorkplacesCard
        client={client}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
      />
      <ResponsiblePersonsCard
        clientId={client.id}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
      />
    </div>
  );
}
