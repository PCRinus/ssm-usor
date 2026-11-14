import { createFileRoute } from '@tanstack/react-router';

import { BackLink, TitleWithBack } from '@/components/back-link';
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
      <div className="space-y-7">
        <TitleWithBack back={<BackLink to="/oferte" label="Înapoi la oferte" />}>
          <h1 className="text-3xl font-semibold tracking-tight">Ofertă nouă</h1>
        </TitleWithBack>
        <OffersPlanNotice>
          Ofertele noi și contractele lor se adaugă pe planul Profesional. Ofertele de până acum
          rămân în listă, de citit și de descărcat.
        </OffersPlanNotice>
      </div>
    );
  }
  return <ClientForm newStage="lead" />;
}
