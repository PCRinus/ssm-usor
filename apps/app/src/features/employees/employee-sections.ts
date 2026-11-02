import { Flame, HardHat, IdCard } from 'lucide-react';

export const employeeSections = [
  { to: '/clienti/$clientId/angajati/$employeeId', label: 'Date', icon: IdCard, exact: true },
  {
    to: '/clienti/$clientId/angajati/$employeeId/instruire/ssm',
    label: 'Instruire SSM',
    icon: HardHat,
    exact: false,
  },
  {
    to: '/clienti/$clientId/angajati/$employeeId/instruire/su',
    label: 'Instruire SU',
    icon: Flame,
    exact: false,
  },
] as const;
