import { Link } from '@tanstack/react-router';

import type { OrganizationEmployeeListResponse } from '@/api/generated/api';
import { openedFromSection, openedHere } from '@/app/opener';
import { createDataTableColumns } from '@/components/data-table/columns';

import { workerColumns } from './worker-columns';

export type OrganizationEmployeeRow = OrganizationEmployeeListResponse['items'][number];

const helper = createDataTableColumns<OrganizationEmployeeRow>();
const columns = workerColumns<OrganizationEmployeeRow>(
  'organization-employees',
  openedFromSection('/angajati')
);

const clientColumn = helper.accessor((row) => row.client.name, {
  id: 'client',
  header: 'Client',
  enableSorting: true,
  meta: { cellClassName: 'max-w-48', skeletonClassName: 'w-36' },
  cell: ({ row, getValue }) => (
    <Link
      to="/clienti/$clientId/detalii"
      state={openedHere}
      params={{ clientId: row.original.client.id }}
      data-testid="organization-employees-client"
      className="block truncate hover:underline"
      title={getValue()}
    >
      {getValue()}
    </Link>
  ),
});

export const organizationEmployeeColumns = helper.columns([
  columns.name,
  clientColumn,
  columns.jobPosition,
  ...columns.training(true),
  columns.tests,
  columns.signatures,
  columns.hiredAt,
]);

export const formerOrganizationEmployeeColumns = helper.columns([
  columns.name,
  clientColumn,
  columns.jobPosition,
  ...columns.training(false),
  columns.tests,
  columns.signatures,
  columns.hiredAt,
  columns.terminatedAt,
]);
