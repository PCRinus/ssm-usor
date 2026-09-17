import type { EmployeeStatus } from '@ssm-usor/contracts';

export const employeeStatusLabels: Record<EmployeeStatus, string> = {
  active: 'Angajați actuali',
  terminated: 'Foști angajați',
};

const dateFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

// Formats an ISO calendar date (YYYY-MM-DD) for display, for example "1 mar. 2020".
export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}
