import type { ImportStatus } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';

import { statusLabels } from './format';

export function StatusBadge({
  status,
  rowDeleted = false,
}: {
  status: ImportStatus | null;
  rowDeleted?: boolean;
}) {
  if (rowDeleted || !status) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Row deleted
      </Badge>
    );
  }
  const variant =
    status === 'failed' ? 'destructive' : status === 'confirmed' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{statusLabels[status]}</Badge>;
}
