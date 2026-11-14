import { createFileRoute } from '@tanstack/react-router';

import { ClientForm } from '@/features/clients/client-form';
import { useOffersInPlan } from '@/features/clients/offers-plan';
import { OffersPlanNotice } from '@/features/clients/offers-plan-notice';

export const Route = createFileRoute('/_authenticated/oferte/nou')({
  staticData: { title: 'Ofertă nouă' },
  component: NewLeadPage,
});

function NewLeadPage() {
  const offers = useOffersInPlan();
  if (!offers) {
    return (
      <OffersPlanNotice>
        Ofertele noi și contractele lor se adaugă pe planul Profesional. Ofertele de până acum rămân
        în listă, de citit și de descărcat.
      </OffersPlanNotice>
    );
  }
  return <ClientForm newStage="lead" />;
}
