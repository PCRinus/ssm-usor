import { formatEmployeeName } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal, RotateCcw, UserRoundMinus } from 'lucide-react';

import type { EmployeeListResponse } from '../api/generated/api';
import { createDataTableColumns } from '../components/data-table/columns';
import { formatDate } from './employee-format';
import type { EmployeeStatusChange } from './employee-status-dialog';

export type EmployeeRow = EmployeeListResponse['items'][number];

const helper = createDataTableColumns<EmployeeRow>();

// Sortable column ids are the API sort keys: name, jobPosition, hiredAt.
export function employeeColumns(onStatusChange: (change: EmployeeStatusChange) => void) {
  return helper.columns([
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
            params={{ clientId: row.original.clientId, employeeId: row.original.id }}
            data-testid="employees-open"
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
    // The post the person fills; the contract title is on their page (ADR 006).
    helper.accessor((row) => row.jobPosition.name, {
      id: 'jobPosition',
      header: 'Post de lucru',
      enableSorting: true,
      meta: { skeletonClassName: 'w-28' },
    }),
    helper.display({
      id: 'contact',
      header: 'Contact',
      meta: { cellClassName: 'max-w-56 text-sm', skeletonClassName: 'w-40' },
      cell: ({ row }) => {
        const { email, phone } = row.original;
        if (!email && !phone) return '—';
        return (
          <>
            {email && <span className="block truncate">{email}</span>}
            {phone && <span className="block tabular-nums">{phone}</span>}
          </>
        );
      },
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
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: {
        headerClassName: 'w-12 pr-3',
        cellClassName: 'pr-3 text-right',
        skeletonClassName: 'hidden',
      },
      cell: ({ row }) => {
        const employee = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="employees-row-menu"
                aria-label={`Acțiuni pentru ${formatEmployeeName(employee)}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {employee.status === 'active' ? (
                <DropdownMenuItem
                  data-testid="employees-terminate"
                  onSelect={() => onStatusChange({ employee, action: 'terminate' })}
                >
                  <UserRoundMinus aria-hidden="true" />
                  Marchează plecarea…
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  data-testid="employees-reactivate"
                  onSelect={() => onStatusChange({ employee, action: 'reactivate' })}
                >
                  <RotateCcw aria-hidden="true" />
                  Reactivează…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ]);
}
