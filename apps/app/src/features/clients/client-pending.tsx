import { Skeleton } from '@ssm-usor/ui/components/skeleton';

export function ClientPending() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
