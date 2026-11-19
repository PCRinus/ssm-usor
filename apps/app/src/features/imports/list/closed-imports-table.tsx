import { defaultPageSize, type ImportKind } from '@ssm-usor/contracts';
import { Link, useNavigate } from '@tanstack/react-router';
import { Archive, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadFailed } from '@/components/load-failed';
import { Masked } from '@/components/replay';
import { shortDayMonthFormat } from '@/lib/dates';

import { filesLabel, photosLabel } from '../import-format';
import { linkOf } from '../import-ready-notices';
import { importNoun, useClosedImports } from './use-closed-imports';

type ClosedImport = ImportListResponseItemsItem;

const helper = createDataTableColumns<ClosedImport>();

const nameOf = (item: ClosedImport) =>
  item.client?.legalName ?? item.companyName ?? 'Client fără nume';

function resultOf(item: ClosedImport) {
  if (item.status === 'abandoned') return 'Renunțat';
  if (item.kind === 'employees') return 'Lucrători adăugați';
  return item.intoExistingClient ? 'Client completat' : 'Client creat';
}

const readLines = (item: ClosedImport) =>
  item.kind === 'employees'
    ? ['Fișe de instruire', photosLabel(item.fileCount)]
    : ['Dosarul SSM și SU', item.fileCount === 1 ? '1 fișier' : filesLabel(item.fileCount)];

const closedAt = (item: ClosedImport) => item.confirmedAt ?? item.abandonedAt ?? item.createdAt;

const opens = (item: ClosedImport) => item.status === 'confirmed';

function closedColumns(kind: ImportKind) {
  return helper.columns([
    helper.display({
      id: 'client',
      header: 'Client',
      meta: { cellClassName: 'min-w-52 whitespace-normal', skeletonClassName: 'w-44' },
      cell: ({ row }) => (
        <>
          {opens(row.original) ? (
            <Link
              {...linkOf(row.original)}
              state={openedHere}
              data-testid="imports-closed-open"
              className="font-medium wrap-anywhere hover:underline"
            >
              {nameOf(row.original)}
            </Link>
          ) : (
            <span className="font-medium wrap-anywhere">{nameOf(row.original)}</span>
          )}
          {row.original.companyCui && <CellNote>CUI {row.original.companyCui}</CellNote>}
        </>
      ),
    }),
    helper.display({
      id: 'read',
      header: 'Ce a citit AI',
      meta: { headerClassName: 'w-48', skeletonClassName: 'w-28' },
      cell: ({ row }) => {
        const [what, count] = readLines(row.original);
        return (
          <>
            {what}
            <CellNote>{count}</CellNote>
          </>
        );
      },
    }),
    helper.display({
      id: 'result',
      header: 'Rezultat',
      meta: { headerClassName: kind === 'client' ? 'w-44' : 'w-48', skeletonClassName: 'w-24' },
      cell: ({ row }) => <span data-testid="imports-closed-result">{resultOf(row.original)}</span>,
    }),
    helper.display({
      id: 'closed',
      header: 'Încheiat',
      meta: { headerClassName: 'w-44', skeletonClassName: 'w-20' },
      cell: ({ row }) => (
        <>
          <span className="tabular-nums">
            {shortDayMonthFormat.format(new Date(closedAt(row.original)))}
          </span>
          {row.original.createdBy?.fullName && (
            <CellNote>
              <span className="sr-only">Pornit de </span>
              <Masked>{row.original.createdBy.fullName}</Masked>
            </CellNote>
          )}
        </>
      ),
    }),
    helper.display({
      id: 'open',
      header: () => <span className="sr-only">Deschide</span>,
      meta: { headerClassName: 'w-10', skeletonClassName: 'hidden' },
      cell: ({ row }) =>
        opens(row.original) ? (
          <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
        ) : null,
    }),
  ]);
}

const rowKey = (item: ClosedImport) => item.id;

export function ClosedImportsTable({
  kind,
  page,
  onPageChange,
}: {
  kind: ImportKind;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const navigate = useNavigate();
  const closed = useClosedImports({ kind, page, pageSize: defaultPageSize });
  const columns = useMemo(() => closedColumns(kind), [kind]);
  const meta = closed.data ?? { page, pageSize: defaultPageSize, total: 0 };
  return (
    <DataTable
      testId="imports-closed"
      rowTestId="imports-closed-row"
      label={
        kind === 'employees'
          ? 'Importurile de lucrători încheiate'
          : 'Importurile de clienți încheiate'
      }
      columns={columns}
      data={closed.data?.items}
      rowKey={rowKey}
      onRowClick={(item) => void navigate({ ...linkOf(item), state: openedHere })}
      canClickRow={opens}
      meta={meta}
      noun={importNoun}
      status={closed.status}
      isFetching={closed.isFetching}
      isPlaceholderData={closed.isPlaceholderData}
      onPageChange={onPageChange}
      error={
        <LoadFailed
          error={closed.error}
          testId="imports-closed-error"
          busy={closed.isFetching}
          onRetry={() => void closed.refetch()}
        >
          Nu am putut încărca importurile încheiate.
        </LoadFailed>
      }
      empty={
        <EmptyState
          icon={Archive}
          title="Niciun import încheiat"
          data-testid="imports-closed-empty"
        >
          Importurile confirmate și cele la care s-a renunțat apar aici.
        </EmptyState>
      }
    />
  );
}
