import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { z } from 'zod';

import {
  getListClientDocumentsQueryKey,
  getListClientDocumentsQueryOptions,
} from '../../../../../api/generated/api';
import { useAuth } from '../../../../../auth/auth-context';
import { DocumentEditorPage } from '../../../../../documents/document-editor-page';

// The loader warms the list the page reads, under the same key, and names the document.
// The editor uses the viewport layout instead of the normal page chrome.
export const Route = createFileRoute('/_authenticated/clients/$clientId/documents/$documentId')({
  params: { parse: (params) => ({ documentId: z.uuid().parse(params.documentId) }) },
  staticData: { title: 'Document', fullPage: true, editorPage: true },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      const { items } = await queryClient.ensureQueryData(
        getListClientDocumentsQueryOptions(params.clientId, {
          request: apiRequest,
          query: { queryKey: [...getListClientDocumentsQueryKey(params.clientId), userId] },
        })
      );
      return { crumb: items.find((item) => item.id === params.documentId)?.title };
    } catch {
      return { crumb: undefined };
    }
  },
  component: DocumentRoute,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function DocumentRoute() {
  const { client } = clientRoute.useLoaderData();
  const { documentId } = Route.useParams();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  return (
    <DocumentEditorPage
      clientId={client.id}
      documentId={documentId}
      userId={session.user.id}
      readOnly={client.archivedAt !== null}
    />
  );
}
