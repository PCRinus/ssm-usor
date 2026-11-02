import type { TrainingDomain, TrainingStateFilter } from '@ssm-usor/contracts';
import { linkOptions } from '@tanstack/react-router';

export const dashboardLinks = {
  signatures: () => linkOptions({ to: '/semnaturi' }),
  draftsToIssue: () =>
    linkOptions({
      to: '/clienti',
      search: { sort: 'documentation' as const, order: 'asc' as const },
    }),
  clients: () => linkOptions({ to: '/clienti' }),
  employees: () => linkOptions({ to: '/angajati' }),
  testsPending: () => linkOptions({ to: '/angajati', search: { testState: 'pending' as const } }),
  trainingState: (trainingState: TrainingStateFilter, domain: TrainingDomain) =>
    linkOptions({ to: '/angajati', search: { trainingState, domain } }),
  documentsBehind: () => linkOptions({ to: '/legislatie/documente' }),
};

export type DashboardTarget = ReturnType<(typeof dashboardLinks)[keyof typeof dashboardLinks]>;
