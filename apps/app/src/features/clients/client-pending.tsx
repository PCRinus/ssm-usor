import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';

import { backGap } from '@/components/back-gap';
import { BackLink } from '@/components/back-link';

import { ClientSheet } from './client-sheet';

export function ClientPending() {
  return (
    <div aria-busy="true">
      <div className={cn('mb-5 flex items-center', backGap)}>
        <div className="flex shrink-0">
          <BackLink to="/clienti" label="Înapoi la clienți" />
        </div>
        <Skeleton className="h-12 flex-1 rounded-lg" />
      </div>
      <div className="pt-2 max-sm:-mx-5 max-sm:px-3">
        <Skeleton className="h-10 w-full rounded-b-none" />
      </div>
      <ClientSheet />
    </div>
  );
}
