import { formatCui } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
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

import type { ClientArchiveChange } from '../clients/client-archive-dialog';
import type { ClientRow } from '../clients/client-columns';
import { createDataTableColumns } from '../components/data-table/columns';
import { formatRoDate } from '../lib/dates';

const helper = createDataTableColumns<ClientRow>();

// Sortable column ids are the API sort keys: legalName and cui.
export function leadColumns(
  onArchiveChange: (change: ClientArchiveChange) => void,
  onPromote: (lead: ClientRow) => void
) {
  return helper.columns([
    helper.accessor('legalName', {
      id: 'legalName',
      header: 'Companie',
      meta: {
        headerClassName: 'pl-5',
        cellClassName: 'pl-5 font-medium',
        skeletonClassName: 'w-48',
      },
      cell: ({ row, getValue }) => (
        <Link
          to="/leads/$leadId"
          params={{ leadId: row.original.id }}
          data-testid="leads-open"
          className="hover:underline"
        >
          {getValue()}
        </Link>
      ),
    }),
    helper.display({
      id: 'contact',
      header: 'Persoană de contact',
      meta: { skeletonClassName: 'w-40' },
      cell: ({ row }) => {
        const { contactName, contactEmail, contactPhone } = row.original;
        const reach = contactEmail ?? contactPhone;
        if (!contactName && !reach) return '—';
        return (
          <>
            {contactName ?? reach}
            {contactName && reach && (
              <span className="mt-0.5 block text-xs text-muted-foreground">{reach}</span>
            )}
          </>
        );
      },
    }),
    helper.display({
      id: 'contract',
      header: 'Contract',
      meta: { skeletonClassName: 'w-20' },
      cell: ({ row }) => {
        const state = row.original.serviceContractState;
        return state === 'signed' ? (
          <Badge data-testid="leads-contract">Semnat</Badge>
        ) : state === 'received' ? (
          <Badge
            variant="outline"
            className="border-warning-border bg-warning text-warning-foreground"
            data-testid="leads-contract"
          >
            Primit
          </Badge>
        ) : state === 'sent' ? (
          <Badge variant="outline" data-testid="leads-contract">
            Trimis
          </Badge>
        ) : state === 'issued' ? (
          <Badge variant="outline" data-testid="leads-contract">
            Emis
          </Badge>
        ) : state === 'draft' ? (
          <Badge variant="secondary" data-testid="leads-contract">
            Ciornă
          </Badge>
        ) : (
          <span data-testid="leads-contract" className="text-muted-foreground">
            Fără contract
          </span>
        );
      },
    }),
    helper.accessor('cui', {
      id: 'cui',
      header: 'CUI',
      meta: { cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
      cell: ({ row, getValue }) => formatCui(getValue(), row.original.vatPayer),
    }),
    helper.display({
      id: 'createdAt',
      header: 'Adăugat',
      meta: { cellClassName: 'tabular-nums text-muted-foreground', skeletonClassName: 'w-20' },
      cell: ({ row }) => formatRoDate(row.original.createdAt.slice(0, 10)),
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
                  Restaurează…
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem asChild data-testid="leads-edit">
                    <Link to="/leads/$leadId/edit" params={{ leadId: lead.id }}>
                      <Pencil aria-hidden="true" />
                      Modifică
                    </Link>
                  </DropdownMenuItem>
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
