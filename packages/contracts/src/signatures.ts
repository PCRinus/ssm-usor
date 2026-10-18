import { z } from 'zod';

import { participantChannelSchema } from './participants';
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
  verifier: 'Verificator',
  admitter: 'Admite la lucru',
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
  signingItemNotFound: 'signing_item_not_found',
  agreementSignedInPortal: 'agreement_signed_in_portal',
  signerHasNoAddress: 'signer_has_no_address',
  requestNotPending: 'request_not_pending',
  sessionMismatch: 'session_mismatch',
  sessionUsed: 'session_used',
  agreementNotAwaiting: 'agreement_not_awaiting',
  agreementSignerNotParty: 'agreement_signer_not_party',
  agreementRecorded: 'agreement_recorded',
  agreementWithdrawn: 'agreement_withdrawn',
  signerNameMismatch: 'signer_name_mismatch',
} as const;

/**
 * Why a request was voided, as `voidReason` carries it: these codes, or the member's own words
 * when they voided the record's signatures.
 */
export const signatureVoidReasons = [
  'record_changed',
  'signed_on_paper',
  'signer_changed',
  'paper',
  'signer_left',
  'archived',
  'withdrawn',
] as const;
export type SignatureVoidReason = (typeof signatureVoidReasons)[number];

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
  // Any signature row, voided or on paper included, which keeps the record and its training from
  // being deleted.
  hasSignatures: z.boolean(),
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

/**
 * `withdrawn`: the employee went back to signing by hand, and no trainee request goes to them
 * while it stands. `in_contract`: a new hire whose employment contract carries the clause, which
 * counts as agreed, with no PDF of its own.
 */
export const signingAgreementStates = [
  'generated',
  'signed_electronically',
  'signed_on_paper',
  'withdrawn',
  'in_contract',
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
    // The electronic signatures: the employee's first, then the employer's.
    employeeSignedAt: z.iso.datetime({ offset: true }).nullable(),
    employerSignedAt: z.iso.datetime({ offset: true }).nullable(),
    // Whose electronic signature the agreement waits for: the employee's first, then the
    // employer's; null once settled or recorded otherwise.
    awaiting: z.enum(['employee', 'employer']).nullable(),
  })
  .nullable();

export type SigningAgreement = z.infer<typeof signingAgreementSchema>;

export const signingAgreementResponseSchema = z.object({ agreement: signingAgreementSchema });

export type SigningAgreementResponse = z.infer<typeof signingAgreementResponseSchema>;

/** `signed_electronically` is set by the signing flow only. */
export const signingAgreementStateRequestSchema = z.object({
  state: z.enum(['generated', 'signed_on_paper', 'withdrawn', 'in_contract']),
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

export const signingAgreementParties = ['employee', 'employer'] as const;
export const signingAgreementPartySchema = z.enum(signingAgreementParties);
export type SigningAgreementParty = z.infer<typeof signingAgreementPartySchema>;

// A session signs within one Worker request, a few dozen subrequests per item.
export const SIGNING_SESSION_MAX_ITEMS = 30;
const idList = z.array(z.uuid()).max(SIGNING_SESSION_MAX_ITEMS);

export const signingSessionRequestSchema = z
  .object({
    requestIds: idList,
    // Only in the portal: an employee's own agreement, or for the client administrator the
    // agreements of the client's employees that await the employer.
    agreementEmployeeIds: idList.optional(),
  })
  .superRefine((body, ctx) => {
    const total = body.requestIds.length + (body.agreementEmployeeIds?.length ?? 0);
    if (total === 0) {
      ctx.addIssue({ code: 'custom', path: ['requestIds'], message: 'Nothing to sign.' });
    }
    if (total > SIGNING_SESSION_MAX_ITEMS) {
      ctx.addIssue({
        code: 'custom',
        path: ['requestIds'],
        message: `At most ${SIGNING_SESSION_MAX_ITEMS} items in one session.`,
      });
    }
    if (new Set(body.requestIds).size !== body.requestIds.length) {
      ctx.addIssue({ code: 'custom', path: ['requestIds'], message: 'Each request once.' });
    }
    const agreements = body.agreementEmployeeIds ?? [];
    if (new Set(agreements).size !== agreements.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['agreementEmployeeIds'],
        message: 'Each agreement once.',
      });
    }
  });

