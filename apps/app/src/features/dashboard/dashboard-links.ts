import type { TrainingDomain, TrainingStateFilter } from '@ssm-usor/contracts';
import { linkOptions } from '@tanstack/react-router';

export const dashboardLinks = {
  signatures: () => linkOptions({ to: '/signatures' }),
  draftsToIssue: () =>
    linkOptions({
      to: '/clients',
      search: { sort: 'documentation' as const, order: 'asc' as const },
    }),
  clients: () => linkOptions({ to: '/clients' }),
  employees: () => linkOptions({ to: '/employees' }),
  testsPending: () => linkOptions({ to: '/employees', search: { testState: 'pending' as const } }),
  trainingState: (trainingState: TrainingStateFilter, domain: TrainingDomain) =>
    linkOptions({ to: '/employees', search: { trainingState, domain } }),
  documentsBehind: () => linkOptions({ to: '/legislatie/documente' }),
};

export type DashboardTarget = ReturnType<(typeof dashboardLinks)[keyof typeof dashboardLinks]>;
