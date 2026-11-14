import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { getRouteApi } from '@tanstack/react-router';

import { BackLink, TitleWithBack } from '@/components/back-link';

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

export function EmployeePending() {
  const { clientId } = clientRoute.useParams();
  return (
    <div className="space-y-7" aria-busy="true">
      <TitleWithBack
        back={
          <BackLink
            to="/clienti/$clientId/angajati"
            params={{ clientId }}
            label="Înapoi la lucrători"
          />
        }
      >
        <div className="space-y-3">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      </TitleWithBack>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
