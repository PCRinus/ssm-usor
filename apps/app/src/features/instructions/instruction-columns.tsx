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

import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';
import { UsageCell } from '@/components/data-table/usage-cell';
import { roCount } from '@/features/employees/employee-format';
import { formatRoDateOf } from '@/lib/dates';

import type { InstructionArchiveChange } from './instruction-archive-dialog';
import { groupLabels, type InstructionModule } from './instruction-schema';

const helper = createDataTableColumns<InstructionModule>();

const usageColumn = helper.accessor('positionCount', {
  id: 'appliedCount',
  header: 'Folosită la',
  sortDescFirst: true,
  meta: { headerClassName: 'w-42', skeletonClassName: 'w-24' },
  cell: ({ row }) => (
    <UsageCell
      count={row.original.positionCount}
      noun={['post', 'posturi']}
      clientCount={row.original.clientCount}
      testId="instruction-usage"
    />
  ),
});

// Sortable column ids are the API sort keys: title, group, version, appliedCount. An archived
// module is applied nowhere, so its tab leaves out "Folosită la".
export function instructionColumns({
  archived,
  onEdit,
  onArchiveChange,
}: {
  archived: boolean;
  onEdit: (module: InstructionModule) => void;
  onArchiveChange: (change: InstructionArchiveChange) => void;
}) {
  return helper.columns([
    helper.accessor('title', {
      id: 'title',
      header: 'Titlu',
      meta: { cellClassName: 'min-w-60 font-medium whitespace-normal', skeletonClassName: 'w-48' },
      cell: ({ row, getValue }) => (
        <Link
          to="/instructiuni/$moduleId"
          params={{ moduleId: row.original.id }}
          state={openedHere}
          data-testid="instruction-open"
          className="wrap-anywhere hover:underline"
        >
          {getValue()}
        </Link>
      ),
    }),
    helper.accessor('group', {
      id: 'group',
      header: 'Categorie',
      meta: {
        headerClassName: 'w-48',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-28',
      },
      cell: ({ getValue }) => (
        <span data-testid="instruction-category">{groupLabels[getValue()]}</span>
      ),
    }),
    helper.accessor((module) => module.version.createdAt, {
      id: 'version',
      header: 'Versiune',
      sortDescFirst: true,
      meta: { headerClassName: 'w-42', skeletonClassName: 'w-32' },
      cell: ({ row }) => {
        const { version } = row.original;
        return (
          <span className="tabular-nums">
            <span data-testid="instruction-version">
              {`v${version.number}, din ${formatRoDateOf(version.createdAt)}`}
            </span>
            <CellNote>{roCount(version.articleCount, 'articol', 'articole')}</CellNote>
          </span>
        );
      },
    }),
    ...(archived ? [] : [usageColumn]),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: { headerClassName: 'w-12', cellClassName: 'text-right', skeletonClassName: 'hidden' },
      cell: ({ row }) => {
        const module = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="instruction-actions"
                aria-label={`Acțiuni pentru ${module.title}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {module.archivedAt ? (
                <DropdownMenuItem
                  data-testid="instruction-restore"
                  onSelect={() => onArchiveChange({ module, action: 'restore' })}
                >
                  <ArchiveRestore aria-hidden="true" />
                  Reactivează…
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem data-testid="instruction-edit" onSelect={() => onEdit(module)}>
                    <Pencil aria-hidden="true" />
                    Modifică detaliile…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid="instruction-archive"
                    variant="destructive"
                    onSelect={() => onArchiveChange({ module, action: 'archive' })}
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
