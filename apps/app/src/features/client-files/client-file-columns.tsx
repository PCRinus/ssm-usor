import { createDataTableColumns } from '@/components/data-table/columns';

import type { ClientFileRow } from './client-file-list';
import { ActionsCell, NameCell, TypeCell, UploadedCell } from './client-file-row';

const helper = createDataTableColumns<ClientFileRow>();

// Sortable column ids are the list's sort keys. `personal` is a worker's files, whose names and
// notes usually name them.
export function clientFileColumns(personal: boolean) {
  return helper.columns([
    helper.accessor((row) => row.key, {
      id: 'name',
      header: 'Nume',
      enableSorting: true,
      meta: {
        headerClassName: 'w-full min-w-60',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-48',
        personal,
      },
      cell: ({ row }) => <NameCell row={row.original} />,
    }),
    helper.display({
      id: 'type',
      header: 'Tip',
      meta: { headerClassName: 'min-w-24', skeletonClassName: 'w-12' },
      cell: ({ row }) => <TypeCell row={row.original} />,
    }),
    helper.accessor((row) => row.key, {
      id: 'uploaded',
      header: 'Încărcat',
      enableSorting: true,
      meta: { headerClassName: 'min-w-36', skeletonClassName: 'w-20' },
      cell: ({ row }) => <UploadedCell row={row.original} />,
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: { headerClassName: 'w-24', skeletonClassName: 'w-16' },
      cell: ({ row }) => <ActionsCell row={row.original} />,
    }),
  ]);
}
