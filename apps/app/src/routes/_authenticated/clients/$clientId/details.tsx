import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';
import { CompanyCard } from '@/features/clients/company-card';
import { ContactCard } from '@/features/clients/contact-card';
import { LegalRepresentativeCard } from '@/features/clients/legal-representative-card';
import { OwnerNotesCard } from '@/features/clients/owner-notes-card';
import { WorkplacesCard } from '@/features/clients/workplaces-card';
import {
  clientDetailsFocus,
  companyFocus,
  focusAmong,
  focusSearch,
  legalRepresentativeFocus,
} from '@/features/missing-data/focus';

export const Route = createFileRoute('/_authenticated/clients/$clientId/details')({
  staticData: { title: 'Detalii' },
  validateSearch: focusSearch(clientDetailsFocus),
  component: ClientDetailsPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function ClientDetailsPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const isOwner = useMe().data?.membership?.role === 'owner';
  const { focus } = Route.useSearch();
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  const userId = session.user.id;
  const readOnly = client.archivedAt !== null;

  return (
    <div data-testid="client-details-page" className="grid gap-6">
      <CompanyCard client={client} readOnly={readOnly} focus={focusAmong(focus, companyFocus)} />
      <LegalRepresentativeCard
        client={client}
        userId={userId}
        focus={focusAmong(focus, legalRepresentativeFocus)}
      />
      <WorkplacesCard client={client} userId={userId} readOnly={readOnly} />
      <ContactCard client={client} readOnly={readOnly} />
      {isOwner && <OwnerNotesCard clientId={client.id} userId={userId} readOnly={readOnly} />}
    </div>
  );
}
