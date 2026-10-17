import { z } from 'zod';

import {
  supplementaryTrainingReasonSchema,
  trainingAdmissionSchema,
  trainingDomainSchema,
  trainingPhaseSchema,
} from './trainings';

export const signerSlots = ['trainee', 'trainer', 'verifier', 'admitter'] as const;
export const signerSlotSchema = z.enum(signerSlots);
export type SignerSlot = z.infer<typeof signerSlotSchema>;

export const signerSlotLabels: Record<SignerSlot, string> = {
  trainee: 'Instruit',
  trainer: 'Instructor',
  verifier: 'Verificat',
  admitter: 'Admis la lucru',
};

export const signatureRequestStates = ['pending', 'signed', 'void'] as const;
export const signatureRequestStateSchema = z.enum(signatureRequestStates);
export type SignatureRequestState = z.infer<typeof signatureRequestStateSchema>;

/**
 * A slot of a record as the member sees it: `unassigned` has neither a request nor a signature,
 * `paper` is marked as signed by hand, `void` had a request or a signature that was voided and
 * nothing live since.
 */
export const signatureSlotStates = ['unassigned', 'pending', 'signed', 'paper', 'void'] as const;
export const signatureSlotStateSchema = z.enum(signatureSlotStates);
export type SignatureSlotState = z.infer<typeof signatureSlotStateSchema>;

export const signerKinds = ['member', 'employee', 'client_administrator'] as const;
export const signerKindSchema = z.enum(signerKinds);
export type SignerKind = z.infer<typeof signerKindSchema>;

export const signatureErrorReasons = {
  recordSigned: 'record_signed',
  recordHasSignatures: 'record_has_signatures',
  slotSigned: 'slot_signed',
  slotNotOnRecord: 'slot_not_on_record',
  reasonRequired: 'reason_required',
  signerNameRequired: 'signer_name_required',
  signerNotOfClient: 'signer_not_of_client',
  signerNotAddressed: 'signer_not_addressed',
  signatureWrittenOnce: 'signature_written_once',
  agreementSignedElectronically: 'agreement_signed_electronically',
  codeRateLimited: 'code_rate_limited',
  codeAttemptsExceeded: 'code_attempts_exceeded',
  codeExpired: 'code_expired',
  codeAlreadyUsed: 'code_already_used',
  codeInvalid: 'code_invalid',
  signingSessionNotFound: 'signing_session_not_found',
  employeeHasNoAddress: 'employee_has_no_address',
  // 503: nothing was signed or sent.
  signingUnavailable: 'signing_unavailable',
  signingCodeNotSent: 'signing_code_not_sent',
} as const;

export type SignatureErrorReason =
  (typeof signatureErrorReasons)[keyof typeof signatureErrorReasons];

export const signerCandidateSchema = z.object({
  accountId: z.uuid(),
  name: z.string(),
  // A member's professional title, an employee's contract title; null when none is held.
  jobTitle: z.string().nullable(),
  kind: signerKindSchema,
  // The employee a participant is; null for a member and an administrator who is not one.
  employeeId: z.uuid().nullable(),
});

export type SignerCandidate = z.infer<typeof signerCandidateSchema>;

export const signerCandidatesResponseSchema = z.object({
  items: z.array(signerCandidateSchema),
});

export type SignerCandidatesResponse = z.infer<typeof signerCandidatesResponseSchema>;

export const signatureSlotSchema = z.object({
  slot: signerSlotSchema,
  state: signatureSlotStateSchema,
  // The live request, or the newest void one.
  requestId: z.uuid().nullable(),
  // The account addressed by a pending or electronically signed slot, with its name as the app
  // knows it; null when the account is no longer a member or a participant.
  signer: z.object({ accountId: z.uuid(), name: z.string().nullable() }).nullable(),
  issuedAt: z.iso.datetime({ offset: true }).nullable(),
  notifiedAt: z.iso.datetime({ offset: true }).nullable(),
  // The signature, electronic or on paper: the name and function as printed.
  signedAt: z.iso.datetime({ offset: true }).nullable(),
  signerName: z.string().nullable(),
  signerJobTitle: z.string().nullable(),
  voidedAt: z.iso.datetime({ offset: true }).nullable(),
  voidReason: z.string().nullable(),
});

export type SignatureSlot = z.infer<typeof signatureSlotSchema>;

/** Only the slots the record has: the verifier with a verifier, the admitter with an admission. */
export const recordSignaturesResponseSchema = z.object({
  recordId: z.uuid(),
  slots: z.array(signatureSlotSchema),
});

