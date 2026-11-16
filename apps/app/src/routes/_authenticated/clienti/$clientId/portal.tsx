import { portalAccessStates, sortOrderSchema } from '@ssm-usor/contracts';
import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { z } from 'zod';

import { filterSearchSchema, idFilterSearchSchema } from '@/components/list-filters/url';
import { useAuth } from '@/features/auth/auth-context';
import { ClientPortalPage } from '@/features/participants/client-portal-page';

const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(['name', 'portal']).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  portal: filterSearchSchema(portalAccessStates),
  jobPosition: idFilterSearchSchema(),
  workplace: idFilterSearchSchema(),
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

  return <ClientPortalPage client={client} userId={session.user.id} />;
}
