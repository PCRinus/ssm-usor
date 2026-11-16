import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { z } from 'zod';

import { keepOpener } from '@/app/opener';
import { useAuth } from '@/features/auth/auth-context';
import { clientFileListSearch } from '@/features/client-files/client-file-list';
import { ClientFilesCard } from '@/features/client-files/client-files-card';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/alte-documente/')({
  staticData: { flushSheet: true },
  validateSearch: z.object(clientFileListSearch),
  component: OtherDocumentsPage,
});

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

function OtherDocumentsPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="other-documents-page">
      <ClientFilesCard
        client={client}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
        search={search}
        onSearch={(next) =>
          void navigate({ search: next, state: keepOpener, replace: true, resetScroll: false })
        }
      />
    </div>
  );
}
