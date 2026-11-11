import { createFileRoute, getRouteApi, Navigate } from '@tanstack/react-router';

import { ClientForm } from '@/features/clients/client-form';

export const Route = createFileRoute('/_authenticated/oferte/$leadId/editare')({
  staticData: { title: 'Modifică' },
  component: EditLeadPage,
});

const leadRoute = getRouteApi('/_authenticated/oferte/$leadId');

function EditLeadPage() {
  const { lead } = leadRoute.useLoaderData();
  if (lead.archivedAt) {
    return <Navigate to="/oferte/$leadId" params={{ leadId: lead.id }} replace />;
  }
  // Keyed, so that the form starts again from the record if another one is opened.
  return <ClientForm key={lead.id} lead={lead} />;
}
