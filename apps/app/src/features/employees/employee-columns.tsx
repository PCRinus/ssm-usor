import { formatEmployeeName } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal, Pencil, RotateCcw, UserRoundMinus } from 'lucide-react';

import type { EmployeeListResponse } from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import { createDataTableColumns } from '@/components/data-table/columns';

import type { EmployeeStatusChange } from './employee-status-dialog';
import { workerColumns } from './worker-columns';

export type EmployeeRow = EmployeeListResponse['items'][number];

const helper = createDataTableColumns<EmployeeRow>();
const columns = workerColumns<EmployeeRow>('employees');

// Without `onStatusChange` the client is archived and the rows have no actions.
export function employeeColumns({
  former,
  withStates,
  onStatusChange,
}: {
  former: boolean;
  withStates: boolean;
  onStatusChange?: (change: EmployeeStatusChange) => void;
}) {
  return helper.columns([
    columns.name,
    columns.jobPosition,
    ...columns.training(withStates),
    columns.tests,
    columns.signatures,
    columns.hiredAt,
    ...(former ? [columns.terminatedAt] : []),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: {
        headerClassName: 'w-12',
        cellClassName: 'text-right',
        skeletonClassName: 'hidden',
      },
      cell: ({ row }) => {
        const employee = row.original;
        if (!onStatusChange) return null;
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
              <DropdownMenuItem asChild data-testid="employees-edit">
                <Link
                  to="/clienti/$clientId/angajati/$employeeId/editare"
                  state={openedHere}
                  params={{ clientId: employee.clientId, employeeId: employee.id }}
                >
                  <Pencil aria-hidden="true" />
                  Modifică
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
