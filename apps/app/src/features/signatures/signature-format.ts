import {
  type ApiErrorResponse,
  clientConflictReasons,
  signatureErrorReasons,
  type SignatureSlotState,
  type SignerKind,
  type SignerSlot,
  type SigningAgreementState,
} from '@ssm-usor/contracts';

import type { SignSessionResponseFailedItemReason } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { roCount } from '@/features/employees/employee-format';

export const slotStateLabels: Record<SignatureSlotState, string> = {
  pending: 'De semnat',
  signed: 'Semnat electronic',
  paper: 'Semnat pe hârtie',
  void: 'Anulat',
  unassigned: 'Fără semnatar',
};

export const slotStateBadgeClasses: Record<SignatureSlotState, string> = {
  pending: 'border-warning-border bg-warning text-warning-foreground',
  signed: 'border-success-border bg-success text-success-foreground',
  paper: 'border-border bg-secondary text-secondary-foreground',
  void: 'border-border text-muted-foreground line-through',
  unassigned: 'border-dashed border-border text-muted-foreground',
};

export const signerRoleLabels: Record<SignerSlot, string> = {
  trainee: 'instruit',
  trainer: 'instructor',
  verifier: 'cel care a verificat',
  admitter: 'cel care admite la lucru',
};

export const signerKindLabels: Record<SignerKind, string> = {
  member: 'organizația ta',
  employee: 'angajat',
  client_administrator: 'administratorul clientului',
};

export const agreementStateLabels: Record<SigningAgreementState | 'none', string> = {
  none: 'Negenerat',
  generated: 'Generat',
  signed_electronically: 'Semnat electronic',
  signed_on_paper: 'Semnat pe hârtie',
  withdrawn: 'Revenire la semnarea olografă',
  in_contract: 'Clauză în contract',
};

export const agreementSigned = (state: SigningAgreementState | null | undefined) =>
  state === 'signed_electronically' || state === 'signed_on_paper';

export const reasonOf = (cause: unknown) =>
  cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse> | null)?.reason : null;

const signingMessages: Partial<Record<string, string>> = {
  [signatureErrorReasons.recordSigned]:
    'Instruirea are semnături electronice și nu se mai poate modifica. Anulează semnăturile, apoi modific-o.',
  [signatureErrorReasons.recordHasSignatures]:
    'Instruirea are semnături, pe hârtie sau electronice, care rămân în evidență; nu se mai poate șterge.',
  [signatureErrorReasons.slotSigned]: 'Rubrica este deja semnată.',
  [signatureErrorReasons.slotNotOnRecord]: 'Instruirea nu are această rubrică de semnătură.',
  [signatureErrorReasons.reasonRequired]: 'Scrie motivul anulării.',
  [signatureErrorReasons.signerNameRequired]: 'Completează numele celui care a semnat.',
  [signatureErrorReasons.signerNotOfClient]:
    'Semnatarul ales nu mai este membru al organizației sau participant al clientului. Alege din nou.',
  [signatureErrorReasons.agreementSignedElectronically]:
    'Actul adițional este semnat electronic; starea lui nu se mai schimbă de aici.',
  [signatureErrorReasons.employeeHasNoAddress]:
    'Angajatul nu are email sau telefon. Actul adițional spune unde primește codurile de semnare, așa că adaugă unul în datele lui.',
  [clientConflictReasons.clientArchived]:
    'Clientul este arhivat; semnăturile lui nu se mai schimbă.',
};

// Null for a refusal the caller words itself.
export function signingMessage(cause: unknown): string | null {
  const reason = reasonOf(cause);
  return (reason && signingMessages[reason]) || null;
}

