import {
  CircleUserRound,
  GraduationCap,
  House,
  IdCard,
  type LucideIcon,
  UsersRound,
} from 'lucide-react';

import { isAdministrator, type Participation } from './participation-context';

type Place = {
  to: '/' | '/instruiri' | '/datele-mele' | '/contul-meu' | '/angajati';
  label: string;
  icon: LucideIcon;
};

const home: Place = { to: '/', label: 'Acasă', icon: House };
const trainings: Place = { to: '/instruiri', label: 'Instruiri', icon: GraduationCap };
const myData: Place = { to: '/datele-mele', label: 'Datele mele', icon: IdCard };
const account: Place = { to: '/contul-meu', label: 'Contul meu', icon: CircleUserRound };
const employees: Place = { to: '/angajati', label: 'Angajați', icon: UsersRound };

// At most four (ADR 022): an administrator who is also an employee reaches their own data from
// Acasă instead of the bar.
export function placesOf(participation: Participation): Place[] {
  if (!isAdministrator(participation)) return [home, trainings, myData, account];
  if (participation.employeeId === null) return [home, employees, account];
  return [home, employees, trainings, account];
}
