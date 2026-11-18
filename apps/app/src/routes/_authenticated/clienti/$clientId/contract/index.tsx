import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';

import { openedHere } from '@/app/opener';
import { Notice } from '@/components/notice';
import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';
import { clientContractFocus, focusSearch } from '@/features/missing-data/focus';
import { ServiceContractCard } from '@/features/service-contracts/service-contract-card';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/contract/')({
  validateSearch: focusSearch(clientContractFocus),
  component: ContractPage,
});

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

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
        Doar adminii organizației pot vedea contractul de prestări servicii al clientului.
      </Notice>
    );
  }
  return (
    <div data-testid="contract-page" className="grid gap-4">
      <ServiceContractCard
        client={client}
        userId={session.user.id}
        readOnly={client.archivedAt !== null}
        focus={focus}
        editor={(children, testId) => (
          <Button asChild variant="secondary" size="sm">
            <Link
              to="/clienti/$clientId/contract/editare"
              params={{ clientId: client.id }}
              state={openedHere}
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
