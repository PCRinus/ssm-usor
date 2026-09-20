import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { ClientForm } from '../../../../clients/client-form';

export const Route = createFileRoute('/_authenticated/clients/$clientId/edit')({
  staticData: { title: 'Modifică clientul', fullPage: true },
  component: EditClientPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function EditClientPage() {
  const { client } = clientRoute.useLoaderData();
  // Keyed, so that the form starts again from the record if another one is opened.
  return <ClientForm key={client.id} client={client} />;
}
