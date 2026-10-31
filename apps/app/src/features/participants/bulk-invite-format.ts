import {
  bulkInvitationFailureReasons,
  bulkInvitationSkipReasons,
  type ImportInvitee,
  participantErrorReasons,
} from '@ssm-usor/contracts';

import { roCount } from '@/features/employees/employee-format';

import { participantReasonMessage } from './participant-errors';

/** "0 invitații", "o invitație", "3 invitații", "20 de invitații". */
export function invitationCount(count: number) {
  return count === 1 ? 'o invitație' : roCount(count, 'invitație', 'invitații');
}

export function sendLabel(count: number) {
  if (count === 0) return 'Trimite invitațiile';
  return count === 1 ? 'Trimite invitația' : `Trimite ${invitationCount(count)}`;
}

export const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Nicio invitație de trimis", "O invitație", "3 invitații, 1 rămâne neinvitat". */
export function pendingSummary(toSend: number, leftOut: number) {
  if (toSend === 0) return 'Nicio invitație de trimis';
  const sending = capitalized(invitationCount(toSend));
  return leftOut === 0 ? sending : `${sending}, ${uninvitedCount(leftOut)}`;
}

export function sentSummary(invited: number, notInvited: number) {
  const sent =
    invited === 0 ? 'Nicio invitație nu a plecat.' : `Am trimis ${invitationCount(invited)}.`;
  if (notInvited === 0) return sent;
  return notInvited === 1
    ? `${sent} Pentru un angajat nu a mers: vezi rândul lui.`
    : `${sent} Pentru ${roCount(notInvited, 'angajat', 'angajați')} nu a mers: vezi rândurile lor.`;
}

/** "1 rămâne neinvitat", "35 rămân neinvitați". */
export function uninvitedCount(count: number) {
  return count === 1 ? '1 rămâne neinvitat' : `${count} rămân neinvitați`;
}

export const nameOf = (invitee: Pick<ImportInvitee, 'lastName' | 'firstName'>) =>
  `${invitee.lastName} ${invitee.firstName}`;

export function formerEmployeesSentence(formers: ImportInvitee[]) {
  if (formers.length === 0) return null;
  if (formers.length === 1) return `${nameOf(formers[0]!)} nu apare: e fost angajat.`;
  if (formers.length <= 3) {
    const names = formers.map(nameOf);
    return `${names.slice(0, -1).join(', ')} și ${names.at(-1)} nu apar: sunt foști angajați.`;
  }
  return `${roCount(formers.length, 'fost angajat', 'foști angajați')} nu apar.`;
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
