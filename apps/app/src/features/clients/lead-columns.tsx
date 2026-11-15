import { formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, UserCheck } from 'lucide-react';

import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns, narrowHeader } from '@/components/data-table/columns';
import { formatRoDateOf } from '@/lib/dates';

import type { ClientArchiveChange } from './client-archive-dialog';
import type { ClientRow } from './client-columns';
import { LeadContractCell } from './lead-contract-cell';

const helper = createDataTableColumns<ClientRow>();

// Sortable column ids are the API sort keys.
export function leadColumns(
  onArchiveChange: (change: ClientArchiveChange) => void,
  onPromote: (lead: ClientRow) => void,
  editable: boolean
) {
  return helper.columns([
    helper.accessor('legalName', {
      id: 'legalName',
      header: 'Companie',
      meta: {
        cellClassName: 'min-w-56 font-medium whitespace-normal',
        skeletonClassName: 'w-48',
      },
      cell: ({ row, getValue }) => (
        <>
          <Link
            to="/oferte/$leadId"
            state={openedHere}
            params={{ leadId: row.original.id }}
            data-testid="leads-open"
            className="hover:underline"
          >
            {getValue()}
          </Link>
          <CellNote data-testid="leads-cui" className="tabular-nums">
            {formatCui(row.original.cui, row.original.vatPayer)}
          </CellNote>
        </>
      ),
    }),
    helper.display({
      id: 'contact',
      header: 'Persoană de contact',
      meta: {
        headerClassName: 'w-68',
        skeletonClassName: 'w-40',
        personal: true,
      },
      cell: ({ row }) => {
        const { contactName, contactEmail, contactPhone } = row.original;
        const reach = contactEmail ?? contactPhone;
        if (!contactName && !reach) return <span className="text-muted-foreground">—</span>;
        return (
          <>
            <span className="block max-w-60 truncate">{contactName ?? reach}</span>
            {contactName && reach && <CellNote className="max-w-60 truncate">{reach}</CellNote>}
          </>
        );
      },
    }),
    helper.accessor('declaredEmployeeCount', {
      id: 'declaredEmployeeCount',
      header: 'Lucrători',
      meta: {
        headerClassName: 'w-px text-right',
        cellClassName: 'text-right tabular-nums',
        skeletonClassName: 'ml-auto w-10',
      },
      cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
    }),
    helper.accessor('serviceContractState', {
      id: 'serviceContractState',
      header: 'Contract',
      meta: { headerClassName: 'w-44', skeletonClassName: 'w-20' },
      cell: ({ row }) => <LeadContractCell lead={row.original} />,
    }),
    helper.accessor('createdAt', {
      id: 'createdAt',
      header: 'Adăugat',
      sortDescFirst: true,
      meta: {
        headerClassName: narrowHeader,
        cellClassName: 'tabular-nums text-muted-foreground',
        skeletonClassName: 'w-20',
      },
      cell: ({ getValue }) => formatRoDateOf(getValue()),
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: {
        headerClassName: 'w-12',
        cellClassName: 'text-right',
        skeletonClassName: 'hidden',
      },
      cell: ({ row }) => {
        const lead = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="leads-row-menu"
                aria-label={`Acțiuni pentru ${lead.legalName}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {lead.archivedAt !== null ? (
                <DropdownMenuItem
                  data-testid="leads-restore"
                  onSelect={() => onArchiveChange({ client: lead, action: 'restore' })}
                >
                  <ArchiveRestore aria-hidden="true" />
                  Reactivează…
                </DropdownMenuItem>
              ) : (
                <>
                  {editable && (
                    <DropdownMenuItem asChild data-testid="leads-edit">
                      <Link
                        to="/oferte/$leadId/editare"
                        params={{ leadId: lead.id }}
                        state={openedHere}
                      >
                        <Pencil aria-hidden="true" />
                        Modifică
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem data-testid="leads-promote" onSelect={() => onPromote(lead)}>
                    <UserCheck aria-hidden="true" />
                    Transformă în client…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid="leads-archive"
                    variant="destructive"
                    onSelect={() => onArchiveChange({ client: lead, action: 'archive' })}
                  >
                    <Archive aria-hidden="true" />
                    Arhivează…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ]);
}
