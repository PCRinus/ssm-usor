import { createDataTableColumns } from '@/components/data-table/columns';

import { ActionCell, ChangedCell, ClientsCell, DocumentCell } from './behind-cells';
import type { BehindType } from './regeneration-copy';

const column = createDataTableColumns<BehindType>();

export const behindColumns = [
  column.display({
    id: 'document',
    header: 'Document',
    meta: { cellClassName: 'w-[27%] min-w-56 whitespace-normal align-top' },
    cell: ({ row }) => <DocumentCell type={row.original} />,
  }),
  column.display({
    id: 'changed',
    header: 'Ce s-a schimbat',
    meta: { cellClassName: 'min-w-72 whitespace-normal align-top' },
    cell: ({ row }) => <ChangedCell type={row.original} />,
  }),
  column.display({
    id: 'clients',
    header: 'Clienți',
    meta: { cellClassName: 'w-36 align-top' },
    cell: ({ row }) => <ClientsCell type={row.original} />,
  }),
  column.display({
    id: 'action',
    header: () => <span className="sr-only">Regenerare</span>,
    meta: { cellClassName: 'w-px text-right align-top', headerClassName: 'w-px' },
    cell: ({ row }) => <ActionCell type={row.original} />,
  }),
];
