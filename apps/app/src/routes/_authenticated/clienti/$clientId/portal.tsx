import { portalAccessStates } from '@ssm-usor/contracts';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { filterSearchSchema, idFilterSearchSchema } from '@/components/list-filters/url';
import { listPageSearchSchema } from '@/components/list-filters/use-list-search';
import { useAuth } from '@/features/auth/auth-context';
import { workplaceFilterSearch } from '@/features/employees/worker-filters';
import { ClientPortalPage } from '@/features/participants/client-portal-page';

const searchSchema = listPageSearchSchema(['name', 'portal']).extend({
  portal: filterSearchSchema(portalAccessStates),
  jobPosition: idFilterSearchSchema(),
  workplace: workplaceFilterSearch,
});

// Who of the client signs in to the portal and what waits for them there (ADR 022, ADR 023).
export const Route = createFileRoute('/_authenticated/clienti/$clientId/portal')({
  staticData: { title: 'Portal' },
  validateSearch: searchSchema,
  component: PortalRoute,
});

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

function PortalRoute() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return <ClientPortalPage client={client} />;
}
