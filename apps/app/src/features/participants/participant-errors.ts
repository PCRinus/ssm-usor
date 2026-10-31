import { participantErrorReasons } from '@ssm-usor/contracts';

import type { ApiErrorResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';

import { formatTime } from './participant-format';

export interface ParticipantFailure {
  message: string;
  aboutAddress: boolean;
  // Only the message failed: the invitation exists and the page shows it once refreshed.
  saved: boolean;
}

const addressReasons: Record<string, string> = {
  [participantErrorReasons.addressHasParticipant]:
    'Această adresă aparține deja unui participant al clientului.',
  [participantErrorReasons.addressInvitedForAnotherPerson]:
    'La această adresă există deja o invitație deschisă pentru altă persoană a clientului.',
  [participantErrorReasons.addressNotOfEmployee]:
    'Adresa nu mai este cea din datele angajatului. Reîncarcă pagina și încearcă din nou.',
  [participantErrorReasons.invalidAddress]:
    'Adresa nu poate primi o invitație. Verifică emailul sau numărul de telefon.',
};

const requestReasons: Record<string, string> = {
  [participantErrorReasons.employeeHasParticipant]: 'Angajatul are deja acces la portal.',
  [participantErrorReasons.employeeAlreadyInvited]:
    'Angajatul are deja o invitație deschisă la cealaltă adresă. Revoc-o înainte de a-l invita la aceasta.',
  [participantErrorReasons.employeeRequired]: 'Alege angajatul care primește invitația.',
  [participantErrorReasons.fullNameRequired]: 'Completează numele persoanei invitate.',
  [participantErrorReasons.invitationAccepted]:
    'Invitația a fost acceptată între timp, așa că persoana are acces la portal.',
  [participantErrorReasons.invitationRevoked]: 'Invitația a fost revocată între timp.',
  client_archived: 'Clientul este arhivat; nu i se mai trimit invitații în portal.',
  client_is_lead:
    'Clientul este încă un client potențial. Transformă-l în client înainte de a invita pe cineva în portal.',
};

const savedReasons = new Set<string>([
  participantErrorReasons.accountUnavailable,
  participantErrorReasons.messageNotSent,
]);

const savedMessage =
  'Invitația a fost salvată, dar mesajul nu a putut fi trimis. O poți retrimite peste 10 minute.';

export function participantReasonMessage(reason: string): string | null {
  if (reason === participantErrorReasons.sentRecently) {
    return 'Am trimis deja un mesaj la această adresă în ultimele 10 minute. Încearcă din nou peste câteva minute.';
  }
  if (savedReasons.has(reason)) return savedMessage;
  return addressReasons[reason] ?? requestReasons[reason] ?? null;
}

const failure = (message: string, aboutAddress = false, saved = false): ParticipantFailure => ({
  message,
  aboutAddress,
  saved,
});

export function participantFailure(cause: unknown, resendableAt?: string): ParticipantFailure {
  if (!(cause instanceof ApiHttpError)) {
    return failure('Acțiunea nu a reușit. Verifică conexiunea și încearcă din nou.');
  }
  const reason = (cause.body as Partial<ApiErrorResponse> | undefined)?.reason ?? '';
  if (reason === participantErrorReasons.sentRecently) {
    return failure(
      resendableAt
        ? `Am trimis deja un mesaj la această adresă în ultimele 10 minute. Poți retrimite după ora ${formatTime(resendableAt)}.`
        : 'Am trimis deja un mesaj la această adresă în ultimele 10 minute. Încearcă din nou peste câteva minute.',
      true
    );
  }
  if (savedReasons.has(reason)) {
    return failure(savedMessage, false, true);
  }
  const addressMessage = addressReasons[reason];
  if (addressMessage) return failure(addressMessage, true);
  const requestMessage = requestReasons[reason];
  if (requestMessage) return failure(requestMessage);
  if (cause.status === 503) {
    return failure('Invitațiile în portal nu pot fi trimise acum. Încearcă din nou mai târziu.');
  }
  if (cause.status === 404) {
    return failure('Persoana sau invitația nu mai există la acest client.');
  }
  if (cause.status === 401) {
    return failure('Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.');
  }
  if (cause.status === 400) {
    return failure('Adresa nu este validă. Verifică emailul sau numărul de telefon.', true);
  }
  return failure('Acțiunea nu a reușit. Verifică conexiunea și încearcă din nou.');
}
