import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

export function RowActionsMenu({
  name,
  testId,
  deleteTestId = `${testId}-delete`,
  className,
  onEdit,
  onDelete,
}: {
  name: string;
  testId: string;
  deleteTestId?: string;
  className?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          data-testid={`${testId}-actions`}
          aria-label={`Acțiuni pentru ${name}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem data-testid={`${testId}-edit`} onSelect={onEdit}>
          Modifică
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid={deleteTestId} variant="destructive" onSelect={onDelete}>
          Șterge
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
