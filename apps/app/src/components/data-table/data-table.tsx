import type { PageMeta } from '@ssm-usor/contracts';
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

import { Pager } from '../pager';
import { type DataTableColumn, dataTableFeatures, type DataTableSort } from './columns';
import { rowClickProps } from './row-click';

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
  // Singular and plural of what is counted, for the pager summary.
  noun: readonly [string, string];
  label: string;
  // Rendered inside the table in place of rows.
  error?: ReactNode;
  empty: ReactNode;
  testId?: string;
  rowTestId?: string;
  onRowClick?: (row: TData) => void;
}

const EMPTY: never[] = [];
const skeletonRows = 3;

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

  return (
    <>
      <Table data-testid={testId} aria-label={label}>
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
                        className="-ml-3 gap-1.5 data-[sorted=true]:text-foreground"
                        data-sorted={Boolean(sorted)}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        {sorted === 'asc' ? (
                          <ArrowUp aria-hidden="true" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown aria-hidden="true" />
                        ) : (
                          <ArrowUpDown aria-hidden="true" className="opacity-50" />
                        )}
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
        <TableBody>
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
                  <TableCell key={column.id} className={column.columnDef.meta?.cellClassName}>
                    <Skeleton
                      className={cn('h-4 w-32', column.columnDef.meta?.skeletonClassName)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="h-64 px-5 text-center whitespace-normal">
                {empty}
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
                  <TableCell key={cell.id} className={cell.column.columnDef.meta?.cellClassName}>
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
