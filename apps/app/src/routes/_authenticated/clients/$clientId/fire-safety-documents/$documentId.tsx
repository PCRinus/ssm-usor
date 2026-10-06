import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { z } from 'zod';

import { useAuth } from '@/features/auth/auth-context';
import { documentCrumb } from '@/features/documents/document-crumb';
import { DocumentEditorPage } from '@/features/documents/document-editor-page';

export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/fire-safety-documents/$documentId'
)({
  params: { parse: (params) => ({ documentId: z.uuid().parse(params.documentId) }) },
  staticData: { title: 'Document', fullPage: true, editorPage: true },
  loader: ({ params, context: { apiRequest, queryClient, auth } }) =>
    documentCrumb({
      clientId: params.clientId,
      documentId: params.documentId,
      set: 'fire_safety',
      userId: auth.getSnapshot().session?.user.id,
      apiRequest,
      queryClient,
    }),
  component: FireSafetyDocumentRoute,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function FireSafetyDocumentRoute() {
  const { client } = clientRoute.useLoaderData();
  const { documentId } = Route.useParams();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  return (
    <DocumentEditorPage
      set="fire_safety"
      clientId={client.id}
      documentId={documentId}
      userId={session.user.id}
      readOnly={client.archivedAt !== null}
    />
  );
}
