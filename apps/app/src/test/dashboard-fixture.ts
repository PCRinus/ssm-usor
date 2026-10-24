import type { DashboardSummary } from '@ssm-usor/contracts';

const employeesAtMonthEnds = [
  ['2025-11', 23],
  ['2025-12', 23],
  ['2026-01', 64],
  ['2026-02', 87],
  ['2026-03', 105],
  ['2026-04', 147],
  ['2026-05', 147],
  ['2026-06', 233],
  ['2026-07', 268],
  ['2026-08', 290],
  ['2026-09', 371],
  ['2026-10', 412],
] as const;

export const busySummary: DashboardSummary = {
  todo: {
    mySignatures: 9,
    draftsToIssue: 6,
    clientsMissingData: 3,
    documentsBehind: 11,
    employeeSignatures: { pending: 27, oldestIssuedAt: '2026-10-12T07:30:00.000Z' },
    testsPending: 19,
  },
  trainings: {
    ssm: { overdue: 22, due: 41, untrained: 31, current: 318, total: 412 },
    psi: { overdue: 29, due: 36, untrained: 46, current: 301, total: 412 },
  },
  nextDue: { on: '2026-11-02', employees: 4 },
  portfolio: {
    activeClients: 18,
    employees: 412,
    employeesAtMonthEnds: employeesAtMonthEnds.map(([month, employees]) => ({ month, employees })),
  },
  contracts: { receivedToConfirm: 2, endingWithin60Days: 2 },
};

export const quietSummary: DashboardSummary = {
  ...busySummary,
  todo: {
    mySignatures: 0,
    draftsToIssue: 0,
    clientsMissingData: 0,
    documentsBehind: 0,
    employeeSignatures: { pending: 0, oldestIssuedAt: null },
    testsPending: 0,
  },
  trainings: {
    ssm: { overdue: 0, due: 4, untrained: 0, current: 408, total: 412 },
    psi: { overdue: 0, due: 7, untrained: 0, current: 405, total: 412 },
  },
  contracts: { receivedToConfirm: 0, endingWithin60Days: 0 },
};
