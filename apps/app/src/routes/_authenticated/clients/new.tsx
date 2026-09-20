import { createFileRoute } from '@tanstack/react-router';

import { ClientForm } from '../../../clients/client-form';

export const Route = createFileRoute('/_authenticated/clients/new')({
  staticData: { title: 'Client nou' },
  component: NewClientPage,
});

export function NewClientPage() {
  return <ClientForm />;
}
