import { z } from 'zod';

import { responsiblePersonRoleSchema } from './document-data';
import { bloodGroupSchema, rhFactorSchema } from './employees';
import { type ParticipantChannel, participantChannelSchema } from './participant-channels';
import { normalizePhone } from './phone';
import { portalSignatureSlotSchema } from './signatures';
import { employeeTestsSchema } from './tests';
import { trainingSheetReadinessSchema } from './training-sheets';
import {
  employeeTrainingSchema,
  supplementaryTrainingReasonSchema,
  trainingAdmissionSchema,
  trainingDomainSchema,
  trainingPhaseSchema,
  trainingSourceSchema,
} from './trainings';

export const participantKinds = ['employee', 'client_administrator'] as const;
export const participantKindSchema = z.enum(participantKinds);
export type ParticipantKind = z.infer<typeof participantKindSchema>;

const invitedEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

const addressFields = {
  channel: participantChannelSchema,
  // An email, or a phone the API stores in E.164 with Romania as the default country.
  address: z.string().trim().min(3).max(254),
};

function normalizedAddress<T extends { channel: ParticipantChannel; address: string }>(
  body: T,
  ctx: z.RefinementCtx
): T {
  const address =
    body.channel === 'email'
      ? invitedEmailSchema.safeParse(body.address).data
      : normalizePhone(body.address);
  if (!address) {
    ctx.addIssue({
      code: 'custom',
      path: ['address'],
      message: body.channel === 'email' ? 'Invalid email address.' : 'Invalid phone number.',
    });
    return z.NEVER;
  }
  return { ...body, address };
}

/**
 * Invites an employee to the portal at their own email or phone, as their row holds it; the
 * employee is the one in the path.
 */
export const participantInvitationRequestSchema = z
  .object(addressFields)
  .transform(normalizedAddress);

export type ParticipantInvitationRequest = z.input<typeof participantInvitationRequestSchema>;

/**
 * Invites the client administrator at a typed address. Either an employee of the client, whose
 * name is read from their row, or a name.
 */
export const clientAdministratorInvitationRequestSchema = z
  .object({
    ...addressFields,
    employeeId: z.uuid().nullish(),
    fullName: z.string().trim().min(2).max(160).nullish(),
  })
  .superRefine((body, ctx) => {
    if (!body.employeeId && !body.fullName) {
      ctx.addIssue({
        code: 'custom',
        path: ['fullName'],
        message: 'A name is needed for a person who is not an employee.',
      });
    }
  })
  .transform(normalizedAddress);

export type ClientAdministratorInvitationRequest = z.input<
  typeof clientAdministratorInvitationRequestSchema
>;

export const participantInvitationStatuses = ['open', 'expired', 'accepted', 'revoked'] as const;
export const participantInvitationStatusSchema = z.enum(participantInvitationStatuses);
export type ParticipantInvitationStatus = z.infer<typeof participantInvitationStatusSchema>;

export const participantInvitationSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  kind: participantKindSchema,
  // Null for a person who is not an employee of the client.
  employeeId: z.uuid().nullable(),
  // The employee's name as their row holds it now, or the name typed for the invitation.
  fullName: z.string(),
  channel: participantChannelSchema,
  // An email, or a phone in E.164.
  address: z.string(),
  status: participantInvitationStatusSchema,
  lastSentAt: z.iso.datetime({ offset: true }),
  // Ten minutes after the last message: no resend before.
  resendableAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
});

export type ParticipantInvitation = z.infer<typeof participantInvitationSchema>;

export const portalLanguages = ['ro', 'en'] as const;

export const portalLanguageSchema = z.enum(portalLanguages);

export type PortalLanguage = z.infer<typeof portalLanguageSchema>;

export const clientParticipantSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  kind: participantKindSchema,
  employeeId: z.uuid().nullable(),
  fullName: z.string(),
  // The invitation's address, which is the one they sign in with.
  channel: participantChannelSchema.nullable(),
  address: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
  // Null until the portal has shown the privacy notice.
  noticeVersion: z.string().nullable(),
  // Null until the participant chose a language on the portal, which then follows the browser.
  language: portalLanguageSchema.nullable(),
});

export type ClientParticipant = z.infer<typeof clientParticipantSchema>;

/** An employee's standing on the portal, for their page: at most one of the two is set. */
export const employeeParticipantStateSchema = z.object({
  participant: clientParticipantSchema.nullable(),
  // The newest invitation neither accepted nor revoked, open or expired.
  invitation: participantInvitationSchema.nullable(),
});

export type EmployeeParticipantState = z.infer<typeof employeeParticipantStateSchema>;

/** A client's active participants and its invitations neither accepted nor revoked. */
export const clientParticipantsResponseSchema = z.object({
  participants: z.array(clientParticipantSchema),
  invitations: z.array(participantInvitationSchema),
});

export type ClientParticipantsResponse = z.infer<typeof clientParticipantsResponseSchema>;

