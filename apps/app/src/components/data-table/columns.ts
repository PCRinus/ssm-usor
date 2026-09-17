import type { SortOrder } from '@ssm-usor/contracts';
import {
  type ColumnDef,
  createColumnHelper,
  type RowData,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/react-table';

// Presentation hints a column may carry; the table itself stays headless.
export interface DataTableColumnMeta {
  headerClassName?: string;
  cellClassName?: string;
  // Width of the placeholder shown while the first page loads.
  skeletonClassName?: string;
}

// Server-side tables: the API pages and sorts, the table only renders and reports
// intent. One sort key at a time, never removed, so every list has an order.
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, unknown>;

// Column ids double as the API sort keys for sortable columns.
export function createDataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export interface DataTableSort {
  sort: string;
  order: SortOrder;
}
