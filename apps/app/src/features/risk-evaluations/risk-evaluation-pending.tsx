import { Skeleton } from '@ssm-usor/ui/components/skeleton';

import { TitleWithBack } from '@/components/back-link';

import { RiskEvaluationBack } from './risk-evaluation-back';

export function RiskEvaluationPending() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <TitleWithBack back={<RiskEvaluationBack />}>
        <div className="grid gap-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-48" />
        </div>
      </TitleWithBack>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
