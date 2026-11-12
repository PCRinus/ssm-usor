import type { AdminImpersonation } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
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
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { LoadFailure } from '@/components/admin-shell';
import { Pager } from '@/components/pager';
import { formatDateTime } from '@/lib/format';

import { fetchImpersonations, impersonationsKey, targetName } from './api';

const columns = ['Member', 'Organization', 'Reason', 'Started', 'State'] as const;

function State({ impersonation, readAt }: { impersonation: AdminImpersonation; readAt: number }) {
  const expiresAt = Date.parse(impersonation.expiresAt);
  // The API closes one that ran out at its expiry, whenever it finds it; until then the row is
  // still open, and only its time tells it has expired.
  const ended = impersonation.endedAt && Date.parse(impersonation.endedAt) < expiresAt;
  if (ended) {
    return <span>Ended {formatDateTime(impersonation.endedAt)}</span>;
  }
  if (impersonation.endedAt || expiresAt <= readAt) {
    return (
      <span className="text-muted-foreground">
        Expired {formatDateTime(impersonation.expiresAt)}
      </span>
    );
  }
  return <Badge variant="secondary">Active</Badge>;
}

export function RecentImpersonations() {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: [...impersonationsKey, page],
    queryFn: ({ signal }) => fetchImpersonations(page, { ...apiRequest, signal }),
    placeholderData: keepPreviousData,
  });

  return (
    <section aria-labelledby="recent-impersonations" className="mt-10">
      <h2 id="recent-impersonations" className="mb-1 text-lg font-semibold tracking-tight">
        Recent impersonations
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">Yours, newest first.</p>
      {history.isError && !history.data ? (
        <LoadFailure error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <div className="bg-background overflow-hidden rounded-xl border">
          <Table
            data-testid="impersonations-table"
            aria-label="Recent impersonations"
            aria-busy={history.isPlaceholderData || undefined}
          >
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className={cn(history.isPlaceholderData && 'opacity-50')}>
              {history.isPending ? (
                Array.from({ length: 2 }, (_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {columns.map((column) => (
                      <TableCell key={column}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : history.data.items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="text-muted-foreground h-24 text-center"
                  >
                    You have not acted as a member yet.
                  </TableCell>
                </TableRow>
              ) : (
                history.data.items.map((item) => (
                  <TableRow key={item.id} data-testid="impersonation-row" className="align-top">
                    <TableCell className="min-w-36">
                      <div className="font-medium break-words">{targetName(item.target)}</div>
                      {item.target.fullName && item.target.email && (
                        <div className="text-muted-foreground text-xs">{item.target.email}</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 min-w-36 whitespace-normal">
                      {item.target.organization?.name ?? (
                        <span className="text-muted-foreground">No longer a member</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-80 min-w-48 whitespace-normal">
                      {item.reason}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(item.startedAt)}</TableCell>
                    <TableCell className="tabular-nums">
                      <State impersonation={item} readAt={history.dataUpdatedAt} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {history.data && history.data.total > history.data.pageSize && (
            <Pager
              testId="impersonations-pager"
              noun={{ one: 'impersonation', many: 'impersonations' }}
              page={history.data.page}
              pageSize={history.data.pageSize}
              total={history.data.total}
              disabled={history.isFetching}
              onPage={setPage}
            />
          )}
        </div>
      )}
    </section>
  );
}
