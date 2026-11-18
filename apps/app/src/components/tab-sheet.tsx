import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps } from 'react';

import { phoneBleed, sheetPadding } from './page-spacing';

// The folder strip's line is the sheet's top edge, so it draws none of its own; forced colours
// drop that line, which is a shadow.
export function TabSheet({
  flush = false,
  className,
  ...props
}: ComponentProps<'div'> & { flush?: boolean }) {
  return (
    <div
      data-slot="tab-sheet"
      data-flush={flush || undefined}
      className={cn(
        'min-h-48 rounded-b-xl border border-t-0 bg-card forced-colors:border-t',
        phoneBleed,
        'max-sm:rounded-none max-sm:border-x-0',
        flush ? 'overflow-clip' : sheetPadding,
        className
      )}
      {...props}
    />
  );
}
