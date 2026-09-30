import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { JobPositionsCard } from '@/features/job-positions/job-positions-card';
import { focusSearch, jobPositionsFocus } from '@/features/missing-data/focus';

export const Route = createFileRoute('/_authenticated/clients/$clientId/job-positions/')({
  validateSearch: focusSearch(jobPositionsFocus),
  component: JobPositionsPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function JobPositionsPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const { focus } = Route.useSearch();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="job-positions-page" className="grid gap-6">
      <JobPositionsCard
        clientId={client.id}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
        focus={focus}
      />
    </div>
  );
}
