import type { DocumentationState } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';

const warning = 'border-warning-border bg-warning text-warning-foreground';

// Three states rather than a check mark, by the owner's choice; this is the one place to
// change that.
const documentationStateBadges: Record<
  DocumentationState,
  { label: string; variant: 'outline' | 'secondary'; className?: string }
> = {
  none: { label: 'Negenerată', variant: 'outline', className: warning },
  in_progress: { label: 'În lucru', variant: 'outline', className: warning },
  issued: { label: 'Emisă', variant: 'secondary' },
};

export function DocumentationBadge({ state }: { state: DocumentationState }) {
  const badge = documentationStateBadges[state];
  return (
    <Badge
      variant={badge.variant}
      className={badge.className}
      data-testid="clients-documentation"
      data-state={state}
    >
      {badge.label}
    </Badge>
  );
}
