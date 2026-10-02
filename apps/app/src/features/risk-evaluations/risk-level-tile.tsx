import { isUnacceptableRiskLevel } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';

import { riskLevelTint } from './risk-level-tint';

export function RiskLevelTile({ level, className }: { level: number; className?: string }) {
  const unacceptable = isUnacceptableRiskLevel(level);
  return (
    <span
      data-testid="risk-level"
      data-unacceptable={unacceptable || undefined}
      title={unacceptable ? 'Nivel de risc inacceptabil' : 'Nivel de risc acceptabil'}
      className={cn(
        'inline-grid size-9 shrink-0 place-items-center rounded-[9px] text-base font-medium tabular-nums',
        riskLevelTint(level),
        className
      )}
    >
      <span className="sr-only">Nivel </span>
      {level}
      {unacceptable && <span className="sr-only">, inacceptabil</span>}
    </span>
  );
}
