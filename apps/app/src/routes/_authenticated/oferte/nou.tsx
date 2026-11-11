import { createFileRoute } from '@tanstack/react-router';

import { ClientForm } from '@/features/clients/client-form';

export const Route = createFileRoute('/_authenticated/oferte/nou')({
  staticData: { title: 'Ofertă nouă' },
  component: NewLeadPage,
});

function NewLeadPage() {
  return <ClientForm newStage="lead" />;
}
