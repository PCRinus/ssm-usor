import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { ChevronRight, MoreHorizontal } from 'lucide-react';

import { openedHere } from '@/app/opener';
import { CellBadge } from '@/components/data-table/cell-badge';

import { DecisionBadge } from './decision-badge';
import { employeeCountLabel, type JobPosition } from './job-position-schema';
import { type PositionSection, positionSections } from './position-sections';

export function WorkersCell({
  clientId,
  position,
  readOnly,
}: {
  clientId: string;
  position: JobPosition;
  readOnly: boolean;
}) {
  if (position.employeeCount === 0) {
    return <span data-testid="job-position-employees">{employeeCountLabel(0)}</span>;
  }
  // The workers list refuses its training filters for an archived client.
  const toTrain = readOnly ? 0 : position.employeesToTrainCount;
  return (
    <>
      <Link
        to="/clienti/$clientId/angajati"
        params={{ clientId }}
        search={{ jobPosition: [position.id] }}
        state={openedHere}
        aria-label={`${employeeCountLabel(position.employeeCount)} pe postul ${position.name}`}
        data-testid="job-position-employees"
        className="tabular-nums hover:underline"
      >
        {employeeCountLabel(position.employeeCount)}
      </Link>
      {toTrain > 0 && (
        <CellBadge asChild tone="destructive" note className="tabular-nums">
          <Link
            to="/clienti/$clientId/angajati"
            params={{ clientId }}
            search={{ jobPosition: [position.id], attention: ['toTrain'] }}
            state={openedHere}
            aria-label={`${toTrain} de instruit pe postul ${position.name}`}
            data-testid="job-position-to-train"
          >
            {toTrain} de instruit
          </Link>
        </CellBadge>
      )}
    </>
  );
}

export function StateLink({
  clientId,
  position,
  section,
  decision,
  readOnly,
  label,
  testId,
}: {
  clientId: string;
  position: JobPosition;
  section: PositionSection;
  decision: boolean | null;
  readOnly: boolean;
  label: string;
  testId: string;
}) {
  return (
    <DecisionBadge asChild decision={decision} readOnly={readOnly}>
      <Link
        to="/clienti/$clientId/posturi/$jobPositionId"
        state={openedHere}
        params={{ clientId, jobPositionId: position.id }}
        hash={section}
        data-testid={testId}
      >
        {label}
        <ChevronRight aria-hidden="true" />
      </Link>
    </DecisionBadge>
  );
}

export function PositionMenu({
  clientId,
  position,
  readOnly,
  onEdit,
  onRemove,
}: {
  clientId: string;
  position: JobPosition;
  readOnly: boolean;
  onEdit: (position: JobPosition) => void;
  onRemove: (position: JobPosition) => void;
}) {
  const params = { clientId, jobPositionId: position.id };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="job-position-actions"
          aria-label={`Acțiuni pentru ${position.name}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild data-testid="job-position-menu-equipment">
          <Link
            to="/clienti/$clientId/posturi/$jobPositionId"
            state={openedHere}
            params={params}
            hash={positionSections.equipment}
          >
            Echipament de protecție
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild data-testid="job-position-menu-instructions">
          <Link
            to="/clienti/$clientId/posturi/$jobPositionId"
            state={openedHere}
            params={params}
            hash={positionSections.instructions}
          >
            Instrucțiuni SSM
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild data-testid="job-position-menu-fire-instructions">
          <Link
            to="/clienti/$clientId/posturi/$jobPositionId"
            state={openedHere}
            params={params}
            hash={positionSections.fireInstructions}
          >
            Instrucțiuni SU
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild data-testid="job-position-menu-risk">
          <Link
            to="/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare"
            state={openedHere}
            params={params}
          >
            Fișa de evaluare a riscurilor
          </Link>
        </DropdownMenuItem>
        {!readOnly && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="job-position-edit" onSelect={() => onEdit(position)}>
              Modifică
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="job-position-remove"
              variant="destructive"
              onSelect={() => onRemove(position)}
            >
              Șterge
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
