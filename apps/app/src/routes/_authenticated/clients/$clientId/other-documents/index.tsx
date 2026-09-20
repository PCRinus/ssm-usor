import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';

import { useMe } from '../../../../../account/use-me';
import { useAuth } from '../../../../../auth/auth-context';
import { Notice } from '../../../../../components/notice';
import { ServiceContractCard } from '../../../../../service-contracts/service-contract-card';

// The documents about a client that are not part of its documentation set (ADR 007). The
// service contract is the first, and an owner's.
export const Route = createFileRoute('/_authenticated/clients/$clientId/other-documents/')({
  component: OtherDocumentsPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function OtherDocumentsPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const me = useMe();
  // The shell renders this only for a signed-in user.
  if (!session || me.isPending) return null;
  if (me.data?.membership?.role !== 'owner') {
    return (
      <Notice variant="info" data-testid="other-documents-owners-only">
        Aici stau contractul de prestări servicii și alte documente pe care le văd doar
        administratorii organizației.
      </Notice>
    );
  }
  return (
    <div data-testid="other-documents-page" className="grid gap-6">
      <ServiceContractCard
        client={client}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
        editor={(children, testId) => (
          <Button asChild variant="outline" size="sm">
            <Link
              to="/clients/$clientId/other-documents/contract"
              params={{ clientId: client.id }}
              data-testid={testId}
            >
              {children}
            </Link>
          </Button>
        )}
      />
    </div>
  );
}
