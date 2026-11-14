import { Skeleton } from '@ssm-usor/ui/components/skeleton';

import { TitleWithBack } from '@/components/back-link';

import { JobPositionBack } from './job-position-back';

export function JobPositionPending() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <div className="grid gap-3">
        <TitleWithBack back={<JobPositionBack />}>
          <div className="grid gap-2">
            <Skeleton className="h-7 w-72 max-w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        </TitleWithBack>
        <Skeleton className="h-8 w-80 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
