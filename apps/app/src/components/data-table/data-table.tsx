import { pageCount, type PageMeta } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
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
import { type RowData, type SortingState, useTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { replayMask } from '@/app/observability/replay-masking';
import { ListEmpty } from '@/components/empty-state';
import { Pager } from '@/components/pager';

import { type DataTableColumn, dataTableFeatures, type DataTableSort } from './columns';
import { rowClickProps } from './row-click';

const sortIcon = 'ml-1.5 inline size-3.5 align-[-2px]';

export interface DataTableProps<TData extends RowData> {
  columns: DataTableColumn<TData>[];
  data: TData[] | undefined;
  rowKey: (row: TData) => string;
  meta: PageMeta;
  sort: DataTableSort;
  onSortChange: (sort: DataTableSort) => void;
  onPageChange: (page: number) => void;
  status: 'pending' | 'error' | 'success';
  isFetching?: boolean;
  // The rows shown answer an earlier sort or page while the one asked for loads.
  isPlaceholderData?: boolean;
  // Singular and plural of what is counted, for the pager summary.
  noun: readonly [string, string];
  label: string;
  // Rendered inside the table in place of rows.
  error?: ReactNode;
  // Rendered in place of the table and its pager when the whole list is empty.
  empty: ReactNode;
  testId?: string;
  rowTestId?: string;
  onRowClick?: (row: TData) => void;
}

const EMPTY: never[] = [];
const skeletonRows = 3;
const cellPadding = 'py-2.5';

export function DataTable<TData extends RowData>({
  columns,
  data,
  rowKey,
  meta,
  sort,
  onSortChange,
  onPageChange,
  status,
  isFetching,
  isPlaceholderData,
  noun,
  label,
  error,
  empty,
  testId,
  rowTestId,
  onRowClick,
}: DataTableProps<TData>) {
  const sorting: SortingState = [{ id: sort.sort, desc: sort.order === 'desc' }];
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: data ?? EMPTY,
    getRowId: rowKey,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      if (first) onSortChange({ sort: first.id, order: first.desc ? 'desc' : 'asc' });
    },
    // Accessor columns are sortable unless they opt out; display columns never are.
    // Every column starts ascending, numbers included, so the cycle is the same everywhere.
    manualSorting: true,
    sortDescFirst: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
  });
  const columnCount = table.getAllLeafColumns().length;
  const leafColumns = table.getAllLeafColumns();

  const pageEmpty = status === 'success' && table.getRowModel().rows.length === 0;

  // Outside the table: on a phone the column headers are wider than the screen, and the empty
  // state would be centred in that width, half out of view.
  if (pageEmpty && meta.total === 0) {
    return <ListEmpty>{empty}</ListEmpty>;
  }

  return (
    <>
      <Table data-testid={testId} aria-label={label} aria-busy={isPlaceholderData || undefined}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={header.column.columnDef.meta?.headerClassName}
                    aria-sort={
                      !header.column.getCanSort()
                        ? undefined
                        : sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid={`sort-${header.column.id}`}
                        className="-ml-3 h-auto min-h-8 py-1 text-left text-[13px] font-semibold text-table-head-foreground hover:bg-table-head-hover hover:text-foreground data-[sorted=true]:text-foreground"
                        data-sorted={Boolean(sorted)}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {/* One inline run, so a wrapped label keeps its arrow after the last word;
                            the word joiner stops the arrow wrapping onto a line of its own. */}
                        <span>
                          <table.FlexRender header={header} />
                          <span aria-hidden="true">
                            {'\u2060'}
                            {sorted === 'asc' ? (
                              <ArrowUp className={sortIcon} />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className={sortIcon} />
                            ) : (
                              <ArrowUpDown className={cn(sortIcon, 'opacity-55')} />
                            )}
                          </span>
                        </span>
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody
          className={cn(
            'transition-opacity duration-150',
            // Delayed so a fast answer swaps the rows without a flicker.
            isPlaceholderData && 'opacity-50 delay-150'
          )}
        >
          {status === 'error' ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-48 px-5 text-center whitespace-normal">
                {error}
              </TableCell>
            </TableRow>
          ) : status === 'pending' ? (
            Array.from({ length: skeletonRows }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                {leafColumns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(cellPadding, column.columnDef.meta?.cellClassName)}
                  >
                    <Skeleton
                      className={cn('h-4 w-32', column.columnDef.meta?.skeletonClassName)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : pageEmpty ? (
            // A page past the last one, from an old link or after rows went away.
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-48 px-5 text-center whitespace-normal">
                <p data-testid="data-table-page-empty" className="text-sm text-muted-foreground">
                  Pagina {meta.page} nu are rânduri.
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  data-testid="data-table-last-page"
                  disabled={isFetching}
                  onClick={() => onPageChange(pageCount(meta))}
                >
                  Mergi la pagina {pageCount(meta)}
                </Button>
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-testid={rowTestId}
                {...rowClickProps(onRowClick && (() => onRowClick(row.original)))}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(cellPadding, cell.column.columnDef.meta?.cellClassName)}
                    {...(cell.column.columnDef.meta?.personal && replayMask)}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {status === 'success' && (
        <Pager meta={meta} noun={noun} disabled={isFetching} onPage={onPageChange} />
      )}
    </>
  );
}
