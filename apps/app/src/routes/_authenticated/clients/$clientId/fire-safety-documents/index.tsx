import { createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';

import { useAuth } from '@/features/auth/auth-context';
import { fireSafetyDocumentSectionIds } from '@/features/documents/document-sections';
import { DocumentsCard } from '@/features/documents/documents-card';
import { fireSafetyDocumentsFocus, focusSearch } from '@/features/missing-data/focus';

const searchSchema = focusSearch(fireSafetyDocumentsFocus).extend({
  section: z.enum(fireSafetyDocumentSectionIds).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/clients/$clientId/fire-safety-documents/')({
  validateSearch: searchSchema,
  component: FireSafetyDocumentsPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function FireSafetyDocumentsPage() {
  const { client } = clientRoute.useLoaderData();
  const { section, focus } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;

  return (
    <div data-testid="fire-safety-documents-page" className="grid gap-6">
      <DocumentsCard
        set="fire_safety"
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
