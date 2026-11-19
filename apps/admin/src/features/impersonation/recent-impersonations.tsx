import type { AdminImpersonation } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { ListTable } from '@/components/list-table';
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
      <ListTable
        query={history}
        testId="impersonations-table"
        label="Recent impersonations"
        columns={columns}
        skeletonRows={2}
        empty="You have not acted as a member yet."
        emptyClassName="h-24"
        row={(item) => (
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
            <TableCell className="max-w-80 min-w-48 whitespace-normal">{item.reason}</TableCell>
            <TableCell className="tabular-nums">{formatDateTime(item.startedAt)}</TableCell>
            <TableCell className="tabular-nums">
              <State impersonation={item} readAt={history.dataUpdatedAt} />
            </TableCell>
          </TableRow>
        )}
        pager={{
          noun: { one: 'impersonation', many: 'impersonations' },
          testId: 'impersonations-pager',
          onPage: setPage,
          onlyWhenSeveralPages: true,
        }}
      />
    </section>
  );
}
