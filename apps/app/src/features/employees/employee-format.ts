import { countOf, type EmployeeStatus } from '@ssm-usor/contracts';

export const employeeStatusLabels: Record<EmployeeStatus, string> = {
  active: 'Actuali',
  terminated: 'Foști',
};

export const workerNoun = (count: number) => countOf(count, 'lucrător', 'lucrători');

export function formatTenure(fromIso: string, toIso: string) {
  const [fromYear = 0, fromMonth = 0, fromDay = 0] = fromIso.split('-').map(Number);
  const [toYear = 0, toMonth = 0, toDay = 0] = toIso.split('-').map(Number);
  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth) - (toDay < fromDay ? 1 : 0);
  if (months < 1) return 'sub o lună';
  const years = Math.floor(months / 12);
  months %= 12;
  const parts = [
    ...(years ? [countOf(years, 'an', 'ani')] : []),
    ...(months ? [countOf(months, 'lună', 'luni')] : []),
  ];
  return parts.join(' și ');
}
