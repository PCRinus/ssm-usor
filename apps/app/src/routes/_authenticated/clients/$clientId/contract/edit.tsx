import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { useBackToList } from '@/app/use-back-to-list';
import { useAuth } from '@/features/auth/auth-context';
import { ServiceContractEditor } from '@/features/service-contracts/service-contract-editor';

export const Route = createFileRoute('/_authenticated/clients/$clientId/contract/edit')({
  staticData: { title: 'Contract', fullPage: true, editorPage: true },
  component: ClientContractEditorPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function ClientContractEditorPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const backToList = useBackToList();
  // The shell renders this only for a signed-in user.
  if (!session) return null;
  return (
    <ServiceContractEditor
      clientId={client.id}
      userId={session.user.id}
      readOnly={client.archivedAt !== null}
      back={
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/clients/$clientId/contract"
            params={{ clientId: client.id }}
            data-testid="editor-back"
            onClick={backToList}
            aria-label="Înapoi la contract"
          >
            <ArrowLeft aria-hidden="true" />
            <span className="hidden sm:inline">Contract</span>
          </Link>
        </Button>
      }
    />
  );
}
