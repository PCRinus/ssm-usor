import { cn } from '@ssm-usor/ui/lib/utils';

import { formatGlobalLevel } from '@/features/risk-evaluations/risk-evaluation-schema';

export function GlobalLevel({ level, className }: { level: number; className?: string }) {
  return (
    <span data-testid="risk-profile-level" className={cn('tabular-nums', className)}>
      Nivel global {formatGlobalLevel(level)}
    </span>
  );
}
