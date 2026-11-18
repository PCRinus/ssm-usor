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

import type { ResponsiblePerson } from './responsible-person-schema';

export function ResponsiblePersonMenu({
  clientId,
  person,
  onEdit,
  onArchive,
}: {
  clientId: string;
  person: ResponsiblePerson;
  onEdit: (person: ResponsiblePerson) => void;
  onArchive: (person: ResponsiblePerson) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="-my-1"
          data-testid="responsible-actions"
          aria-label={`Acțiuni pentru ${person.fullName}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem data-testid="responsible-edit" onSelect={() => onEdit(person)}>
          Modifică
        </DropdownMenuItem>
        {person.employeeId && (
          <DropdownMenuItem asChild data-testid="responsible-employee-open">
            <Link
              to="/clienti/$clientId/angajati/$employeeId"
              params={{ clientId, employeeId: person.employeeId }}
              state={openedHere}
            >
              Vezi lucrătorul
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="responsible-archive"
          variant="destructive"
          onSelect={() => onArchive(person)}
        >
          Scoate din listă
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
