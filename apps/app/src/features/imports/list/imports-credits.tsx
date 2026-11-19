import { countNoun, formatCount } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';

import type { CreditsBalance } from '../import-credits';

function period(balance: CreditsBalance) {
  if (balance.trial) return 'în perioada de probă';
  const { giftLeft, extraLeft } = balance.usage;
  return giftLeft > 0 || extraLeft > 0 ? null : 'luna aceasta';
}

function creditsLeftValue(balance: CreditsBalance) {
  const { usage } = balance;
  const included = formatCount(usage.included ?? 0);
  if (balance.trial)
    return `${formatCount(balance.available)} din ${included} în perioada de probă`;
  const month = `${formatCount(usage.left ?? 0)} din ${included} luna aceasta`;
  return usage.giftLeft > 0 ? `${month} și ${formatCount(usage.giftLeft)} de bun venit` : month;
}

export function CreditsLeftLine({ balance }: { balance: CreditsBalance }) {
  return (
    <p data-testid="imports-credits" className="text-sm text-muted-foreground tabular-nums">
      Credite AI rămase <span className="ml-0.5 text-foreground">{creditsLeftValue(balance)}</span>
    </p>
  );
}

export function CreditsAvailable({
  balance,
  lead,
  className,
}: {
  balance: CreditsBalance;
  lead: 'remain' | 'have';
  className?: string;
}) {
  const count = balance.available;
  const verb = lead === 'have' ? 'Ai' : count === 1 ? 'Îți mai rămâne' : 'Îți mai rămân';
  const when = period(balance);
  return (
    <p data-testid="imports-credits-available" className={cn('tabular-nums', className)}>
      {verb} <b className="font-semibold text-foreground">{formatCount(count)}</b>{' '}
      {countNoun(count, 'credit AI', 'credite AI')}
      {when ? ` ${when}` : ''}
      {lead === 'have' ? '.' : ''}
    </p>
  );
}
