import type { LegalCheckRun } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';

import { AdminShell } from '@/components/admin-shell';
import { ListTable } from '@/components/list-table';
import { formatDateTime, formatTime } from '@/lib/format';
import { pageParam } from '@/lib/search';

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
      <ListTable
        query={runs}
        testId="legal-runs-table"
        label="Runs of the daily check"
        columns={columns}
        empty="The daily check has not run yet."
        row={(run) => (
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
        )}
        pager={{
          noun: { one: 'run', many: 'runs' },
          onPage: (page) => void navigate({ search: { page: pageParam(page) } }),
        }}
      />
    </AdminShell>
  );
}
