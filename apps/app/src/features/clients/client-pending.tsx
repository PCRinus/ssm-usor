import { Skeleton } from '@ssm-usor/ui/components/skeleton';

import { BackLink } from '@/components/back-link';

export function ClientPending() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="flex items-center gap-3">
        <div className="-mr-1 -ml-3 flex shrink-0 sm:-ml-2">
          <BackLink to="/clienti" label="Înapoi la clienți" />
        </div>
        <Skeleton className="h-12 flex-1 rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
