import { createFileRoute, getRouteApi, Navigate } from '@tanstack/react-router';

import { ClientForm } from '@/features/clients/client-form';

export const Route = createFileRoute('/_authenticated/clienti-potentiali/$leadId/editare')({
  staticData: { title: 'Modifică' },
  component: EditLeadPage,
});

const leadRoute = getRouteApi('/_authenticated/clienti-potentiali/$leadId');

function EditLeadPage() {
  const { lead } = leadRoute.useLoaderData();
  if (lead.archivedAt) {
    return <Navigate to="/clienti-potentiali/$leadId" params={{ leadId: lead.id }} replace />;
  }
  // Keyed, so that the form starts again from the record if another one is opened.
  return <ClientForm key={lead.id} lead={lead} />;
}
