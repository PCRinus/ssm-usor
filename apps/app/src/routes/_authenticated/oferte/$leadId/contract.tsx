import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { BackLink } from '@/components/back-link';
import { useAuth } from '@/features/auth/auth-context';
import { useOffersInPlan } from '@/features/clients/offers-plan';
import { ServiceContractEditor } from '@/features/service-contracts/service-contract-editor';

export const Route = createFileRoute('/_authenticated/oferte/$leadId/contract')({
  staticData: { title: 'Contract', editorPage: true },
  component: LeadContractPage,
});

const leadRoute = getRouteApi('/_authenticated/oferte/$leadId');

function LeadContractPage() {
  const { lead } = leadRoute.useLoaderData();
  const { session } = useAuth();
  const offers = useOffersInPlan();
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  return (
    <ServiceContractEditor
      clientId={lead.id}
      companyName={lead.legalName}
      readOnly={lead.archivedAt !== null || !offers}
      readOnlyReason={
        lead.archivedAt === null && !offers
          ? {
              label: 'Doar de citit pe Start',
              title: 'Ofertele și contractele lor se modifică pe planul Profesional.',
            }
          : undefined
      }
      back={
        <BackLink
          to="/oferte/$leadId"
          params={{ leadId: lead.id }}
          data-testid="editor-back"
          label="Înapoi la ofertă"
        />
      }
    />
  );
}