export type SigningSessionRequest = z.infer<typeof signingSessionRequestSchema>;

export const signingSessionItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('request'), requestId: z.uuid() }),
  z.object({
    kind: z.literal('agreement'),
    employeeId: z.uuid(),
    party: signingAgreementPartySchema,
  }),
]);

export type SigningSessionItem = z.infer<typeof signingSessionItemSchema>;

export const signingSessionResponseSchema = z.object({
  sessionId: z.uuid(),
  channel: participantChannelSchema,
  // The address the code went to, masked: `i***@example.ro`, `+40 7** *** *12`.
  addressHint: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
  // Agreements first, then the requests in the order asked.
  items: z.array(signingSessionItemSchema),
});

export type SigningSessionResponse = z.infer<typeof signingSessionResponseSchema>;

export const signCodeRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Six digits.'),
});

export type SignCodeRequest = z.infer<typeof signCodeRequestSchema>;

/**
 * Why one item of a session was not signed while the others were: `request_not_pending` and
 * `agreement_not_awaiting` when it was signed, voided or changed since the code was asked for,
 * `agreement_changed` when the agreement no longer says what it said then,
 * `missing_document_data` for an agreement of a client without its legal representative's name
 * or role,
 * `client_archived`, `signer_not_of_client` when the signer left the organization or the client,
 * `sheet_busy` when another write held the sheet, `slot_not_on_sheet` for a slot the sheet has no
 * field for (the fire-safety sheet's verifier and admitter), `missing_sheet_data` when the sheet
 * cannot be drawn up yet, `row_locked` when the record's row is held by a signature whose evidence
 * is missing, the signer service's own refusals (`already_signed`, `locked_field`,
 * `unknown_fields`, `cannot_certify`, `signer_refused` for any other), `signer_unavailable` and
 * `pdf_unavailable` when a service failed, `template_missing`, and `signing_failed` for anything
 * else.
 */
export const signingItemFailureReasons = [
  'request_not_pending',
  'agreement_not_awaiting',
  'agreement_changed',
  'missing_document_data',
  'client_archived',
  'signer_not_of_client',
  'sheet_busy',
  'slot_not_on_sheet',
  'missing_sheet_data',
  'row_locked',
  'already_signed',
  'locked_field',
  'unknown_fields',
  'cannot_certify',
  'signer_refused',
  'signer_unavailable',
  'pdf_unavailable',
  'template_missing',
  'signing_failed',
] as const;
export const signingItemFailureReasonSchema = z.enum(signingItemFailureReasons);
export type SigningItemFailureReason = z.infer<typeof signingItemFailureReasonSchema>;

export const signSessionResponseSchema = z.object({
  signed: z.array(
    z.object({
      requestId: z.uuid(),
      // The trainee's signing agreement after this session; a record is signed without one, and
      // the screen keeps warning.
      agreementState: signingAgreementStateSchema.nullable(),
    })
  ),
  failed: z.array(z.object({ requestId: z.uuid(), reason: signingItemFailureReasonSchema })),
  agreements: z.array(
    z.object({
      employeeId: z.uuid(),
      party: signingAgreementPartySchema,
      signed: z.boolean(),
      // Null when signed.
      reason: signingItemFailureReasonSchema.nullable(),
      agreementState: signingAgreementStateSchema.nullable(),
    })
  ),
});

export type SignSessionResponse = z.infer<typeof signSessionResponseSchema>;

export const portalSigningAgreementItemSchema = z.object({
  employee: z.object({ id: z.uuid(), lastName: z.string(), firstName: z.string() }),
  agreement: signingAgreementSchema.unwrap(),
  // The employee has signed and the employer has not.
  awaitingEmployer: z.boolean(),
});

export type PortalSigningAgreementItem = z.infer<typeof portalSigningAgreementItemSchema>;

export const portalSigningAgreementsResponseSchema = z.object({
  items: z.array(portalSigningAgreementItemSchema),
});

export type PortalSigningAgreementsResponse = z.infer<typeof portalSigningAgreementsResponseSchema>;
