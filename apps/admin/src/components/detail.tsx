import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ApiHttpError } from '@/api/http';
import { LoadFailure } from '@/components/admin-shell';

export function Section({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className="bg-background rounded-xl border p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{term}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

export function DetailQuery<T>({
  query,
  notFound,
  children,
}: {
  query: UseQueryResult<T, Error>;
  notFound: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <div role="status" aria-label="Loading" className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiHttpError && query.error.status === 404) return notFound;
    return <LoadFailure error={query.error} onRetry={() => void query.refetch()} />;
  }
  return children(query.data);
}
