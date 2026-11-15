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

// Only what asks for action: of both domains, the most pressing test; with none, "La zi" once a
// test passed. Only the annual test names its domain, as it is a fire-safety test alone.
const pressing = ['annual_due', 'pending', 'unverified'] as const satisfies readonly TestState[];

const lineTones: Record<(typeof pressing)[number], string> = {
  annual_due: 'font-medium text-destructive-foreground',
  pending: 'font-medium text-warning-foreground',
  unverified: 'text-foreground',
};

export function TestStatesLine({
  tests,
}: {
  tests: Record<TrainingDomain, { state: TestState | null }>;
}) {
  const state = pressing.find((each) =>
    trainingDomains.some((domain) => tests[domain].state === each)
  );
  if (!state) {
    const passed = trainingDomains.some((domain) => tests[domain].state === 'passed');
    return (
      <span
        className="text-muted-foreground"
        data-testid="test-status"
        data-state={passed ? 'passed' : undefined}
      >
        {passed ? 'La zi' : '—'}
      </span>
    );
  }
  const label = testStateLabels[state];
  const domains = trainingDomains.filter((domain) => tests[domain].state === state);
  return (
    <span className={lineTones[state]} data-testid="test-status" data-state={state}>
      {state === 'annual_due'
        ? `${domains.map((domain) => trainingDomainLabels[domain]).join(', ')}: ${label.toLowerCase()}`
        : label}
    </span>
  );
}
