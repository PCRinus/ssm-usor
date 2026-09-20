import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { useMe } from '../../../../account/use-me';
import { useAuth } from '../../../../auth/auth-context';
import { ContactCard } from '../../../../clients/contact-card';
import { OwnerNotesCard } from '../../../../clients/owner-notes-card';

export const Route = createFileRoute('/_authenticated/clients/$clientId/contact')({
  staticData: { title: 'Contact' },
  component: ClientContactPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function ClientContactPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const isOwner = useMe().data?.membership?.role === 'owner';
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  const readOnly = client.archivedAt !== null;

  return (
    <div data-testid="client-contact-page" className="grid gap-6">
      <ContactCard client={client} readOnly={readOnly} />
      {isOwner && (
        <OwnerNotesCard clientId={client.id} userId={session.user.id} readOnly={readOnly} />
      )}
    </div>
  );
}
