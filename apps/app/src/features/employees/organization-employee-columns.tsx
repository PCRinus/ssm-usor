import { formatEmployeeName } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';

import type { OrganizationEmployeeListResponse } from '@/api/generated/api';
import { createDataTableColumns } from '@/components/data-table/columns';
import { TrainingStatusBadges } from '@/features/trainings/training-state-badge';

import { formatDate } from './employee-format';

export type OrganizationEmployeeRow = OrganizationEmployeeListResponse['items'][number];

const helper = createDataTableColumns<OrganizationEmployeeRow>();

export const organizationEmployeeColumns = helper.columns([
  helper.accessor((row) => formatEmployeeName(row), {
    id: 'name',
    header: 'Angajat',
    enableSorting: true,
    meta: {
      headerClassName: 'pl-5',
      cellClassName: 'pl-5 font-medium',
      skeletonClassName: 'w-40',
    },
    cell: ({ row, getValue }) => (
      <>
        <Link
          to="/clients/$clientId/employees/$employeeId"
          params={{ clientId: row.original.client.id, employeeId: row.original.id }}
          data-testid="organization-employees-open"
          className="hover:underline"
        >
          {getValue()}
        </Link>
        {row.original.employeeNumber && (
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            Marca {row.original.employeeNumber}
          </span>
        )}
      </>
    ),
  }),
  helper.accessor((row) => row.client.name, {
    id: 'client',
    header: 'Client',
    enableSorting: true,
    meta: { cellClassName: 'max-w-64', skeletonClassName: 'w-36' },
    cell: ({ row, getValue }) => (
      <Link
        to="/clients/$clientId/details"
        params={{ clientId: row.original.client.id }}
        data-testid="organization-employees-client"
        className="block truncate hover:underline"
      >
        {getValue()}
      </Link>
    ),
  }),
  helper.accessor((row) => row.jobPosition.name, {
    id: 'jobPosition',
    header: 'Post de lucru',
    enableSorting: true,
    meta: { skeletonClassName: 'w-28' },
  }),
  helper.display({
    id: 'training',
    header: 'Instruire',
    meta: { skeletonClassName: 'w-20' },
    cell: ({ row }) => <TrainingStatusBadges training={row.original.training} />,
  }),
  helper.accessor('hiredAt', {
    id: 'hiredAt',
    header: 'Angajat din',
    enableSorting: true,
    meta: { cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
    cell: ({ row, getValue }) => (
      <>
        {formatDate(getValue())}
        {row.original.terminatedAt && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            până la {formatDate(row.original.terminatedAt)}
          </span>
        )}
      </>
    ),
  }),
]);
