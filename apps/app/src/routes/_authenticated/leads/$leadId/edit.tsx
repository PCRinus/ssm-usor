import { createFileRoute, getRouteApi, Navigate } from '@tanstack/react-router';

import { ClientForm } from '../../../../clients/client-form';

export const Route = createFileRoute('/_authenticated/leads/$leadId/edit')({
  staticData: { title: 'Modifică' },
  component: EditLeadPage,
});

const leadRoute = getRouteApi('/_authenticated/leads/$leadId');

export function EditLeadPage() {
  const { lead } = leadRoute.useLoaderData();
  if (lead.archivedAt) {
    return <Navigate to="/leads/$leadId" params={{ leadId: lead.id }} replace />;
  }
  // Keyed, so that the form starts again from the record if another one is opened.
  return <ClientForm key={lead.id} client={lead} />;
}
