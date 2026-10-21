import {
  type ApiErrorResponse,
  clientConflictReasons,
  signatureErrorReasons,
  type SignatureRequestSlot,
  type SignatureSlotState,
  type SignatureVoidReason,
  type SignerKind,
  signerSlotLabels,
  type SigningAgreementState,
  type TrainingDomain,
  type TrainingPhase,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';

import type { SignSessionResponseFailedItemReason } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { formatDate, roCount } from '@/features/employees/employee-format';

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
  void: 'border-border text-muted-foreground',
  unassigned: 'border-dashed border-border text-muted-foreground',
};

export const signAsLabel = (slot: SignatureRequestSlot) =>
  slot === 'admitter'
    ? `semnezi la „${signerSlotLabels.admitter}”`
    : `semnezi ca ${signerSlotLabels[slot].toLowerCase()}`;

interface RequestDocument {
  label: string;
  record: { domain: TrainingDomain; phase: TrainingPhase; heldOn: string } | null;
  testSheet: { domain: TrainingDomain; takenOn: string } | null;
}

// A request signs either a training record or a test sheet: exactly one of the two is set.
export function requestDocument(request: RequestDocument) {
  if (request.record) {
    const { domain, phase, heldOn } = request.record;
    return {
      domain,
      day: heldOn,
      ofEmployee: 'instruirea lui',
      summary: `${trainingPhaseLabels[phase]} · ${formatDate(heldOn)}`,
    };
  }
  const { domain, takenOn } = request.testSheet!;
  return { domain, day: takenOn, ofEmployee: 'fișa de test a lui', summary: request.label };
}

const voidReasonLabels: Record<SignatureVoidReason, string> = {
  record_changed: 'instruirea a fost modificată',
  signer_changed: 'semnatarul a fost schimbat',
  paper: 'trecută pe hârtie',
  signer_left: 'semnatarul nu mai face parte din client sau din organizație',
  archived: 'clientul a fost arhivat',
  withdrawn: 'salariatul a revenit la semnarea olografă',
  signed_on_paper: 'semnată pe hârtie',
};

// A void reason is one of the app's codes, or the member's own words when they voided it.
export const voidReasonLabel = (reason: string) =>
  (voidReasonLabels as Partial<Record<string, string>>)[reason] ?? reason;

export const signerKindLabels: Record<SignerKind, string> = {
  member: 'organizația ta',
  employee: 'angajat',
  client_administrator: 'administratorul clientului',
};

export const agreementStateLabels: Record<SigningAgreementState | 'none', string> = {
  none: 'Nesemnat',
  generated: 'Generat',
  signed_electronically: 'Semnat electronic',
  signed_on_paper: 'Semnat pe hârtie',
  withdrawn: 'Revenire la semnarea olografă',
  in_contract: 'Clauza în contract',
};

export const agreementSigned = (state: SigningAgreementState | null | undefined) =>
  state === 'signed_electronically' || state === 'signed_on_paper' || state === 'in_contract';

interface AgreementSignatures {
  state: SigningAgreementState;
  employeeSignedAt: string | null;
  employerSignedAt: string | null;
}

export const agreementAwaitsEmployer = <T extends AgreementSignatures>(
  agreement: T | null | undefined
): agreement is T & { employeeSignedAt: string } =>
  agreement?.state === 'generated' &&
  Boolean(agreement.employeeSignedAt) &&
  !agreement.employerSignedAt;

export const reasonOf = (cause: unknown) =>
  cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse> | null)?.reason : null;

const signingMessages: Partial<Record<string, string>> = {
  [signatureErrorReasons.recordSigned]:
    'Instruirea are semnături electronice și nu se mai poate modifica. Anulează semnăturile, apoi modifică instruirea.',
  [signatureErrorReasons.recordHasSignatures]:
    'Instruirea are semnături, pe hârtie sau electronice, care rămân în evidență; nu se mai poate șterge.',
  [signatureErrorReasons.slotSigned]: 'Rubrica este deja semnată.',
  [signatureErrorReasons.slotNotOnRecord]: 'Instruirea nu are această rubrică de semnătură.',
  [signatureErrorReasons.reasonRequired]: 'Scrie motivul anulării.',
  [signatureErrorReasons.signerNameRequired]: 'Completează numele celui care a semnat.',
  [signatureErrorReasons.signerNotOfClient]:
    'Semnatarul ales nu mai este membru al organizației sau participant al clientului. Alege din nou.',
  [signatureErrorReasons.signerNameMismatch]:
    'Contul ales nu poartă numele tipărit în rubrică. Alege persoana cu acest nume sau folosește numele semnatarului.',
  [signatureErrorReasons.agreementRecorded]:
    'Actul adițional are o stare înregistrată și rămâne în dosarul angajatului.',
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
  [signatureErrorReasons.signerHasNoAddress]:
    'Contul tău nu are o adresă la care să trimitem codul. Nu s-a semnat nimic.',
  [signatureErrorReasons.signingCodeNotSent]:
    'Codul nu a putut fi trimis. Nu s-a semnat nimic; încearcă din nou.',
  [signatureErrorReasons.signingUnavailable]:
    'Semnarea nu este disponibilă acum. Nu s-a semnat nimic; încearcă mai târziu.',
  [signatureErrorReasons.signingItemNotFound]:
    'O instruire din listă nu mai așteaptă semnătura ta: a fost semnată, anulată sau modificată între timp. Închide și alege din nou.',
  [signatureErrorReasons.agreementSignedInPortal]:
    'Actul adițional se semnează în portal, de angajat și de administratorul clientului.',
};

const errorBody = (cause: unknown) =>
  cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse> | null) : null;

export function signingSessionFailure(cause: unknown) {
  const body = errorBody(cause);
  if (body?.reason === signatureErrorReasons.codeRateLimited) {
    const wait = body.retryAfterSeconds;
    return wait
      ? `Ți-am trimis un cod acum mai puțin de un minut. Poți cere altul peste ${roCount(wait, 'secundă', 'secunde')}.`
      : 'Ți-am trimis un cod acum mai puțin de un minut. Așteaptă puțin, apoi cere altul.';
  }
  if (cause instanceof ApiHttpError && cause.status === 400) {
    return `Cu un cod semnezi cel mult ${signingBatchLimit} de instruiri. Alege mai puține și încearcă din nou.`;
  }
  return (
    (body?.reason && sessionMessages[body.reason]) ??
    signingFailure(cause, 'Nu am putut trimite codul. Verifică conexiunea și încearcă din nou.')
  );
}

// Null when the refusal carries no count.
export const attemptsLeftOf = (cause: unknown) => errorBody(cause)?.attemptsLeft ?? null;

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
  [signatureErrorReasons.signingSessionNotFound]: 'Sesiunea de semnare a expirat. Cere un cod nou.',
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
    'Fișa nu are o rubrică pentru această semnătură; marchează rubrica semnată pe hârtie.',
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
