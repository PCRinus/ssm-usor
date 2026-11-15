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

// "La zi" as the filter reads it, passed in both domains. Only the annual test names its domain
// unasked, as it is a fire-safety test alone.
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
  const states = trainingDomains.map((domain) => tests[domain].state);
  const state = pressing.find((each) => states.includes(each));
  if (state) {
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
  if (states.every((each) => each === 'passed')) {
    return (
      <span className="text-muted-foreground" data-testid="test-status" data-state="passed">
        La zi
      </span>
    );
  }
  const untested = trainingDomains.filter((domain) => tests[domain].state === 'none');
  if (states.includes('passed') && untested.length > 0) {
    return (
      <span className="text-muted-foreground" data-testid="test-status" data-state="none">
        {`${untested.map((domain) => trainingDomainLabels[domain]).join(', ')}: ${testStateLabels.none.toLowerCase()}`}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground" data-testid="test-status">
      —
    </span>
  );
}