export function signingFailure(cause: unknown, fallback: string) {
  if (cause instanceof ApiHttpError && cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  return signingMessage(cause) ?? fallback;
}

export const hasSigningReason = (cause: unknown, reason: string) => reasonOf(cause) === reason;

const sessionMessages: Partial<Record<string, string>> = {
  [signatureErrorReasons.codeRateLimited]:
    'Ți-am trimis un cod în ultimul minut. Așteaptă un minut de la el, apoi cere altul.',
  [signatureErrorReasons.signerHasNoAddress]:
    'Contul tău nu are o adresă la care să trimitem codul. Nu s-a semnat nimic.',
  [signatureErrorReasons.signingCodeNotSent]:
    'Codul nu a putut fi trimis. Nu s-a semnat nimic; încearcă din nou.',
  [signatureErrorReasons.signingUnavailable]:
    'Semnarea nu este disponibilă acum. Nu s-a semnat nimic; încearcă mai târziu.',
  [signatureErrorReasons.signingItemNotFound]:
    'O instruire din listă nu mai așteaptă semnătura ta: a fost semnată, anulată sau modificată între timp. Închide și alege din nou.',
};

export function signingSessionFailure(cause: unknown) {
  const reason = reasonOf(cause);
  return (
    (reason && sessionMessages[reason]) ??
    signingFailure(cause, 'Nu am putut trimite codul. Verifică conexiunea și încearcă din nou.')
  );
}

// The code is spent or dead: only a new one goes on.
export const codeNeedsRenewal: ReadonlySet<string> = new Set([
  signatureErrorReasons.codeExpired,
  signatureErrorReasons.codeAlreadyUsed,
  signatureErrorReasons.codeAttemptsExceeded,
  signatureErrorReasons.signingSessionNotFound,
]);

export const renewalMessages: Partial<Record<string, string>> = {
  [signatureErrorReasons.codeExpired]: 'Codul a expirat. Cere un cod nou.',
  [signatureErrorReasons.codeAlreadyUsed]: 'Codul a fost folosit deja. Cere un cod nou.',
  [signatureErrorReasons.codeAttemptsExceeded]:
    'Codul a fost greșit de prea multe ori. Cere un cod nou.',
  [signatureErrorReasons.signingSessionNotFound]:
    'Sesiunea de semnare nu mai există. Cere un cod nou.',
};

export const wrongCodeMessage = (attemptsLeft: number) =>
  attemptsLeft > 1
    ? `Codul nu este corect. Mai ai ${attemptsLeft} încercări.`
    : 'Codul nu este corect. Mai ai o singură încercare.';

export const signingItemFailures: Record<SignSessionResponseFailedItemReason, string> = {
  request_not_pending:
    'Nu mai aștepta semnătura ta: a fost semnată, anulată sau instruirea s-a modificat.',
  agreement_not_awaiting: 'Actul adițional nu mai aștepta semnătura.',
  sheet_busy: 'Fișa angajatului primea în același timp altă semnătură. Semnează din nou.',
  slot_not_on_sheet:
    'Fișa nu are o rubrică pentru această semnătură; marcheaz-o semnată pe hârtie.',
  missing_sheet_data:
    'Fișa angajatului nu are toate datele (locul de muncă, traseul). Completează-le, apoi semnează din nou.',
  signer_unavailable: 'Serviciul de semnare nu a răspuns. Încearcă din nou mai târziu.',
  pdf_unavailable: 'Fișa nu a putut fi făcută PDF acum. Încearcă din nou mai târziu.',
  template_missing: 'Modelul fișei de instruire lipsește. Scrie-ne, ca să-l punem la loc.',
  signing_failed: 'Semnătura nu a reușit. Încearcă din nou; dacă se repetă, scrie-ne.',
  agreement_changed: 'Actul adițional s-a schimbat de când ai cerut codul. Semnează din nou.',
  missing_document_data:
    'Clientului îi lipsesc numele sau funcția reprezentantului legal. Completează-le, apoi semnează din nou.',
  client_archived: 'Clientul a fost arhivat; nu se mai semnează nimic pentru el.',
  signer_not_of_client: 'Nu mai faci parte din organizație sau din client, așa că nu poți semna.',
  row_locked:
    'Rândul instruirii pe fișă este ținut de o semnătură fără evidență. Scrie-ne, ca să-l deblocăm.',
  already_signed: 'Rubrica era deja semnată pe fișă.',
  locked_field: 'Rubrica fișei este blocată de o semnătură de după ea. Scrie-ne.',
  unknown_fields: 'Fișa nu are rubricile așteptate. Scrie-ne, ca să o refacem.',
  cannot_certify: 'Fișa nu a mai putut fi certificată. Scrie-ne.',
  signer_refused: 'Serviciul de semnare a refuzat fișa. Scrie-ne.',
};

// The API's limit on one signing session.
export const signingBatchLimit = 30;

export const trainingCount = (count: number) => roCount(count, 'instruire', 'instruiri');
