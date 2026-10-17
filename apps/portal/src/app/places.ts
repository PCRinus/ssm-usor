import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import {
  CircleUserRound,
  GraduationCap,
  House,
  IdCard,
  type LucideIcon,
  UsersRound,
} from 'lucide-react';

import {
  isAdministrator,
  type Participation,
} from '@/features/participation/participation-context';

export type Place = {
  to: '/' | '/instruiri' | '/datele-mele' | '/contul-meu' | '/angajati';
  testId: string;
  label: MessageDescriptor;
  icon: LucideIcon;
  // The header's account menu holds it from 640 px; the bar shows it on a phone.
  inAccountMenu?: true;
};

const home: Place = { to: '/', testId: 'home', label: msg`Acasă`, icon: House };
const trainings: Place = {
  to: '/instruiri',
  testId: 'instruiri',
  label: msg`Instruiri`,
  icon: GraduationCap,
};
const myData: Place = {
  to: '/datele-mele',
  testId: 'datele-mele',
  label: msg`Datele mele`,
  icon: IdCard,
};
const account: Place = {
  to: '/contul-meu',
  testId: 'contul-meu',
  label: msg`Contul meu`,
  icon: CircleUserRound,
  inAccountMenu: true,
};
const employees: Place = {
  to: '/angajati',
  testId: 'angajati',
  label: msg`Angajați`,
  icon: UsersRound,
};

// At most four (ADR 022): an administrator who is also an employee reaches their own data from
// Acasă instead of the bar.
export function placesOf(participation: Participation): Place[] {
  if (!isAdministrator(participation)) return [home, trainings, myData, account];
  if (participation.employeeId === null) return [home, employees, account];
  return [home, employees, trainings, account];
}
