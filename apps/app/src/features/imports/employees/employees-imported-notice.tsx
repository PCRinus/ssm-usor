import { Masked } from '@/components/replay';
import { roCount } from '@/features/employees/employee-format';

import { photosLabel } from '../import-format';
import { joinNames } from './review-format';

export { joinNames };

// In memory, for the first visit to the client's Lucrători tab after the confirm: the import
// keeps no record of who it created and who it completed, so a later visit shows only its date
// and who is left to invite.
export type EmployeesImported = {
  importId: string;
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

const hiddenKey = (importId: string) => `ssm-usor:employees-imported-hidden:${importId}`;

// Storage throws in some private windows; the card then comes back on the next visit.
export function wasHiddenHere(importId: string) {
  try {
    return localStorage.getItem(hiddenKey(importId)) !== null;
  } catch {
    return false;
  }
}

export function hideHere(importId: string) {
  try {
    localStorage.setItem(hiddenKey(importId), new Date().toISOString());
  } catch {
    return;
  }
}

export function importedSentence(notice: EmployeesImported) {
  const completed =
    notice.completed.length === 1 ? (
      <>
        <Masked>{notice.completed[0]}</Masked> a fost completat
      </>
    ) : notice.completed.length > 1 ? (
      <>
        <Masked>{joinNames(notice.completed)}</Masked> au fost completați
      </>
    ) : null;
  const leavers =
    notice.leavers.length === 1 ? (
      <>
        <Masked>{notice.leavers[0]}</Masked> e la Foști lucrători
      </>
    ) : notice.leavers.length > 1 ? (
      <>
        <Masked>{joinNames(notice.leavers)}</Masked> sunt la Foști lucrători
      </>
    ) : null;
  return (
    <>
      {`Azi, din ${photosLabel(notice.photos)}, cu ${roCount(notice.trainingsHeld, 'instruire ținută', 'instruiri ținute')}.`}
      {completed && leavers ? (
        <>
          {' '}
          {completed}, iar {leavers}.
        </>
      ) : (
        (completed ?? leavers) && <> {completed ?? leavers}.</>
      )}{' '}
      Fișele pe hârtie rămân originalul, la client.
    </>
  );
}
