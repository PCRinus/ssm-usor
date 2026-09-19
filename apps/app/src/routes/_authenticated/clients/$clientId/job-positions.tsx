import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '../../../../auth/auth-context';
import { JobPositionsCard } from '../../../../job-positions/job-positions-card';

// The posts a client employs people in, as occupational safety sees them (ADR 006).
export const Route = createFileRoute('/_authenticated/clients/$clientId/job-positions')({
  staticData: { title: 'Posturi de lucru' },
  component: JobPositionsPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function JobPositionsPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="job-positions-page" className="grid gap-6">
      {client.archivedAt && (
        <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
          Clientul este arhivat. Posturile rămân vizibile, dar nu mai pot fi modificate.
        </p>
      )}
      <JobPositionsCard
        clientId={client.id}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
      />
    </div>
  );
}
