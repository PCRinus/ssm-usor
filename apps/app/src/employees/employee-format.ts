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

// Today's calendar date in the browser's time zone, as YYYY-MM-DD for date inputs.
export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

// Formats an ISO calendar date (YYYY-MM-DD) for display, for example "1 mar. 2020".
export function formatDate(isoDate: string) {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

// Romanian counted nouns: "1 an", "2 ani", "20 de ani" (from 20 up, except 101–119 style
// endings, the noun takes "de").
function roCount(value: number, one: string, many: string) {
  if (value === 1) return `1 ${one}`;
  const tail = value % 100;
  return tail === 0 || tail >= 20 ? `${value} de ${many}` : `${value} ${many}`;
}

// Whole years and months between two ISO dates, for example "3 ani și 2 luni".
export function formatTenure(fromIso: string, toIso: string) {
  const [fromYear = 0, fromMonth = 0, fromDay = 0] = fromIso.split('-').map(Number);
  const [toYear = 0, toMonth = 0, toDay = 0] = toIso.split('-').map(Number);
  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth) - (toDay < fromDay ? 1 : 0);
  if (months < 1) return 'sub o lună';
  const years = Math.floor(months / 12);
  months %= 12;
  const parts = [
    ...(years ? [roCount(years, 'an', 'ani')] : []),
    ...(months ? [roCount(months, 'lună', 'luni')] : []),
  ];
  return parts.join(' și ');
}
