import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';
import { CompanyPeoplePanel } from '@/features/clients/details/company-people-panel';
import { NotesPanel } from '@/features/clients/details/notes-panel';
import { WorkplacesCard } from '@/features/clients/workplaces-card';
import { ImportedNotice } from '@/features/imports/imported-notice';
import { ClientImportsCard } from '@/features/imports/library/client-imports-card';
import { useClientImportGroups } from '@/features/imports/library/use-confirmed-client-imports';
import { WaitingImportPanel } from '@/features/imports/library/waiting-import-panel';
import {
  clientDetailsFocus,
  companyFocus,
  focusAmong,
  focusSearch,
  legalRepresentativeFocus,
  workplacesFocus,
} from '@/features/missing-data/focus';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/detalii')({
  staticData: { title: 'Detalii' },
  validateSearch: focusSearch(clientDetailsFocus),
  component: ClientDetailsPage,
});

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

function ClientDetailsPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const isOwner = useMe().data?.membership?.role === 'owner';
  const { focus } = Route.useSearch();
  const imports = useClientImportGroups(client.id);
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  const readOnly = client.archivedAt !== null;

  return (
    <div data-testid="client-details-page" className="grid gap-4">
      <ImportedNotice clientId={client.id} />
      {imports.waiting.map(({ item, open }) => (
        <WaitingImportPanel key={item.id} item={item} open={open} />
      ))}
      <CompanyPeoplePanel
        client={client}
        readOnly={readOnly}
        companyFocus={focusAmong(focus, companyFocus)}
        representativeFocus={focusAmong(focus, legalRepresentativeFocus)}
      />
      <WorkplacesCard
        client={client}
        readOnly={readOnly}
        focus={focusAmong(focus, workplacesFocus)}
      />
      {isOwner && <NotesPanel clientId={client.id} readOnly={readOnly} />}
      <ClientImportsCard items={imports.past} now={imports.now} />
    </div>
  );
}
