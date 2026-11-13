import {
  type AdminLegalChangeListItem,
  adminLegalChangeOutcomeFilters,
  type LegalChangeOutcome,
  type LegalChangeResolution,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
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
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import type { MouseEvent } from 'react';

import { AdminShell, LoadFailure } from '@/components/admin-shell';
import { formatDateTime } from '@/lib/format';

import { type ChangesSearch, fetchChanges, legislationKey } from './api';
import { amendingActsOf, formatDay, outcomeLabels, resolutionLabels } from './format';
import { LegislationHeader } from './legislation-header';

const columns = ['Act', 'Form', 'Outcome', 'Amended by', 'Resolution', 'Seen'] as const;

export function OutcomeBadge({ outcome }: { outcome: LegalChangeOutcome | null }) {
  if (!outcome) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Not assessed
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        outcome === 'quote_differs' &&
          'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
        outcome === 'needs_review' &&
          'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100'
      )}
    >
      {outcomeLabels[outcome]}
    </Badge>
  );
}

export function ResolutionBadge({ resolution }: { resolution: LegalChangeResolution }) {
  return (
    <Badge variant={resolution === 'open' ? 'default' : 'secondary'}>
      {resolutionLabels[resolution]}
    </Badge>
  );
}

function AmendedBy({ change }: { change: AdminLegalChangeListItem }) {
  const acts = amendingActsOf(change);
  if (acts.length === 0) return <span className="text-muted-foreground">—</span>;
  return <span>{acts.map((act) => act.name).join(', ')}</span>;
}

const interactive = 'a, button, input, select, label';

export function ChangesPage({ search }: { search: ChangesSearch }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate({ from: '/legislation/' });
  const changes = useQuery({
    queryKey: [...legislationKey, 'changes', search],
    queryFn: ({ signal }) => fetchChanges(search, { ...apiRequest, signal }),
    placeholderData: keepPreviousData,
  });

  const setSearch = (next: Partial<ChangesSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) });

  const open = (id: string) => (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(interactive) || window.getSelection()?.toString()) return;
    void navigate({ to: '/legislation/changes/$id', params: { id } });
  };

  return (
    <AdminShell testId="legislation-changes-page" wide>
      <LegislationHeader />

      <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="filter-change-status">Status</Label>
          <NativeSelect
            id="filter-change-status"
            data-testid="filter-change-status"
            size="sm"
            value={search.status ?? ''}
            onChange={(event) =>
              setSearch({ status: (event.target.value || undefined) as ChangesSearch['status'] })
            }
          >
            <NativeSelectOption value="">Open and resolved</NativeSelectOption>
            <NativeSelectOption value="open">Open</NativeSelectOption>
            <NativeSelectOption value="resolved">Resolved</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="w-full space-y-1.5 sm:w-44">
          <Label htmlFor="filter-change-outcome">Outcome</Label>
          <NativeSelect
            id="filter-change-outcome"
            data-testid="filter-change-outcome"
            size="sm"
            value={search.outcome ?? ''}
            onChange={(event) =>
              setSearch({ outcome: (event.target.value || undefined) as ChangesSearch['outcome'] })
            }
          >
            <NativeSelectOption value="">Every outcome</NativeSelectOption>
            {adminLegalChangeOutcomeFilters.map((outcome) => (
              <NativeSelectOption key={outcome} value={outcome}>
                {outcome === 'unassessed' ? 'Not assessed' : outcomeLabels[outcome]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      {changes.isError && !changes.data ? (
        <LoadFailure error={changes.error} onRetry={() => void changes.refetch()} />
      ) : (
        <div className="bg-background overflow-hidden rounded-xl border">
          <Table
            data-testid="legal-changes-table"
            aria-label="Legal changes"
            aria-busy={changes.isPlaceholderData || undefined}
          >
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className={cn(changes.isPlaceholderData && 'opacity-50')}>
              {changes.isPending ? (
                Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {columns.map((column) => (
                      <TableCell key={column}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : changes.data.items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="text-muted-foreground h-40 text-center"
                  >
                    No change matches these filters.
                  </TableCell>
                </TableRow>
              ) : (
                changes.data.items.map((change) => (
                  <TableRow
                    key={change.id}
                    data-testid="legal-change-row"
                    className="cursor-pointer align-top"
                    onClick={open(change.id)}
                  >
                    <TableCell>
                      <Link
                        to="/legislation/changes/$id"
                        params={{ id: change.id }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {change.act.name}
                      </Link>
                      <div className="text-muted-foreground font-mono text-xs">{change.act.id}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDay(change.consolidatedOn)}
                      <div className="text-muted-foreground text-xs">
                        {change.comparedWith
                          ? `vs ${formatDay(change.comparedWith)}`
                          : 'No verified form'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge outcome={change.outcome} />
                      {change.passageCount > 0 && (
                        <div className="text-muted-foreground mt-1 text-xs">
                          {change.passageCount} passage{change.passageCount === 1 ? '' : 's'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">
                      <AmendedBy change={change} />
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      <ResolutionBadge resolution={change.resolution} />
                      {change.resolvedByNote && (
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                          {change.resolvedByNote}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateTime(change.seenAt)}
                      <div className="text-muted-foreground text-xs">
                        {change.assessedAt
                          ? `assessed ${formatDateTime(change.assessedAt)}`
                          : 'not assessed'}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminShell>
  );
}
