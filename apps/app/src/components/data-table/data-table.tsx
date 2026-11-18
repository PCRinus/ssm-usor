import { pageCount, type PageMeta } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
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
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from 'lucide-react';
import { Fragment, type ReactNode, useId } from 'react';

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
  // Left out for a list read whole, which has no pages and no pager.
  meta?: PageMeta;
  // Left out for a list kept in the API's order, whose columns are display columns.
  sort?: DataTableSort;
  onSortChange?: (sort: DataTableSort) => void;
  onPageChange?: (page: number) => void;
  status: 'pending' | 'error' | 'success';
  isFetching?: boolean;
  // The rows shown answer an earlier sort or page while the one asked for loads.
  isPlaceholderData?: boolean;
  // Singular and plural of what is counted, for the pager summary.
  noun?: readonly [string, string];
  label: string;
  // Rendered inside the table in place of rows.
  error?: ReactNode;
  // Rendered in place of the table and its pager when the whole list is empty.
  empty: ReactNode;
  testId?: string;
  rowTestId?: string | ((row: TData) => string);
  rowElementId?: (row: TData) => string | undefined;
  onRowClick?: (row: TData) => void;
  // Left out when every row opens.
  canClickRow?: (row: TData) => boolean;
  expansion?: DataTableExpansion<TData>;
  selection?: DataTableSelection<TData>;
}

export interface DataTableExpansion<TData> {
  // Left out when every row opens; a row that does not keeps an empty cell.
  canExpand?: (row: TData) => boolean;
  isOpen: (row: TData) => boolean;
  onToggle: (row: TData) => void;
  label: (row: TData) => string;
  render: (row: TData) => ReactNode;
  testId?: string;
}

/**
 * A checkbox before every row and one in the header for the rows on the page. The caller owns
 * what is chosen, so a choice survives a page turn, and a row it chose in part reads
 * `indeterminate`.
 */
export interface DataTableSelection<TData> {
  state: (row: TData) => boolean | 'indeterminate';
  onChange: (rows: TData[], selected: boolean) => void;
  label: (row: TData) => string;
  pageLabel: string;
  testId?: string;
}

const EMPTY: never[] = [];
const skeletonRows = 3;
const cellPadding = 'py-2.5';
const selectCell = 'w-11 pr-0';

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
  rowElementId,
  onRowClick,
  canClickRow,
  expansion,
  selection,
}: DataTableProps<TData>) {
  const detailsId = useId();
  const sorting: SortingState = sort ? [{ id: sort.sort, desc: sort.order === 'desc' }] : [];
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: data ?? EMPTY,
    getRowId: rowKey,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      const first = next[0];
      if (first) onSortChange?.({ sort: first.id, order: first.desc ? 'desc' : 'asc' });
    },
    // Accessor columns are sortable unless they opt out; display columns never are.
    // Every column starts ascending, numbers included, so the cycle is the same everywhere.
    manualSorting: true,
    sortDescFirst: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
  });
  const columnCount = table.getAllLeafColumns().length + (expansion ? 1 : 0) + (selection ? 1 : 0);
  const leafColumns = table.getAllLeafColumns();
  const pageRows = table.getRowModel().rows.map((row) => row.original);
  const pageStates = selection ? pageRows.map((row) => selection.state(row)) : [];
  const pageSelected =
    pageStates.length > 0 && pageStates.every((state) => state === true)
      ? true
      : pageStates.some(Boolean)
        ? 'indeterminate'
        : false;

  const pageEmpty = status === 'success' && table.getRowModel().rows.length === 0;

  // Outside the table: on a phone the column headers are wider than the screen, and the empty
  // state would be centred in that width, half out of view.
  if (pageEmpty && (!meta || meta.total === 0)) {
    return <ListEmpty>{empty}</ListEmpty>;
  }

  return (
    <>
      <Table data-testid={testId} aria-label={label} aria-busy={isPlaceholderData || undefined}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {selection && (
                <TableHead className={selectCell}>
                  <Checkbox
                    aria-label={selection.pageLabel}
                    data-testid={selection.testId && `${selection.testId}-page`}
                    disabled={status !== 'success' || pageRows.length === 0}
                    checked={pageSelected}
                    onCheckedChange={() => selection.onChange(pageRows, pageSelected !== true)}
                  />
                </TableHead>
              )}
              {expansion && (
                <TableHead className="w-11">
                  <span className="sr-only">Detalii</span>
                </TableHead>
              )}
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
                {selection && <TableCell className={cn(cellPadding, selectCell)} />}
                {expansion && <TableCell className={cellPadding} />}
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
          ) : pageEmpty && meta && onPageChange ? (
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
            table.getRowModel().rows.map((row) => {
              const expandable = expansion?.canExpand?.(row.original) ?? Boolean(expansion);
              const open = (expandable && expansion?.isOpen(row.original)) ?? false;
              const selected = selection?.state(row.original) ?? false;
              const details = `${detailsId}-${row.id}`;
              const click = rowClickProps(
                onRowClick && (canClickRow?.(row.original) ?? true)
                  ? () => onRowClick(row.original)
                  : undefined
              );
              return (
                <Fragment key={row.id}>
                  <TableRow
                    id={rowElementId?.(row.original)}
                    data-testid={
                      typeof rowTestId === 'function' ? rowTestId(row.original) : rowTestId
                    }
                    data-open={expansion ? open : undefined}
                    data-state={selected === true ? 'selected' : undefined}
                    {...click}
                    className={cn(click.className, open && 'border-b-0 bg-muted/50')}
                  >
                    {selection && (
                      <TableCell className={cn(cellPadding, selectCell)}>
                        <Checkbox
                          aria-label={selection.label(row.original)}
                          data-testid={selection.testId}
                          checked={selected}
                          onCheckedChange={() =>
                            selection.onChange([row.original], selected !== true)
                          }
                        />
                      </TableCell>
                    )}
                    {expansion && !expandable && <TableCell className={cellPadding} />}
                    {expansion && expandable && (
                      <TableCell className={cn(cellPadding, 'w-11 pr-0')}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-my-1 -ml-2"
                          data-testid={expansion.testId}
                          aria-expanded={open}
                          aria-controls={open ? details : undefined}
                          aria-label={expansion.label(row.original)}
                          onClick={() => expansion.onToggle(row.original)}
                        >
                          <ChevronDown
                            aria-hidden="true"
                            className={cn('transition-transform', open && 'rotate-180')}
                          />
                        </Button>
                      </TableCell>
                    )}
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
                  {expansion && open && (
                    <TableRow id={details} className="bg-muted/50 hover:bg-muted/50">
                      <TableCell
                        colSpan={columnCount}
                        className="p-0 whitespace-normal first:pl-0 last:pr-0"
                      >
                        {/* Pinned to the visible part of a table that scrolls sideways. */}
                        <div className="sticky left-0 max-w-[100cqw] px-(--table-inset) pt-2 pb-5">
                          {expansion.render(row.original)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
      {status === 'success' && meta && onPageChange && noun && (
        <Pager meta={meta} noun={noun} disabled={isFetching} onPage={onPageChange} />
      )}
    </>
  );
}
