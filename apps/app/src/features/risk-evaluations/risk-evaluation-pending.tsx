import { Skeleton } from '@ssm-usor/ui/components/skeleton';

export function RiskEvaluationPending() {
  return (
    <div className="grid gap-5" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-72 max-w-full" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