export type RecordSignaturesResponse = z.infer<typeof recordSignaturesResponseSchema>;

export const paperSignatureRequestSchema = z.object({
  slot: signerSlotSchema,
  signerName: z.string().trim().min(1).max(160),
  signerJobTitle: z.string().trim().min(1).max(160).nullish(),
});

export type PaperSignatureRequest = z.infer<typeof paperSignatureRequestSchema>;

export const voidSignaturesRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type VoidSignaturesRequest = z.infer<typeof voidSignaturesRequestSchema>;

export const signingAgreementStates = [
  'generated',
  'signed_electronically',
  'signed_on_paper',
] as const;
export const signingAgreementStateSchema = z.enum(signingAgreementStates);
export type SigningAgreementState = z.infer<typeof signingAgreementStateSchema>;

/** Null until a member records the agreement as generated or signed. */
export const signingAgreementSchema = z
  .object({
    state: signingAgreementStateSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    signedAt: z.iso.datetime({ offset: true }).nullable(),
    // The scan of a paper agreement, a file of the client.
    clientFileId: z.uuid().nullable(),
  })
  .nullable();

export type SigningAgreement = z.infer<typeof signingAgreementSchema>;

export const signingAgreementResponseSchema = z.object({ agreement: signingAgreementSchema });

export type SigningAgreementResponse = z.infer<typeof signingAgreementResponseSchema>;

/** `signed_electronically` is set by the signing flow only. */
export const signingAgreementStateRequestSchema = z.object({
  state: z.enum(['generated', 'signed_on_paper']),
  clientFileId: z.uuid().nullish(),
});

export type SigningAgreementStateRequest = z.infer<typeof signingAgreementStateRequestSchema>;

const requestRecordSchema = z.object({
  id: z.uuid(),
  trainingId: z.uuid(),
  employee: z.object({ id: z.uuid(), lastName: z.string(), firstName: z.string() }),
  domain: trainingDomainSchema,
  phase: trainingPhaseSchema,
  heldOn: z.iso.date(),
});

export const signatureRequestItemSchema = z.object({
  id: z.uuid(),
  slot: signerSlotSchema,
  state: signatureRequestStateSchema,
  issuedAt: z.iso.datetime({ offset: true }),
  notifiedAt: z.iso.datetime({ offset: true }).nullable(),
  client: z.object({ id: z.uuid(), name: z.string() }),
  record: requestRecordSchema,
  signer: z.object({ accountId: z.uuid(), name: z.string().nullable() }).nullable(),
  // The employee's signing agreement; null when none is recorded, which the lists warn about.
  agreementState: signingAgreementStateSchema.nullable(),
});

export type SignatureRequestItem = z.infer<typeof signatureRequestItemSchema>;

export const signatureRequestListResponseSchema = z.object({
  items: z.array(signatureRequestItemSchema),
});

export type SignatureRequestListResponse = z.infer<typeof signatureRequestListResponseSchema>;

export const clientSignatureRequestsQuerySchema = z.object({
  state: signatureRequestStateSchema.default('pending'),
});

const portalPersonSchema = z.object({ name: z.string(), jobTitle: z.string() });

export const portalSignatureRequestSchema = z.object({
  id: z.uuid(),
  slot: signerSlotSchema,
  issuedAt: z.iso.datetime({ offset: true }),
  // The person the slot prints: the trainee, the trainer, the verifier or who admits to work.
  signerName: z.string(),
  record: z.object({
    id: z.uuid(),
    employee: z.object({ id: z.uuid(), lastName: z.string(), firstName: z.string() }),
    domain: trainingDomainSchema,
    phase: trainingPhaseSchema,
    heldOn: z.iso.date(),
    durationMinutes: z.int(),
    material: z.string(),
    trainer: portalPersonSchema,
    verifier: portalPersonSchema.nullable(),
    supplementaryReason: supplementaryTrainingReasonSchema.nullable(),
    occupation: z.string(),
    admission: trainingAdmissionSchema.nullable(),
  }),
  agreementState: signingAgreementStateSchema.nullable(),
});

export type PortalSignatureRequest = z.infer<typeof portalSignatureRequestSchema>;

export const portalSignatureRequestsResponseSchema = z.object({
  items: z.array(portalSignatureRequestSchema),
});

export type PortalSignatureRequestsResponse = z.infer<typeof portalSignatureRequestsResponseSchema>;
