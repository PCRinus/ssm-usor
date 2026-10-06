import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { z } from 'zod';

import { useAuth } from '@/features/auth/auth-context';
import { documentCrumb } from '@/features/documents/document-crumb';
import { DocumentEditorPage } from '@/features/documents/document-editor-page';

// The editor uses the viewport layout instead of the normal page chrome.
export const Route = createFileRoute('/_authenticated/clients/$clientId/documents/$documentId')({
  params: { parse: (params) => ({ documentId: z.uuid().parse(params.documentId) }) },
  staticData: { title: 'Document', fullPage: true, editorPage: true },
  loader: ({ params, context: { apiRequest, queryClient, auth } }) =>
    documentCrumb({
      clientId: params.clientId,
      documentId: params.documentId,
      set: 'occupational_safety',
      userId: auth.getSnapshot().session?.user.id,
      apiRequest,
      queryClient,
    }),
  component: DocumentRoute,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function DocumentRoute() {
  const { client } = clientRoute.useLoaderData();
  const { documentId } = Route.useParams();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  return (
    <DocumentEditorPage
      set="occupational_safety"
      clientId={client.id}
      documentId={documentId}
      userId={session.user.id}
      readOnly={client.archivedAt !== null}
    />
  );
}
