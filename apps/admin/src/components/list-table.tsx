import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { LoadFailure } from '@/components/admin-shell';
import { Pager } from '@/components/pager';

interface Paged {
  page: number;
  pageSize: number;
  total: number;
}

type PagerOptions = {
  noun: { one: string; many: string };
  testId?: string;
  onPage: (page: number) => void;
  // A short list, as a section under a page, shows no pager while it fits on one page.
  onlyWhenSeveralPages?: boolean;
};

export function ListTable<List extends { items: readonly unknown[] }>({
  query,
  testId,
  label,
  columns,
  skeletonRows = 3,
  empty,
  emptyClassName = 'h-40',
  row,
  pager,
}: {
  query: UseQueryResult<List, Error>;
  testId: string;
  label: string;
  columns: readonly ReactNode[];
  skeletonRows?: number;
  empty: ReactNode;
  emptyClassName?: string;
  row: (item: List['items'][number]) => ReactNode;
  pager?: List extends Paged ? PagerOptions : never;
}) {
  if (query.isError && !query.data) {
    return <LoadFailure error={query.error} onRetry={() => void query.refetch()} />;
  }
  const data = query.data;
  const paged = pager && data && (data as unknown as Paged);
  return (
    <div className="bg-background overflow-hidden rounded-xl border">
      <Table
        data-testid={testId}
        aria-label={label}
        aria-busy={query.isPlaceholderData || undefined}
      >
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead key={index}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className={cn(query.isPlaceholderData && 'opacity-50')}>
          {query.isPending || !data ? (
            Array.from({ length: skeletonRows }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                {columns.map((_column, cell) => (
                  <TableCell key={cell}>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className={cn('text-muted-foreground text-center', emptyClassName)}
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            data.items.map(row)
          )}
        </TableBody>
      </Table>
      {pager && paged && (!pager.onlyWhenSeveralPages || paged.total > paged.pageSize) && (
        <Pager
          testId={pager.testId}
          noun={pager.noun}
          page={paged.page}
          pageSize={paged.pageSize}
          total={paged.total}
          disabled={query.isFetching}
          onPage={pager.onPage}
        />
      )}
    </div>
  );
}