/** `reason` values on participant errors, so the app can word them itself. */
export const participantErrorReasons = {
  employeeHasParticipant: 'employee_has_participant',
  employeeAlreadyInvited: 'employee_already_invited',
  addressHasParticipant: 'address_has_participant',
  addressInvitedForAnotherPerson: 'address_invited_for_another_person',
  employeeRequired: 'employee_required',
  fullNameRequired: 'full_name_required',
  invalidAddress: 'invalid_address',
  addressNotOfEmployee: 'address_not_of_employee',
  sentRecently: 'sent_recently',
  invitationAccepted: 'invitation_accepted',
  invitationRevoked: 'invitation_revoked',
  // 503: the invitation is saved; a resend is possible ten minutes after it.
  accountUnavailable: 'participant_account_unavailable',
  messageNotSent: 'participant_message_not_sent',
} as const;

export type ParticipantErrorReason =
  (typeof participantErrorReasons)[keyof typeof participantErrorReasons];

/**
 * An address typed for a bulk invitation (ADR 032): what is typed decides the channel, an email
 * by email, anything else as a phone by SMS, normalized as the employee's own fields are. Null
 * when it is neither a valid email nor a valid phone.
 */
export function typedInvitationAddress(
  text: string
): { channel: ParticipantChannel; address: string } | null {
  const trimmed = text.trim();
  if (trimmed.includes('@')) {
    const email = invitedEmailSchema.safeParse(trimmed).data;
    return email ? { channel: 'email', address: email } : null;
  }
  const phone = normalizePhone(trimmed);
  return phone ? { channel: 'sms', address: phone } : null;
}

// The most invitations one request sends; the app sends a longer list in turns.
export const bulkInvitationLimit = 25;

export const bulkEmployeeInvitationRequestSchema = z
  .object({
    invitations: z
      .array(
        z.object({
          employeeId: z.uuid(),
          // An email or a phone as typed; one that is neither is answered on its own row.
          address: z.string().trim().min(1).max(254),
        })
      )
      .min(1)
      .max(bulkInvitationLimit),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.invitations.forEach((invitation, index) => {
      if (seen.has(invitation.employeeId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['invitations', index, 'employeeId'],
          message: 'An employee is invited once per request.',
        });
      }
      seen.add(invitation.employeeId);
    });
  });

export type BulkEmployeeInvitationRequest = z.input<typeof bulkEmployeeInvitationRequestSchema>;

/** Why a bulk invitation left a person out without trying: nothing was sent or saved. */
export const bulkInvitationSkipReasons = {
  formerEmployee: 'former_employee',
  employeeHasParticipant: participantErrorReasons.employeeHasParticipant,
  employeeInvited: 'employee_invited',
} as const;

export const bulkInvitationFailureReasons = {
  employeeNotFound: 'employee_not_found',
  contactNotSaved: 'contact_not_saved',
  invitationFailed: 'invitation_failed',
} as const;

export const bulkInvitationOutcomes = ['invited', 'skipped', 'failed'] as const;
export const bulkInvitationOutcomeSchema = z.enum(bulkInvitationOutcomes);
export type BulkInvitationOutcome = z.infer<typeof bulkInvitationOutcomeSchema>;

export const bulkInvitationResultSchema = z.object({
  employeeId: z.uuid(),
  outcome: bulkInvitationOutcomeSchema,
  // Null when invited; else a skip reason, a failure reason or a participant error reason.
  reason: z.string().nullable(),
  // Set when invited, and when only the message failed: the invitation is saved for a resend.
  invitation: participantInvitationSchema.nullable(),
});

export type BulkInvitationResult = z.infer<typeof bulkInvitationResultSchema>;

/** One result per requested invitation, in the request's order. */
export const bulkEmployeeInvitationResponseSchema = z.object({
  results: z.array(bulkInvitationResultSchema),
});

export type BulkEmployeeInvitationResponse = z.infer<typeof bulkEmployeeInvitationResponseSchema>;

export const portalStandings = ['participant', 'invited'] as const;
export const portalStandingSchema = z.enum(portalStandings);
export type PortalStanding = z.infer<typeof portalStandingSchema>;

export const portalInviteeSchema = z.object({
  employeeId: z.uuid(),
  lastName: z.string(),
  firstName: z.string(),
  position: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  // False for a former employee, who is not invited.
  current: z.boolean(),
  // `invited`: an invitation neither accepted, revoked nor expired. Null: neither.
  portal: portalStandingSchema.nullable(),
});

export type PortalInvitee = z.infer<typeof portalInviteeSchema>;

/** The employees an employee import created or completed, by name. */
export const portalInviteesResponseSchema = z.object({
  items: z.array(portalInviteeSchema),
});

export type PortalInviteesResponse = z.infer<typeof portalInviteesResponseSchema>;

