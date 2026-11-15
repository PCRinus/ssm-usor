import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps } from 'react';

const tones = {
  warning:
    'border-warning-border bg-warning text-warning-foreground [a&]:hover:bg-warning/70 [a&]:hover:text-warning-foreground',
  // The variant's own ring is the badge's red, which a focused red badge would hide.
  destructive: 'focus-visible:ring-ring/50 dark:focus-visible:ring-ring/50',
};

// In a list cell only a badge carries colour: amber for something to do, red for something
// wrong. `note` puts it on the line under a value, as tall as a CellNote so the row keeps
// its height.
export function CellBadge({
  tone,
  note = false,
  className,
  ...props
}: Omit<ComponentProps<typeof Badge>, 'variant'> & {
  tone: keyof typeof tones;
  note?: boolean;
}) {
  return (
    <Badge
      variant={tone === 'destructive' ? 'destructive' : 'outline'}
      className={cn(tones[tone], note && 'mt-1 flex py-0 leading-4', className)}
      {...props}
    />
  );
}
