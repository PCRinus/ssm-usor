import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { useAuth } from '../../../../../auth/auth-context';
import { documentSectionIds } from '../../../../../documents/document-sections';
import { DocumentsCard } from '../../../../../documents/documents-card';
import { documentsFocus, focusSearch } from '../../../../../missing-data/focus';

// The open section lives in the URL, so going back from the editor returns to it.
const searchSchema = focusSearch(documentsFocus).extend({
  section: z.enum(documentSectionIds).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/clients/$clientId/documents/')({
  validateSearch: searchSchema,
  component: DocumentsPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function DocumentsPage() {
  const { client } = clientRoute.useLoaderData();
  const { section, focus } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="documents-page" className="grid gap-6">
      <DocumentsCard
        clientId={client.id}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
        openSection={section}
        focus={focus}
        onOpenSectionChange={(next) =>
          void navigate({ search: { section: next }, replace: true, resetScroll: false })
        }
      />
    </div>
  );
}
