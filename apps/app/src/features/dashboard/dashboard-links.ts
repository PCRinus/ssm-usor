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
  testsPending: () => linkOptions({ to: '/angajati', search: { test: ['pending' as const] } }),
  trainingState: (trainingState: TrainingStateFilter, domain: TrainingDomain) =>
    linkOptions({
      to: '/angajati',
      search: domain === 'ssm' ? { ssmTraining: [trainingState] } : { suTraining: [trainingState] },
    }),
  documentsBehind: (suOnly: boolean) =>
    linkOptions({ to: suOnly ? '/legislatie/documente-su' : '/legislatie/documente-ssm' }),
};

export type DashboardTarget = ReturnType<(typeof dashboardLinks)[keyof typeof dashboardLinks]>;
