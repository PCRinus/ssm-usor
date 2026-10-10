import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { FireSafetyMeansPage } from '@/features/fire-safety-means/fire-safety-means-page';
import { fireSafetyMeansFocus, focusSearch } from '@/features/missing-data/focus';

// A client's fire-fighting equipment and installations, per workplace (ADR 018).
export const Route = createFileRoute('/_authenticated/clients/$clientId/fire-safety-means')({
  staticData: { title: 'Mijloace PSI' },
  validateSearch: focusSearch(fireSafetyMeansFocus),
  component: FireSafetyMeansRoute,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function FireSafetyMeansRoute() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const { focus } = Route.useSearch();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <FireSafetyMeansPage
      clientId={client.id}
      userId={session.user.id}
      readOnly={client.archivedAt !== null}
      focus={focus === 'fire-equipment'}
    />
  );
}
