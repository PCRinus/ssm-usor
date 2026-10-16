import { Flame, HardHat, IdCard } from 'lucide-react';

export const employeeSections = [
  { to: '/clients/$clientId/employees/$employeeId', label: 'Date', icon: IdCard, exact: true },
  {
    to: '/clients/$clientId/employees/$employeeId/training/ssm',
    label: 'Instruire SSM',
    icon: HardHat,
    exact: false,
  },
  {
    to: '/clients/$clientId/employees/$employeeId/training/psi',
    label: 'Instruire PSI',
    icon: Flame,
    exact: false,
  },
] as const;
