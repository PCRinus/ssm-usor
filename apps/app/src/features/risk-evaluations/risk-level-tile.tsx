import { isUnacceptableRiskLevel } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';

const tints: Record<number, string> = {
  4: 'bg-destructive-soft text-destructive-foreground',
  5: 'bg-destructive-mid text-destructive-foreground',
  6: 'bg-destructive-mid text-destructive-foreground',
  7: 'bg-destructive text-white',
};

export function RiskLevelTile({ level, className }: { level: number; className?: string }) {
  const unacceptable = isUnacceptableRiskLevel(level);
  return (
    <span
      data-testid="risk-level"
      data-unacceptable={unacceptable || undefined}
      title={unacceptable ? 'Nivel de risc inacceptabil' : 'Nivel de risc acceptabil'}
      className={cn(
        'inline-grid size-9 shrink-0 place-items-center rounded-[9px] text-base font-medium tabular-nums',
        tints[level] ?? 'bg-muted text-foreground',
        className
      )}
    >
      <span className="sr-only">Nivel </span>
      {level}
      {unacceptable && <span className="sr-only">, inacceptabil</span>}
    </span>
  );
}
