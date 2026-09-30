import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';

import { Notice } from '@/components/notice';
import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';
import { clientContractFocus, focusSearch } from '@/features/missing-data/focus';
import { ServiceContractCard } from '@/features/service-contracts/service-contract-card';

export const Route = createFileRoute('/_authenticated/clients/$clientId/contract/')({
  validateSearch: focusSearch(clientContractFocus),
  component: ContractPage,
});

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

function ContractPage() {
  const { client } = clientRoute.useLoaderData();
  const { session } = useAuth();
  const me = useMe();
  const { focus } = Route.useSearch();
  // The shell renders this only for a signed-in user.
  if (!session || me.isPending) return null;
  if (me.data?.membership?.role !== 'owner') {
    return (
      <Notice variant="info" data-testid="contract-owners-only">
        Doar administratorii organizației pot vedea contractul de prestări servicii al clientului.
      </Notice>
    );
  }
  return (
    <div data-testid="contract-page" className="grid gap-6">
      <ServiceContractCard
        client={client}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
        focus={focus}
        editor={(children, testId) => (
          <Button asChild variant="outline" size="sm">
            <Link
              to="/clients/$clientId/contract/edit"
              params={{ clientId: client.id }}
              state={{ openedFromList: true }}
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
