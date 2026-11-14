import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useLocation } from '@tanstack/react-router';

import { RecordHeaderPending } from '@/features/clients/record-header';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';

import { JobPositionBack } from './job-position-back';

// The position loads before its sheet does, so a sheet opened directly waits here first.
export function JobPositionPending() {
  const onSheet = useLocation({
    select: (location) => location.pathname.endsWith('/fisa-de-evaluare'),
  });
  if (onSheet) return <RiskEvaluationPending />;
  return (
    <div className="grid gap-5" aria-busy="true">
      <div className="grid gap-3">
        <RecordHeaderPending back={<JobPositionBack />} />
        <Skeleton className="h-8 w-80 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
