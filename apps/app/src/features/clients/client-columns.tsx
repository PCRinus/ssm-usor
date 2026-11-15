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
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import type { ClientListResponse } from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import { CellEmpty, CellNote } from '@/components/data-table/cell-note';
import {
  createDataTableColumns,
  narrowHeader,
  twoLineHeader,
} from '@/components/data-table/columns';
import { formatRoDate } from '@/lib/dates';

import type { ClientArchiveChange } from './client-archive-dialog';
import type { ClientToDelete } from './client-delete-dialog';
import { DocumentationBadge } from './documentation-badge';
import { TrainingCell } from './training-cell';

export type ClientRow = ClientListResponse['items'][number];

const helper = createDataTableColumns<ClientRow>();

// Every column but the name keeps to its content, and the long headers break into two lines,
// so the name gets the room: at 1440 px with the sidebar open a long one stays on one line.

const numeric = {
  headerClassName: 'w-px text-right',
  cellClassName: 'text-right tabular-nums',
  skeletonClassName: 'ml-auto w-10',
};

function documentationColumn(
  id: 'documentation' | 'fireSafetyDocumentation',
  header: string,
  testId: string
) {
  return helper.accessor((client) => client[id]?.issuedCount ?? 0, {
    id,
    header: twoLineHeader(header),
    meta: { headerClassName: narrowHeader, skeletonClassName: 'w-24' },
    cell: ({ row }) => {
      const documentation = row.original[id];
      if (!documentation) return null;
      return (
        <span className="flex items-center gap-2">
          <DocumentationBadge state={documentation.state} testId={testId} />
          {documentation.state !== 'none' && (
            <span className="text-xs tabular-nums">
              <span data-testid={`${testId}-progress`} aria-hidden="true">
                {`${documentation.issuedCount}/${documentation.totalCount}`}
              </span>
              <span className="sr-only">
                {`${documentation.issuedCount} din ${documentation.totalCount} ${documentation.issuedCount === 1 ? 'emis' : 'emise'}`}
              </span>
            </span>
          )}
        </span>
      );
    },
  });
}

// Sortable column ids are the API sort keys. `onArchiveChange` is left out for a member who is
// not an owner.
export function clientColumns({
  onArchiveChange,
  onDelete,
}: {
  onArchiveChange?: (change: ClientArchiveChange) => void;
  onDelete: (client: ClientToDelete) => void;
}) {
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
            to="/clienti/$clientId/detalii"
            state={openedHere}
            params={{ clientId: row.original.id }}
            data-testid="clients-open"
            className="hover:underline"
          >
            {getValue()}
          </Link>
          <CellNote data-testid="clients-cui" className="tabular-nums">
            {formatCui(row.original.cui, row.original.vatPayer)}
          </CellNote>
        </>
      ),
    }),
    helper.accessor('currentEmployeeCount', {
      id: 'currentEmployeeCount',
      header: 'Lucrători',
      meta: numeric,
      cell: ({ getValue }) => getValue(),
    }),
    documentationColumn('documentation', 'Documentație SSM', 'clients-documentation'),
    documentationColumn(
      'fireSafetyDocumentation',
      'Documentație SU',
      'clients-fire-safety-documentation'
    ),
    helper.accessor((client) => client.training?.attentionCount ?? 0, {
      id: 'training',
      header: 'Instruire',
      meta: { headerClassName: narrowHeader, skeletonClassName: 'w-24' },
      cell: ({ row }) => <TrainingCell client={row.original} />,
    }),
    helper.accessor((client) => client.training?.nextDueOn ?? null, {
      id: 'nextTrainingDueOn',
      header: twoLineHeader('Următorul termen'),
      meta: {
        headerClassName: narrowHeader,
        cellClassName: 'tabular-nums',
        skeletonClassName: 'w-20',
      },
      cell: ({ getValue }) => {
        const nextDueOn = getValue();
        return nextDueOn ? formatRoDate(nextDueOn) : <CellEmpty />;
      },
    }),
    helper.accessor('clientSince', {
      id: 'clientSince',
      header: 'Adăugat',
      sortDescFirst: true,
      meta: {
        headerClassName: narrowHeader,
        cellClassName: 'tabular-nums',
        skeletonClassName: 'w-20',
      },
      cell: ({ getValue }) => {
        const since = getValue();
        return since ? formatRoDate(since.slice(0, 10)) : null;
      },
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
        const client = row.original;
        const archived = client.archivedAt !== null;
        if (archived && !onArchiveChange && !client.canDelete) return null;
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
                <>
                  {onArchiveChange && (
                    <DropdownMenuItem
                      data-testid="clients-restore"
                      onSelect={() => onArchiveChange({ client, action: 'restore' })}
                    >
                      <ArchiveRestore aria-hidden="true" />
                      Reactivează…
                    </DropdownMenuItem>
                  )}
                  {onArchiveChange && client.canDelete && <DropdownMenuSeparator />}
                  {client.canDelete && (
                    <DropdownMenuItem
                      data-testid="clients-delete"
                      variant="destructive"
                      onSelect={() => onDelete(client)}
                    >
                      <Trash2 aria-hidden="true" />
                      Șterge definitiv…
                    </DropdownMenuItem>
                  )}
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild data-testid="clients-edit">
                    <Link
                      to="/clienti/$clientId/detalii"
                      params={{ clientId: client.id }}
                      state={openedHere}
                    >
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
