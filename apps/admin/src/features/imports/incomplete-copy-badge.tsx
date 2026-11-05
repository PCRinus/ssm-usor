import { Badge } from '@ssm-usor/ui/components/badge';

export function IncompleteCopyBadge({ title }: { title?: string }) {
  return (
    <Badge
      variant="outline"
      data-testid="copy-incomplete"
      title={title}
      className="border-warning-border bg-warning text-warning-foreground"
    >
      Incomplete
    </Badge>
  );
}
