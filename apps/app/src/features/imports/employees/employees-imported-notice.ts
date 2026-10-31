import { roCount } from '@/features/employees/employee-format';

import { photosLabel } from '../import-format';
import { joinNames } from './review-format';

export { joinNames };

// In memory, for the client's Angajați tab until it is hidden or the page reloads: the
// employees are saved either way, and their pages say where they came from.
export type EmployeesImported = {
  created: number;
  photos: number;
  trainingsHeld: number;
  completed: string[];
  leavers: string[];
  noCommute: string[];
  noContact: number;
};

const notices = new Map<string, EmployeesImported>();

export function leaveEmployeesImported(clientId: string, notice: EmployeesImported) {
  notices.set(clientId, notice);
}

export const readEmployeesImported = (clientId: string) => notices.get(clientId) ?? null;

export function forgetEmployeesImported(clientId: string) {
  notices.delete(clientId);
}

export function importedSentence(notice: EmployeesImported) {
  const parts = [
    `Azi, din ${photosLabel(notice.photos)}, cu ${roCount(notice.trainingsHeld, 'instruire ținută', 'instruiri ținute')}.`,
  ];
  const completed =
    notice.completed.length === 1
      ? `${notice.completed[0]} a fost completat`
      : notice.completed.length > 1
        ? `${joinNames(notice.completed)} au fost completați`
        : null;
  const leavers =
    notice.leavers.length === 1
      ? `${notice.leavers[0]} e la Foști angajați`
      : notice.leavers.length > 1
        ? `${joinNames(notice.leavers)} sunt la Foști angajați`
        : null;
  if (completed && leavers) parts.push(`${completed}, iar ${leavers}.`);
  else if (completed ?? leavers) parts.push(`${completed ?? leavers}.`);
  parts.push('Fișele pe hârtie rămân originalul, la client.');
  return parts.join(' ');
}
