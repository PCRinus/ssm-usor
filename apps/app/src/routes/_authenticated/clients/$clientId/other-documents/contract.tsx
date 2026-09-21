import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

import { useAuth } from '../../../../../auth/auth-context';
import { ServiceContractEditor } from '../../../../../service-contracts/service-contract-editor';

export const Route = createFileRoute('/_authenticated/clients/$clientId/other-documents/contract')({
  staticData: { title: 'Contract', fullPage: true, editorPage: true },
  component: ClientContractPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function ClientContractPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
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
            to="/clients/$clientId/other-documents"
            params={{ clientId: client.id }}
            data-testid="editor-back"
            aria-label="Înapoi la alte documente"
          >
            <ArrowLeft aria-hidden="true" />
            <span className="hidden sm:inline">Alte documente</span>
          </Link>
        </Button>
      }
    />
  );
}
