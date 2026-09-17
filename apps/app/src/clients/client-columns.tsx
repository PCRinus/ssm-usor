import { type CountyCode, countyNames, formatCui } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';

import type { ClientListResponse } from '../api/generated/api';
import { createDataTableColumns } from '../components/data-table/columns';

export type ClientRow = ClientListResponse['items'][number];

const helper = createDataTableColumns<ClientRow>();

export function registeredOffice(client: Pick<ClientRow, 'countyCode' | 'locality'>) {
  const county = client.countyCode ? countyNames[client.countyCode as CountyCode] : null;
  return [client.locality, county].filter(Boolean).join(', ');
}

// Sortable column ids are the API sort keys: legalName, cui, declaredEmployeeCount.
export const clientColumns = helper.columns([
  helper.accessor('legalName', {
    id: 'legalName',
    header: 'Companie',
    meta: { headerClassName: 'pl-5', cellClassName: 'pl-5 font-medium', skeletonClassName: 'w-48' },
    cell: ({ row, getValue }) => (
      <>
        <Link
          to="/clients/$clientId/employees"
          params={{ clientId: row.original.id }}
          data-testid="clients-open"
          className="hover:underline"
        >
          {getValue()}
        </Link>
        {row.original.caenCode && (
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            CAEN {row.original.caenCode}
          </span>
        )}
      </>
    ),
  }),
  helper.accessor('cui', {
    id: 'cui',
    header: 'CUI',
    meta: { cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
    cell: ({ row, getValue }) => formatCui(getValue(), row.original.vatPayer),
  }),
  helper.display({
    id: 'office',
    header: 'Sediu social',
    meta: { skeletonClassName: 'w-36' },
    cell: ({ row }) => registeredOffice(row.original) || '—',
  }),
  helper.accessor('declaredEmployeeCount', {
    id: 'declaredEmployeeCount',
    header: 'Angajați',
    meta: {
      headerClassName: 'pr-5 text-right',
      cellClassName: 'pr-5 text-right tabular-nums',
      skeletonClassName: 'ml-auto w-10',
    },
    cell: ({ getValue }) => getValue() ?? '—',
  }),
]);