/** One client the signed-in account is a participant of, from `current_participations()`. */
export const portalParticipationSchema = z.object({
  participantId: z.uuid(),
  organizationName: z.string(),
  clientId: z.uuid(),
  clientName: z.string(),
  kind: participantKindSchema,
  employeeId: z.uuid().nullable(),
  fullName: z.string(),
  // Null until the privacy notice was shown on this participation.
  noticeVersion: z.string().nullable(),
  // Null until the participant chose a language on the portal.
  language: portalLanguageSchema.nullable(),
});

export type PortalParticipation = z.infer<typeof portalParticipationSchema>;

/** Never empty: an account without participations is answered 403. */
export const portalMeSchema = z.object({
  participations: z.array(portalParticipationSchema).min(1),
});

export type PortalMe = z.infer<typeof portalMeSchema>;

// Raised when the notice's text changes: every participation is shown it again (ADR 022).
export const currentPrivacyNoticeVersion = '2026-10-17';

export const portalNoticeRequestSchema = z.object({
  version: z.string().trim().min(1).max(40),
});

export type PortalNoticeRequest = z.infer<typeof portalNoticeRequestSchema>;

export const portalLanguageRequestSchema = z.object({ language: portalLanguageSchema });

export type PortalLanguageRequest = z.infer<typeof portalLanguageRequestSchema>;

const portalPersonSchema = z.object({ name: z.string(), jobTitle: z.string() });

export const portalTrainingRecordSchema = z.object({
  id: z.uuid(),
  domain: trainingDomainSchema,
  phase: trainingPhaseSchema,
  heldOn: z.iso.date(),
  durationMinutes: z.int(),
  material: z.string(),
  trainer: portalPersonSchema,
  verifier: portalPersonSchema.nullable(),
  supplementaryReason: supplementaryTrainingReasonSchema.nullable(),
  // A training from paper has its signatures on the paper sheet and no slots in the app.
  source: trainingSourceSchema,
  // The position's name when the record was made.
  occupation: z.string(),
  admission: trainingAdmissionSchema.nullable(),
  slots: z.array(portalSignatureSlotSchema),
});

export type PortalTrainingRecord = z.infer<typeof portalTrainingRecordSchema>;

export const portalTrainingRecordsResponseSchema = z.object({
  // Newest first.
  items: z.array(portalTrainingRecordSchema),
  training: employeeTrainingSchema,
});

export type PortalTrainingRecordsResponse = z.infer<typeof portalTrainingRecordsResponseSchema>;

/**
 * _Datele mele_: what the individual training sheets print about the person, never the CNP or
 * the specialist's notes.
 */
export const portalEmployeeDataSchema = z.object({
  employee: z.object({
    lastName: z.string(),
    firstName: z.string(),
    employeeNumber: z.string().nullable(),
    contractTitle: z.string(),
    position: z.string(),
    workplace: z.string().nullable(),
    hiredAt: z.iso.date(),
    homeAddress: z.string().nullable(),
    birthDate: z.iso.date().nullable(),
    birthPlace: z.string().nullable(),
    bloodGroup: bloodGroupSchema.nullable(),
    rhFactor: rhFactorSchema.nullable(),
    qualification: z.string().nullable(),
    education: z.string().nullable(),
    authorizations: z.string().nullable(),
    commuteRoute: z.string().nullable(),
    commuteMinutes: z.int().nullable(),
  }),
  training: employeeTrainingSchema,
  client: z.object({ name: z.string() }),
  // Who corrects the data: the organization that keeps the client's records.
  provider: z.object({ name: z.string(), phone: z.string().nullable() }),
});

export type PortalEmployeeData = z.infer<typeof portalEmployeeDataSchema>;

export const portalTrainingSheetsSchema = z.object({
  ssm: trainingSheetReadinessSchema,
  psi: trainingSheetReadinessSchema,
});

export type PortalTrainingSheets = z.infer<typeof portalTrainingSheetsSchema>;

export const portalClientEmployeeSchema = z.object({
  id: z.uuid(),
  lastName: z.string(),
  firstName: z.string(),
  position: z.string(),
  workplace: z.string().nullable(),
  training: employeeTrainingSchema,
  tests: employeeTestsSchema,
});

export type PortalClientEmployee = z.infer<typeof portalClientEmployeeSchema>;

export const portalClientEmployeesResponseSchema = z.object({
  items: z.array(portalClientEmployeeSchema),
});

export type PortalClientEmployeesResponse = z.infer<typeof portalClientEmployeesResponseSchema>;

export const portalResponsiblePersonSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  // As the decisions print it.
  jobTitle: z.string(),
  roles: z.array(responsiblePersonRoleSchema).min(1),
  // Null for someone who is not one of the client's employees.
  employeeId: z.uuid().nullable(),
  // Null: every workplace of the client.
  workplace: z.string().nullable(),
});

export type PortalResponsiblePerson = z.infer<typeof portalResponsiblePersonSchema>;

export const portalResponsiblePersonsResponseSchema = z.object({
  items: z.array(portalResponsiblePersonSchema),
});

export type PortalResponsiblePersonsResponse = z.infer<
  typeof portalResponsiblePersonsResponseSchema
>;
