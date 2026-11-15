import { createDataTableColumns } from '@/components/data-table/columns';

import { ActName, ActStatus, CitedIn, ConsolidatedForm, EmptyCell } from './watched-act-cells';
import { domainLabels, type WatchedAct } from './watched-act-list';

const helper = createDataTableColumns<WatchedAct>();

const headerLines = (first: string, second: string) => () => (
  <span className="whitespace-normal leading-tight">
    {first}
    <br />
    {second}
  </span>
);

// Sortable column ids are the list's sort keys.
export const watchedActColumns = helper.columns([
  helper.accessor('name', {
    id: 'name',
    header: 'Act normativ',
    enableSorting: true,
    meta: {
      headerClassName: 'w-full min-w-65',
      cellClassName: 'whitespace-normal',
      skeletonClassName: 'w-32',
    },
    cell: ({ row }) => <ActName act={row.original} />,
  }),
  helper.display({
    id: 'domain',
    header: 'Domeniu',
    meta: { headerClassName: 'w-26 min-w-26', skeletonClassName: 'w-12' },
    cell: ({ row }) =>
      row.original.domains.length > 0 ? (
        row.original.domains.map((domain) => domainLabels[domain]).join(', ')
      ) : (
        <EmptyCell />
      ),
  }),
  helper.display({
    id: 'status',
    header: 'Stare',
    meta: {
      headerClassName: 'w-52 min-w-52',
      cellClassName: 'whitespace-normal',
      skeletonClassName: 'w-24',
    },
    cell: ({ row }) => <ActStatus act={row.original} />,
  }),
  helper.accessor('lastConsolidatedOn', {
    id: 'consolidated',
    header: headerLines('Ultima formă', 'consolidată'),
    enableSorting: true,
    sortDescFirst: true,
    meta: { headerClassName: 'w-44 min-w-44', skeletonClassName: 'w-20' },
    cell: ({ row }) => <ConsolidatedForm act={row.original} />,
  }),
  helper.accessor((act) => act.citedIn.documents, {
    id: 'cited',
    header: 'Citat în',
    enableSorting: true,
    sortDescFirst: true,
    meta: { headerClassName: 'w-40 min-w-40', skeletonClassName: 'w-24' },
    cell: ({ row }) => <CitedIn act={row.original} />,
  }),
]);
