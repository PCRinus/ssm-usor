import { countNoun, formatCount } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';

import type { CreditsBalance } from '../import-credits';

const availableOf = (balance: CreditsBalance) => Math.max(balance.available, 0);

// The month's credits alone have an allowance to count against; with the welcome gift or extras
// on top, the number is said with what it includes.
function period(balance: CreditsBalance) {
  if (balance.trial) return ' în perioada de probă';
  const { giftLeft, extraLeft } = balance.usage;
  const besides = [
    ...(giftLeft > 0 ? ['cele de bun venit'] : []),
    ...(extraLeft > 0 ? ['cele extra'] : []),
  ];
  return besides.length > 0 ? `, cu ${besides.join(' și ')}` : ' luna aceasta';
}

function creditsLeftValue(balance: CreditsBalance) {
  const count = formatCount(availableOf(balance));
  const { giftLeft, extraLeft, included } = balance.usage;
  const counted = balance.trial || (giftLeft === 0 && extraLeft === 0);
  return counted
    ? `${count} din ${formatCount(included ?? 0)}${period(balance)}`
    : `${count}${period(balance)}`;
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
  id,
  className,
}: {
  balance: CreditsBalance;
  lead: 'remain' | 'have';
  id?: string;
  className?: string;
}) {
  const count = availableOf(balance);
  const verb = lead === 'have' ? 'Ai' : count === 1 ? 'Îți mai rămâne' : 'Îți mai rămân';
  return (
    <p id={id} data-testid="imports-credits-available" className={cn('tabular-nums', className)}>
      {verb} <b className="font-semibold text-foreground">{formatCount(count)}</b>{' '}
      {countNoun(count, 'credit AI', 'credite AI')}
      {period(balance)}
      {lead === 'have' ? '.' : ''}
    </p>
  );
}
