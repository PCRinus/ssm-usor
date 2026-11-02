import { createFileRoute } from '@tanstack/react-router';

import { ClientForm } from '@/features/clients/client-form';

export const Route = createFileRoute('/_authenticated/clienti/nou')({
  staticData: { title: 'Client nou' },
  component: NewClientPage,
});

function NewClientPage() {
  return <ClientForm />;
}
