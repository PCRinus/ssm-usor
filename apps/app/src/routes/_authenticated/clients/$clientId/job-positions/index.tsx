import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '../../../../../auth/auth-context';
import { JobPositionsCard } from '../../../../../job-positions/job-positions-card';

export const Route = createFileRoute('/_authenticated/clients/$clientId/job-positions/')({
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
      <JobPositionsCard
        clientId={client.id}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
      />
    </div>
  );
}
