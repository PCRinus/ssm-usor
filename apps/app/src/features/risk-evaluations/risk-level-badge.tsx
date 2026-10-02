import { isUnacceptableRiskLevel } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';

export function RiskLevelBadge({ level, className }: { level: number; className?: string }) {
  const unacceptable = isUnacceptableRiskLevel(level);
  return (
    <Badge
      variant={unacceptable ? 'outline' : 'secondary'}
      data-testid="risk-level"
      data-unacceptable={unacceptable || undefined}
      title={unacceptable ? 'Nivel de risc inacceptabil' : 'Nivel de risc acceptabil'}
      className={cn(
        'tabular-nums',
        unacceptable && 'border-destructive-border bg-destructive-soft text-destructive-foreground',
        className
      )}
    >
      Nivel {level}
      {unacceptable && <span className="sr-only">, inacceptabil</span>}
    </Badge>
  );
}
