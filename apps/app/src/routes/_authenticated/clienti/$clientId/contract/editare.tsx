import { createFileRoute, getRouteApi } from '@tanstack/react-router';

import { BackLink } from '@/components/back-link';
import { useAuth } from '@/features/auth/auth-context';
import { ServiceContractEditor } from '@/features/service-contracts/service-contract-editor';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/contract/editare')({
  staticData: { title: 'Contract', fullPage: true, editorPage: true },
  component: ClientContractEditorPage,
});

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

function ClientContractEditorPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  return (
    <ServiceContractEditor
      clientId={client.id}
      companyName={client.legalName}
      userId={session.user.id}
      readOnly={client.archivedAt !== null}
      back={
        <BackLink
          to="/clienti/$clientId/contract"
          params={{ clientId: client.id }}
          data-testid="editor-back"
          label="Înapoi la contract"
        />
      }
    />
  );
}
