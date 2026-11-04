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
import { Archive, ArchiveRestore, MoreHorizontal, Pencil } from 'lucide-react';

import { createDataTableColumns } from '@/components/data-table/columns';
import { formatRoDate } from '@/lib/dates';

import type { InstructionArchiveChange } from './instruction-archive-dialog';
import {
  articleCountLabel,
  groupLabels,
  type InstructionModule,
  positionCountLabel,
} from './instruction-schema';

const helper = createDataTableColumns<InstructionModule>();

// Sortable column ids are the API sort keys: title, group, version, appliedCount.
export function instructionColumns({
  onEdit,
  onArchiveChange,
}: {
  onEdit: (module: InstructionModule) => void;
  onArchiveChange: (change: InstructionArchiveChange) => void;
}) {
  return helper.columns([
    helper.accessor('title', {
      id: 'title',
      header: 'Titlu',
      meta: { cellClassName: 'min-w-52 font-medium whitespace-normal', skeletonClassName: 'w-48' },
      cell: ({ row, getValue }) => (
        <Link
          to="/instructiuni/$moduleId"
          params={{ moduleId: row.original.id }}
          state={{ openedFromList: true }}
          data-testid="instruction-open"
          className="hover:underline"
        >
          {getValue()}
        </Link>
      ),
    }),
    helper.accessor('group', {
      id: 'group',
      header: 'Categorie',
      meta: { skeletonClassName: 'w-28' },
      cell: ({ getValue }) => <Badge variant="outline">{groupLabels[getValue()]}</Badge>,
    }),
    helper.accessor((module) => module.version.createdAt, {
      id: 'version',
      header: 'Versiune',
      sortDescFirst: true,
      meta: { cellClassName: 'text-muted-foreground', skeletonClassName: 'w-32' },
      cell: ({ row }) => {
        const { version } = row.original;
        return (
          <>
            <span data-testid="instruction-version">
              {`v${version.number} · ${articleCountLabel(version.articleCount).toLowerCase()}`}
            </span>
            <span className="mt-0.5 block text-xs tabular-nums">
              {`din ${formatRoDate(version.createdAt.slice(0, 10))}`}
            </span>
          </>
        );
      },
    }),
    helper.accessor('appliedCount', {
      id: 'appliedCount',
      header: 'Aplicată la',
      meta: { cellClassName: 'text-muted-foreground', skeletonClassName: 'w-20' },
      cell: ({ getValue }) => (
        <span data-testid="instruction-applied">{positionCountLabel(getValue())}</span>
      ),
    }),
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
