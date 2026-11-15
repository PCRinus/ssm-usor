import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps } from 'react';

export function CellNote({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('mt-1.5 block text-xs font-normal text-muted-foreground', className)}
      {...props}
    />
  );
}
