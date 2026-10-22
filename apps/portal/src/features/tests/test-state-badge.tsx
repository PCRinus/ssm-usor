import { useLingui } from '@lingui/react/macro';
import type { TestState } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { cn } from '@ssm-usor/ui/lib/utils';

import { testStateMessages } from '@/lib/labels';

const stateClasses: Record<TestState, string> = {
  none: 'border-border bg-card text-muted-foreground',
  pending: 'border-warning-border bg-warning text-warning-foreground',
  passed: 'border-success-border bg-success text-success-foreground',
  annual_due: 'border-warning-border bg-warning text-warning-foreground',
};

export function TestStateBadge({ state, testId }: { state: TestState; testId?: string }) {
  const { i18n } = useLingui();
  return (
    <Badge
      variant="outline"
      className={cn('px-2.5 font-semibold', stateClasses[state])}
      data-testid={testId}
      data-state={state}
    >
      {i18n._(testStateMessages[state])}
    </Badge>
  );
}
