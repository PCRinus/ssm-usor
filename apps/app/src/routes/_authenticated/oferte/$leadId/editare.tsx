import { createFileRoute, getRouteApi, Navigate } from '@tanstack/react-router';

import { ClientForm } from '@/features/clients/client-form';
import { useOffersInPlan } from '@/features/clients/offers-plan';

export const Route = createFileRoute('/_authenticated/oferte/$leadId/editare')({
  staticData: { title: 'Modifică' },
  component: EditLeadPage,
});

const leadRoute = getRouteApi('/_authenticated/oferte/$leadId');

function EditLeadPage() {
  const { lead } = leadRoute.useLoaderData();
  const offers = useOffersInPlan();
  if (lead.archivedAt || !offers) {
    return <Navigate to="/oferte/$leadId" params={{ leadId: lead.id }} replace />;
  }
  // Keyed, so that the form starts again from the record if another one is opened.
  return <ClientForm key={lead.id} lead={lead} />;
}
