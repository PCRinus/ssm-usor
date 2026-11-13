import type { LegalCheckRun } from '@ssm-usor/contracts';
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
import { useNavigate, useRouteContext } from '@tanstack/react-router';

import { AdminShell, LoadFailure } from '@/components/admin-shell';
import { Pager } from '@/components/pager';
import { formatDateTime, formatTime } from '@/lib/format';

import { fetchRuns, legislationKey, type RunsSearch } from './api';
import { runStatusLabels } from './format';
import { LegislationHeader } from './legislation-header';

const columns = ['Started', 'Status', 'Checked', 'Changes found', 'Errors'] as const;

function RunStatus({ run }: { run: LegalCheckRun }) {
  return (
    <Badge
      variant={
        run.status === 'failed' ? 'destructive' : run.status === 'running' ? 'outline' : 'secondary'
      }
    >
      {runStatusLabels[run.status]}
    </Badge>
  );
}

function Errors({ run }: { run: LegalCheckRun }) {
  if (!run.errors || run.errors.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }
  const count = run.errors.length;
  const acts = [...new Set(run.errors.map((error) => error.act ?? 'the run'))];
  return (
    <details data-testid="run-errors" className="max-w-md">
      <summary className="cursor-pointer text-sm">
        {count} error{count === 1 ? '' : 's'}
        <span className="text-muted-foreground">
          {' '}
          · {acts.slice(0, 3).join(', ')}
          {acts.length > 3 && '…'}
        </span>
      </summary>
      <ul className="mt-2 space-y-2 text-xs">
        {run.errors.map((error, index) => (
          <li key={index} className="rounded-md border p-2">
            <span className="font-mono">{error.act ?? 'The run itself'}</span>
            <span className="text-muted-foreground">
              {' '}
              · {error.kind}
              {error.status !== undefined && ` ${error.status}`}
            </span>
            <p className="mt-1 break-words whitespace-normal">{error.message}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function RunsPage({ search }: { search: RunsSearch }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate({ from: '/legislation/runs' });
  const runs = useQuery({
    queryKey: [...legislationKey, 'runs', search],
    queryFn: ({ signal }) => fetchRuns(search, { ...apiRequest, signal }),
    placeholderData: keepPreviousData,
  });

  return (
    <AdminShell testId="legislation-runs-page" wide>
      <LegislationHeader />
      {runs.isError && !runs.data ? (
        <LoadFailure error={runs.error} onRetry={() => void runs.refetch()} />
      ) : (
        <div className="bg-background overflow-hidden rounded-xl border">
          <Table
            data-testid="legal-runs-table"
            aria-label="Runs of the daily check"
            aria-busy={runs.isPlaceholderData || undefined}
          >
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className={cn(runs.isPlaceholderData && 'opacity-50')}>
              {runs.isPending ? (
                Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {columns.map((column) => (
                      <TableCell key={column}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : runs.data.items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="text-muted-foreground h-40 text-center"
                  >
                    The daily check has not run yet.
                  </TableCell>
                </TableRow>
              ) : (
                runs.data.items.map((run) => (
                  <TableRow key={run.id} data-testid="legal-run-row" className="align-top">
                    <TableCell className="tabular-nums">
                      {formatDateTime(run.startedAt)}
                      <div className="text-muted-foreground text-xs">
                        {run.finishedAt
                          ? `ended ${formatTime(run.finishedAt)}`
                          : run.status === 'running'
                            ? 'no end recorded'
                            : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RunStatus run={run} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {run.actsChecked}
                      {run.actsSkipped > 0 && (
                        <span className="text-muted-foreground"> · {run.actsSkipped} skipped</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{run.changesFound}</TableCell>
                    <TableCell className="whitespace-normal">
                      <Errors run={run} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {runs.data && (
            <Pager
              noun={{ one: 'run', many: 'runs' }}
              page={runs.data.page}
              pageSize={runs.data.pageSize}
              total={runs.data.total}
              disabled={runs.isFetching}
              onPage={(page) => void navigate({ search: { page: page > 1 ? page : undefined } })}
            />
          )}
        </div>
      )}
    </AdminShell>
  );
}
