import { isOverAcceptableLimit } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { createDataTableColumns, type DataTableColumnMeta } from '@/components/data-table/columns';
import { formatGlobalLevel } from '@/features/risk-evaluations/risk-evaluation-schema';
import { dateToIso, formatRoDate } from '@/lib/dates';

import type { ProfileArchiveChange } from './profile-archive-dialog';
import { clientCountLabel, type EvaluationProfileSummary } from './profile-schema';

const helper = createDataTableColumns<EvaluationProfileSummary>();

const numeric: DataTableColumnMeta = {
  headerClassName: 'text-right',
  cellClassName: 'text-right tabular-nums',
  skeletonClassName: 'ml-auto w-8',
};

// Sortable column ids are the API sort keys: name, factorCount, clientCount, updatedAt.
export function profileColumns({
  onRename,
  onArchiveChange,
  onRemove,
}: {
  onRename: (profile: EvaluationProfileSummary) => void;
  onArchiveChange: (change: ProfileArchiveChange) => void;
  onRemove: (profile: EvaluationProfileSummary) => void;
}) {
  return helper.columns([
    helper.accessor('name', {
      id: 'name',
      header: 'Post',
      meta: { cellClassName: 'min-w-48 font-medium whitespace-normal', skeletonClassName: 'w-48' },
      cell: ({ row, getValue }) => (
        <Link
          to="/evaluari-de-risc/$profileId"
          params={{ profileId: row.original.id }}
          state={{ openedFromList: true }}
          data-testid="risk-profile-open"
          className="wrap-anywhere hover:underline"
        >
          {getValue()}
        </Link>
      ),
    }),
    helper.accessor('factorCount', {
      id: 'factorCount',
      header: 'Factori',
      meta: numeric,
      cell: ({ getValue }) => <span data-testid="risk-profile-factors">{getValue()}</span>,
    }),
    helper.accessor('unacceptableFactorCount', {
      id: 'unacceptable',
      header: 'Inacceptabili',
      enableSorting: false,
      meta: numeric,
      cell: ({ getValue }) => {
        const count = getValue();
        return (
          <span
            data-testid="risk-profile-unacceptable"
            className={
              count > 0 ? 'font-medium text-destructive-foreground' : 'text-muted-foreground'
            }
          >
            {count}
          </span>
        );
      },
    }),
    helper.accessor('globalRiskLevel', {
      id: 'level',
      header: 'Nivel global',
      enableSorting: false,
      meta: { ...numeric, skeletonClassName: 'ml-auto w-10' },
      cell: ({ getValue }) => {
        const level = getValue();
        return (
          <span
            data-testid="risk-profile-level"
            className={cn(
              level === null
                ? 'text-muted-foreground'
                : isOverAcceptableLimit(level) && 'font-medium text-destructive-foreground'
            )}
          >
            {level === null ? '—' : formatGlobalLevel(level)}
          </span>
        );
      },
    }),
    helper.accessor('clientCount', {
      id: 'clientCount',
      header: 'Folosită la',
      sortDescFirst: true,
      meta: {
        headerClassName: 'pl-8',
        cellClassName: 'pl-8 tabular-nums',
        skeletonClassName: 'w-16',
      },
      cell: ({ getValue }) => (
        <span
          data-testid="risk-profile-clients"
          className={cn(getValue() === 0 && 'text-muted-foreground')}
        >
          {clientCountLabel(getValue())}
        </span>
      ),
    }),
    helper.accessor('updatedAt', {
      id: 'updatedAt',
      header: 'Modificat',
      sortDescFirst: true,
      meta: { cellClassName: 'text-muted-foreground tabular-nums', skeletonClassName: 'w-20' },
      cell: ({ getValue }) => formatRoDate(dateToIso(new Date(getValue()))),
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: { headerClassName: 'w-12', cellClassName: 'text-right', skeletonClassName: 'hidden' },
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="risk-profile-actions"
                aria-label={`Acțiuni pentru ${profile.name}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {profile.archivedAt ? (
                <DropdownMenuItem
                  data-testid="risk-profile-restore"
                  onSelect={() => onArchiveChange({ profile, action: 'restore' })}
                >
                  <ArchiveRestore aria-hidden="true" />
                  Reactivează…
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    data-testid="risk-profile-rename"
                    onSelect={() => onRename(profile)}
                  >
                    <Pencil aria-hidden="true" />
                    Redenumește…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid="risk-profile-archive"
                    variant="destructive"
                    onSelect={() => onArchiveChange({ profile, action: 'archive' })}
                  >
                    <Archive aria-hidden="true" />
                    Arhivează…
                  </DropdownMenuItem>
                </>
              )}
              {!profile.inUse && (
                <>
                  {profile.archivedAt && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    data-testid="risk-profile-remove"
                    variant="destructive"
                    onSelect={() => onRemove(profile)}
                  >
                    <Trash2 aria-hidden="true" />
                    Șterge…
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
