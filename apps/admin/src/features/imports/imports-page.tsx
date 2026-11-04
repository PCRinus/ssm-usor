import {
  type AdminImportListItem,
  adminImportStatusFilters,
  importKinds,
  pageBounds,
  pageCount,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MouseEvent } from 'react';

import { AdminShell, LoadFailure } from '@/components/admin-shell';

import { fetchImports, type ImportsSearch } from './api';
import {
  flagSummary,
  formatCost,
  formatDate,
  formatDateTime,
  formatShare,
  kindLabels,
  statusLabels,
} from './format';
import { StatusBadge } from './status-badge';

const columns = [
  'Import',
  'Organization',
  'Status',
  'Flags',
  'Changed',
  'Cost',
  'Version',
  'Copy',
] as const;

function CopyCell({ item }: { item: AdminImportListItem }) {
  const parts =
    item.partCopies > 0 ? ` + ${item.partCopies} part${item.partCopies > 1 ? 's' : ''}` : '';
  if (!item.copy) {
    return <span className="text-muted-foreground">{parts ? `Parts only${parts}` : 'None'}</span>;
  }
  if (item.copy.removedAt) {
    return <span className="text-muted-foreground">Removed {formatDate(item.copy.removedAt)}</span>;
  }
  return (
    <span>
      Until {formatDate(item.copy.expiresAt)}
      <span className="text-muted-foreground">{parts}</span>
    </span>
  );
}

function FlagCounts({ item }: { item: AdminImportListItem }) {
  const flags = flagSummary(item.flags);
  if (!item.flags) return <span className="text-muted-foreground">—</span>;
  if (flags.length === 0) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge key={flag.key} variant="outline" className="font-normal tabular-nums">
          {flag.count} {flag.label}
        </Badge>
      ))}
    </span>
  );
}

const interactive = 'a, button, input, select, label';

export function ImportsPage({ search }: { search: ImportsSearch }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate({ from: '/imports/' });
  const imports = useQuery({
    queryKey: ['admin', 'imports', search],
    queryFn: ({ signal }) => fetchImports(search, { ...apiRequest, signal }),
    placeholderData: keepPreviousData,
  });

  const setSearch = (next: Partial<ImportsSearch>) =>
    void navigate({
      search: (previous) => ({ ...previous, page: undefined, ...next }),
    });

  const open = (id: string) => (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(interactive) || window.getSelection()?.toString()) return;
    void navigate({ to: '/imports/$id', params: { id } });
  };

  return (
    <AdminShell testId="imports-page" wide>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every organization’s imports, newest first. Opening one with a copy is recorded in the
          audit log.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="w-full space-y-1.5 sm:w-40">
          <Label htmlFor="filter-kind">Kind</Label>
          <NativeSelect
            id="filter-kind"
            data-testid="filter-kind"
            size="sm"
            value={search.kind ?? ''}
            onChange={(event) =>
              setSearch({ kind: (event.target.value || undefined) as ImportsSearch['kind'] })
            }
          >
            <NativeSelectOption value="">All kinds</NativeSelectOption>
            {importKinds.map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {kindLabels[kind]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="w-full space-y-1.5 sm:w-44">
          <Label htmlFor="filter-status">Status</Label>
          <NativeSelect
            id="filter-status"
            data-testid="filter-status"
            size="sm"
            value={search.status ?? ''}
            onChange={(event) =>
              setSearch({ status: (event.target.value || undefined) as ImportsSearch['status'] })
            }
          >
            <NativeSelectOption value="">All statuses</NativeSelectOption>
            {adminImportStatusFilters.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {status === 'row_deleted' ? 'Row deleted' : statusLabels[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Label className="flex h-8 items-center gap-2 font-normal">
          <Checkbox
            data-testid="filter-reported"
            checked={search.reported ?? false}
            onCheckedChange={(checked) => setSearch({ reported: checked === true || undefined })}
          />
          Reported only
        </Label>
        <Label className="flex h-8 items-center gap-2 font-normal">
          <Checkbox
            data-testid="filter-has-copy"
            checked={search.hasCopy ?? false}
            onCheckedChange={(checked) => setSearch({ hasCopy: checked === true || undefined })}
          />
          With a copy kept
        </Label>
      </div>

      {imports.isError && !imports.data ? (
        <LoadFailure error={imports.error} onRetry={() => void imports.refetch()} />
      ) : (
        <div className="bg-background overflow-hidden rounded-xl border">
          <Table
            data-testid="imports-table"
            aria-label="Imports"
            aria-busy={imports.isPlaceholderData || undefined}
          >
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className={cn(imports.isPlaceholderData && 'opacity-50')}>
              {imports.isPending ? (
                Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={index} className="hover:bg-transparent">
                    {columns.map((column) => (
                      <TableCell key={column}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : imports.data.items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length}
                    className="text-muted-foreground h-40 text-center"
                  >
                    No import matches these filters.
                  </TableCell>
                </TableRow>
              ) : (
                imports.data.items.map((item) => (
                  <TableRow
                    key={item.id}
                    data-testid="import-row"
                    className="cursor-pointer align-top"
                    onClick={open(item.id)}
                  >
                    <TableCell>
                      <Link
                        to="/imports/$id"
                        params={{ id: item.id }}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.kind ? kindLabels[item.kind] : 'Unknown kind'}
                      </Link>
                      <div className="text-muted-foreground text-xs tabular-nums">
                        {formatDateTime(item.createdAt ?? item.endedAt)}
                      </div>
                      <div className="text-muted-foreground font-mono text-xs">
                        {item.id.slice(0, 8)}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">
                      {item.organization.name ?? (
                        <span className="text-muted-foreground font-mono text-xs">
                          {item.organization.id}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={item.status} rowDeleted={item.rowDeleted} />
                        {item.reportedAt && (
                          <Badge variant="destructive" data-testid="reported-badge">
                            Reported
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-40 whitespace-normal">
                      <FlagCounts item={item} />
                    </TableCell>
                    <TableCell className="tabular-nums">{formatShare(item.changedShare)}</TableCell>
                    <TableCell className="tabular-nums">{formatCost(item.costUsd)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.readingVersion ?? '—'}
                    </TableCell>
                    <TableCell>
                      <CopyCell item={item} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {imports.data && (
            <Pager
              page={imports.data.page}
              pageSize={imports.data.pageSize}
              total={imports.data.total}
              disabled={imports.isFetching}
              onPage={(page) =>
                void navigate({
                  search: (previous) => ({ ...previous, page: page > 1 ? page : undefined }),
                })
              }
            />
          )}
        </div>
      )}
    </AdminShell>
  );
}

function Pager({
  disabled,
  onPage,
  ...meta
}: {
  page: number;
  pageSize: number;
  total: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  const { first, last } = pageBounds(meta);
  const pages = pageCount(meta);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <p data-testid="pager-summary" className="text-muted-foreground text-sm tabular-nums">
        {meta.total === 0
          ? 'No imports'
          : `${first}–${last} of ${meta.total} import${meta.total === 1 ? '' : 's'}`}
      </p>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            data-testid="pager-previous"
            disabled={disabled || meta.page <= 1}
            onClick={() => onPage(meta.page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <span className="text-muted-foreground px-2 text-sm tabular-nums">
            {meta.page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            data-testid="pager-next"
            disabled={disabled || meta.page >= pages}
            onClick={() => onPage(meta.page + 1)}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
