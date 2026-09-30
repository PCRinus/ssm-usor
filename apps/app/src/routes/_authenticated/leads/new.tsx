import { createFileRoute } from '@tanstack/react-router';

import { ClientForm } from '@/features/clients/client-form';

export const Route = createFileRoute('/_authenticated/leads/new')({
  staticData: { title: 'Client potențial nou' },
  component: NewLeadPage,
});

export function NewLeadPage() {
  return <ClientForm newStage="lead" />;
}
