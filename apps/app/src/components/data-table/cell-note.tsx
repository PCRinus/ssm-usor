import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps } from 'react';

// A value is never muted, whatever it says: grey is only for the line under it and for an
// empty cell.
export function CellNote({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('mt-1.5 block text-xs font-normal text-muted-foreground', className)}
      {...props}
    />
  );
}

export function CellEmpty({ className, ...props }: Omit<ComponentProps<'span'>, 'children'>) {
  return (
    <span className={cn('text-muted-foreground', className)} {...props}>
      —
    </span>
  );
}
