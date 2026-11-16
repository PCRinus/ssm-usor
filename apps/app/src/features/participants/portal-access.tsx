import type { PortalAccessState } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check } from 'lucide-react';

import { portalAccessLabels } from './portal-access-format';

const success = 'border-success-border bg-success text-success-foreground';
const warning = 'border-warning-border bg-warning text-warning-foreground';
const quiet = 'border-transparent bg-secondary text-secondary-foreground';

// On an archived client nothing waits for an action, so an expired invitation is no warning.
export function PortalAccessBadge({
  state,
  archived = false,
  className,
}: {
  state: PortalAccessState;
  archived?: boolean;
  className?: string;
}) {
  if (state === 'none') {
    return (
      <span data-testid="portal-access-state" data-state={state} className={className}>
        {portalAccessLabels.none}
      </span>
    );
  }
  return (
    <Badge
      variant="outline"
      data-testid="portal-access-state"
      data-state={state}
      className={cn(
        state === 'active' && success,
        state === 'expired' && (archived ? quiet : warning),
        state === 'revoked' && quiet,
        className
      )}
    >
      {state === 'active' && <Check aria-hidden="true" />}
      {portalAccessLabels[state]}
    </Badge>
  );
}
