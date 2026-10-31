import {
  bulkInvitationFailureReasons,
  bulkInvitationSkipReasons,
  type ImportInvitee,
  participantErrorReasons,
} from '@ssm-usor/contracts';

import { participantReasonMessage } from './participant-errors';

/** "o invitație", "3 invitații", "20 de invitații". */
export function invitationCount(count: number) {
  if (count === 1) return 'o invitație';
  return `${count}${tensOf(count) ? ' de' : ''} invitații`;
}

export function sendLabel(count: number) {
  return count === 1 ? 'Trimite invitația' : `Trimite ${invitationCount(count)}`;
}

/** "1 rămâne neinvitat", "35 rămân neinvitați". */
export function uninvitedCount(count: number) {
  return count === 1 ? '1 rămâne neinvitat' : `${count} rămân neinvitați`;
}

const tensOf = (count: number) => count % 100 === 0 || count % 100 >= 20;

export const nameOf = (invitee: Pick<ImportInvitee, 'lastName' | 'firstName'>) =>
  `${invitee.lastName} ${invitee.firstName}`;

export function formerEmployeesSentence(formers: ImportInvitee[]) {
  if (formers.length === 0) return null;
  if (formers.length === 1) return `${nameOf(formers[0]!)} nu apare: e fost angajat.`;
  if (formers.length <= 3) {
    const names = formers.map(nameOf);
    return `${names.slice(0, -1).join(', ')} și ${names.at(-1)} nu apar: sunt foști angajați.`;
  }
  return `${formers.length}${tensOf(formers.length) ? ' de' : ''} foști angajați nu apar.`;
}

const rowReasons: Record<string, string> = {
  [bulkInvitationSkipReasons.formerEmployee]: 'E fost angajat; nu primește invitație.',
  [bulkInvitationSkipReasons.employeeHasParticipant]: 'Are deja acces la portal.',
  [bulkInvitationSkipReasons.employeeInvited]: 'Are deja o invitație deschisă.',
  [bulkInvitationFailureReasons.employeeNotFound]: 'Angajatul nu mai există la acest client.',
  [bulkInvitationFailureReasons.contactNotSaved]:
    'Adresa nu a putut fi salvată în datele angajatului.',
  [participantErrorReasons.invalidAddress]: 'Scrie un email sau un număr de telefon valid.',
};

export function rowReasonMessage(reason: string | null) {
  return (
    (reason && (rowReasons[reason] ?? participantReasonMessage(reason))) ??
    'Invitația nu a putut fi trimisă. Încearcă din nou din pagina angajatului.'
  );
}
