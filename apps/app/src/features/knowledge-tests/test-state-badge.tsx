import {
  type TestState,
  testStateLabels,
  type TrainingDomain,
  trainingDomainLabels,
  trainingDomains,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';

const stateBadges: Record<TestState, { variant: 'outline' | 'destructive'; className?: string }> = {
  none: { variant: 'outline', className: 'text-muted-foreground' },
  unverified: { variant: 'outline', className: 'text-muted-foreground' },
  pending: {
    variant: 'outline',
    className: 'border-warning-border bg-warning text-warning-foreground',
  },
  passed: {
    variant: 'outline',
    className: 'border-success-border bg-success text-success-foreground',
  },
  annual_due: { variant: 'destructive' },
};

export function TestStateBadge({ state, testId }: { state: TestState; testId?: string }) {
  const badge = stateBadges[state];
  return (
    <Badge
      variant={badge.variant}
      className={badge.className}
      data-testid={testId}
      data-state={state}
    >
      {testStateLabels[state]}
    </Badge>
  );
}

export function TestStatesCell({
  tests,
}: {
  tests: Record<TrainingDomain, { state: TestState | null }>;
}) {
  if (trainingDomains.every((domain) => tests[domain].state === null)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="grid justify-items-start gap-1">
      {trainingDomains.map((domain) => {
        const { state } = tests[domain];
        return (
          <span key={domain} className="flex items-center gap-1.5">
            <span className="w-6 text-xs text-muted-foreground">
              {trainingDomainLabels[domain]}
            </span>
            {state ? (
              <TestStateBadge state={state} testId={`test-status-${domain}`} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        );
      })}
    </span>
  );
}
