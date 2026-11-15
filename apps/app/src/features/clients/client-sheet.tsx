import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps } from 'react';

// Joined to the folder tabs above it: the strip's line is its top edge. Cards and outline buttons
// inside it take the panel look from styles.css. On a phone it runs to the screen's edges, past
// the page's 20 px gutter.
export function ClientSheet({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="client-sheet"
      className={cn(
        'min-h-48 rounded-b-xl border border-t-0 bg-card p-(--sheet-pad) [--sheet-pad:--spacing(4)] sm:[--sheet-pad:--spacing(6)]',
        'max-sm:-mx-5 max-sm:rounded-none max-sm:border-x-0',
        className
      )}
      {...props}
    />
  );
}
