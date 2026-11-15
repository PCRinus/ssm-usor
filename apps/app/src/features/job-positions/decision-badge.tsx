import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps } from 'react';

const undecided =
  'border-warning-border bg-warning text-warning-foreground [a&]:hover:bg-warning/70 [a&]:hover:text-warning-foreground';

// A position's state about equipment or instructions: null is undecided, false needs none.
// An archived client's records are only read, so nothing on them is left to decide or amber.
export function DecisionBadge({
  decision,
  readOnly = false,
  className,
  ...props
}: Omit<ComponentProps<typeof Badge>, 'variant'> & {
  decision: boolean | null;
  readOnly?: boolean;
}) {
  return (
    <Badge
      variant={decision ? 'secondary' : 'outline'}
      className={cn(decision === null && !readOnly && undecided, className)}
      {...props}
    />
  );
}
