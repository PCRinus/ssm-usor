import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';

import { openedHere } from '@/app/opener';
import { CellEmpty, CellNote } from '@/components/data-table/cell-note';
import { formatRoDate } from '@/lib/dates';

import { meansLabel, needsExtinguisher, overdueLabel, type WorkplaceMeans } from './workplace-list';
import type { ListedWorkplace, Workplace } from './workplace-schema';

export const amber = 'font-medium text-warning-foreground';

export function MeansCell({
  clientId,
  workplace,
  means,
}: {
  clientId: string;
  workplace: ListedWorkplace;
  means: WorkplaceMeans | undefined;
}) {
  if (!means) return <CellEmpty />;
  const noExtinguisher = needsExtinguisher(workplace, means) && (
    <span data-testid="workplace-no-extinguisher" className={amber}>
      Niciun stingător
    </span>
  );
  if (means.count === 0) return noExtinguisher || <CellEmpty />;
  return (
    <>
      <Link
        to="/clienti/$clientId/mijloace-de-aparare"
        params={{ clientId }}
        state={openedHere}
        aria-label={`${meansLabel(means.count)} de apărare la ${workplace.name}`}
        data-testid="workplace-means"
        className="hover:underline"
      >
        {meansLabel(means.count)}
      </Link>
      {means.overdue > 0 ? (
        <CellNote
          data-testid="workplace-means-overdue"
          className="font-medium text-destructive-foreground"
        >
          {overdueLabel(means.overdue)}
        </CellNote>
      ) : noExtinguisher ? (
        <CellNote>{noExtinguisher}</CellNote>
      ) : (
        means.nextCheck && (
          <CellNote data-testid="workplace-means-next">
            verificare până la{' '}
            <span className="whitespace-nowrap tabular-nums">{formatRoDate(means.nextCheck)}</span>
          </CellNote>
        )
      )}
    </>
  );
}

export function WorkplaceMenu({
  workplace,
  onEdit,
  onArchive,
}: {
  workplace: Workplace;
  onEdit: (workplace: Workplace) => void;
  onArchive: (workplace: Workplace) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="-my-1"
          data-testid="workplace-actions"
          aria-label={`Acțiuni pentru ${workplace.name}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem data-testid="workplace-edit" onSelect={() => onEdit(workplace)}>
          Modifică
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="workplace-archive"
          variant="destructive"
          onSelect={() => onArchive(workplace)}
        >
          Arhivează
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
