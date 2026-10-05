import { type CountyCode, countyNames, formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil } from 'lucide-react';

import type { ClientListResponse } from '@/api/generated/api';
import { createDataTableColumns } from '@/components/data-table/columns';
import { formatRoDate } from '@/lib/dates';

import type { ClientArchiveChange } from './client-archive-dialog';
import { DocumentationBadge } from './documentation-badge';

export type ClientRow = ClientListResponse['items'][number];

const helper = createDataTableColumns<ClientRow>();

const numeric = {
  headerClassName: 'text-right',
  cellClassName: 'text-right tabular-nums',
  skeletonClassName: 'ml-auto w-10',
};

function registeredOffice(client: Pick<ClientRow, 'countyCode' | 'locality'>) {
  const county = client.countyCode ? countyNames[client.countyCode as CountyCode] : null;
  return [client.locality, county].filter(Boolean).join(', ');
}

// Sortable column ids are the API sort keys: legalName, cui, currentEmployeeCount,
// jobPositionCount, documentation, clientSince. `onArchiveChange` is left out for a member who
// is not an owner.
export function clientColumns(onArchiveChange?: (change: ClientArchiveChange) => void) {
  return helper.columns([
    helper.accessor('legalName', {
      id: 'legalName',
      header: 'Companie',
      meta: {
        headerClassName: 'pl-5',
        cellClassName: 'min-w-52 pl-5 font-medium whitespace-normal',
        skeletonClassName: 'w-48',
      },
      cell: ({ row, getValue }) => {
        const office = registeredOffice(row.original);
        return (
          <>
            <Link
              to="/clients/$clientId/details"
              params={{ clientId: row.original.id }}
              data-testid="clients-open"
              className="hover:underline"
            >
              {getValue()}
            </Link>
            {office && (
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {office}
              </span>
            )}
          </>
        );
      },
    }),
    helper.accessor('cui', {
      id: 'cui',
      header: 'CUI',
      meta: { cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
      cell: ({ row, getValue }) => formatCui(getValue(), row.original.vatPayer),
    }),
    helper.accessor('currentEmployeeCount', {
      id: 'currentEmployeeCount',
      header: 'Angajați',
      meta: numeric,
      cell: ({ getValue }) => getValue(),
    }),
    helper.accessor((client) => client.jobPositionCount ?? 0, {
      id: 'jobPositionCount',
      header: 'Posturi',
      meta: numeric,
      cell: ({ row, getValue }) => {
        const count = getValue();
        const needingWork = row.original.jobPositionsNeedingWorkCount ?? 0;
        return (
          <>
            {count}
            {(count === 0 || needingWork > 0) && (
              <span
                data-testid="clients-positions-work"
                className="mt-0.5 block text-xs text-warning-foreground"
              >
                {count === 0 ? 'de adăugat' : `${needingWork} de completat`}
              </span>
            )}
          </>
        );
      },
    }),
    helper.accessor((client) => client.documentation?.issuedCount ?? 0, {
      id: 'documentation',
      header: 'Documentație',
      meta: { skeletonClassName: 'w-24' },
      cell: ({ row }) => {
        const documentation = row.original.documentation;
        if (!documentation) return null;
        return (
          <>
            <span className="flex items-center gap-2">
              <DocumentationBadge state={documentation.state} />
              {documentation.state !== 'none' && (
                <span
                  data-testid="clients-documentation-progress"
                  className="text-xs text-muted-foreground tabular-nums"
                >
                  {`${documentation.issuedCount} din ${documentation.totalCount} ${documentation.issuedCount === 1 ? 'emis' : 'emise'}`}
                </span>
              )}
            </span>
            {documentation.lastGeneratedAt && (
              <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                generată {formatRoDate(documentation.lastGeneratedAt.slice(0, 10))}
              </span>
            )}
          </>
        );
      },
    }),
    helper.accessor('clientSince', {
      id: 'clientSince',
      header: 'Adăugat',
      sortDescFirst: true,
      meta: { cellClassName: 'tabular-nums text-muted-foreground', skeletonClassName: 'w-20' },
      cell: ({ getValue }) => {
        const since = getValue();
        return since ? formatRoDate(since.slice(0, 10)) : null;
      },
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
        const client = row.original;
        const archived = client.archivedAt !== null;
        if (archived && !onArchiveChange) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="clients-row-menu"
                aria-label={`Acțiuni pentru ${client.legalName}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {archived ? (
                <DropdownMenuItem
                  data-testid="clients-restore"
                  onSelect={() => onArchiveChange?.({ client, action: 'restore' })}
                >
                  <ArchiveRestore aria-hidden="true" />
                  Restaurează…
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem asChild data-testid="clients-edit">
                    <Link to="/clients/$clientId/details" params={{ clientId: client.id }}>
                      <Pencil aria-hidden="true" />
                      Modifică
                    </Link>
                  </DropdownMenuItem>
                  {onArchiveChange && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        data-testid="clients-archive"
                        variant="destructive"
                        onSelect={() => onArchiveChange({ client, action: 'archive' })}
                      >
                        <Archive aria-hidden="true" />
                        Arhivează…
                      </DropdownMenuItem>
                    </>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ]);
}
