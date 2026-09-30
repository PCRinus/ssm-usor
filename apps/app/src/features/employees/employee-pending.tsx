import { Skeleton } from '@ssm-usor/ui/components/skeleton';

export function EmployeePending() {
  return (
    <div className="space-y-7" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}
