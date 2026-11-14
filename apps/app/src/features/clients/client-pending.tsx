import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';

import { backGap } from '@/components/back-gap';
import { BackLink } from '@/components/back-link';

export function ClientPending() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className={cn('flex items-center', backGap)}>
        <div className="flex shrink-0">
          <BackLink to="/clienti" label="Înapoi la clienți" />
        </div>
        <Skeleton className="h-12 flex-1 rounded-lg" />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
