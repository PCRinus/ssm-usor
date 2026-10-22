import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useAuth } from '@/features/auth/auth-context';
import { ClientPortalPage } from '@/features/participants/client-portal-page';

// Who of the client signs in to the portal and what waits for them there (ADR 022, ADR 023).
export const Route = createFileRoute('/_authenticated/clients/$clientId/portal')({
  staticData: { title: 'Portal' },
  component: PortalRoute,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function PortalRoute() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return <ClientPortalPage client={client} userId={session.user.id} />;
}
