import { Skeleton } from '@ssm-usor/ui/components/skeleton';

import { TitleWithBack } from '@/components/back-link';

import { LegalChangeBack } from './legal-change-back';

export function LegalChangePending() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <TitleWithBack back={<LegalChangeBack />} className="mb-1 sm:gap-x-4">
        <div className="grid gap-2">
          <Skeleton className="h-9 w-56 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </TitleWithBack>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
