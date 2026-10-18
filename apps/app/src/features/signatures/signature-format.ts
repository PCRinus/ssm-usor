import {
  type ApiErrorResponse,
  clientConflictReasons,
  signatureErrorReasons,
  type SignatureSlotState,
  type SignerKind,
  type SignerSlot,
  type SigningAgreementState,
} from '@ssm-usor/contracts';

import { ApiHttpError } from '@/api/http';

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
};

export const agreementSigned = (state: SigningAgreementState | null | undefined) =>
  state === 'signed_electronically' || state === 'signed_on_paper';

const reasonOf = (cause: unknown) =>
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
