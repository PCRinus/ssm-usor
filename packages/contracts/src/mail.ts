import { z } from 'zod';

export const waitlistConfirmationEmailSchema = z.object({
  to: z.email(),
  confirmUrl: z.url(),
});

export type WaitlistConfirmationEmail = z.infer<typeof waitlistConfirmationEmailSchema>;

export const organizationInvitationEmailSchema = z.object({
  to: z.email(),
  /** The accept page in the SPA, token included. */
  acceptUrl: z.url(),
  organizationName: z.string().trim().min(2).max(160),
  /** Null when the person who invited has no profile name. */
  inviterName: z.string().trim().min(2).max(120).nullable(),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type OrganizationInvitationEmail = z.infer<typeof organizationInvitationEmailSchema>;

export const passwordResetEmailSchema = z.object({
  to: z.email(),
  /** The reset page in the SPA, carrying Supabase's recovery token hash. */
  resetUrl: z.url(),
  /** How long the link works; Supabase Auth's OTP expiry, in minutes. */
  expiresInMinutes: z
    .int()
    .min(1)
    .max(24 * 60),
});

export type PasswordResetEmail = z.infer<typeof passwordResetEmailSchema>;

/** Tells the owner of an account that its password changed, in case it was not them. */
export const passwordChangedEmailSchema = z.object({
  to: z.email(),
  /** Where to ask for a reset link in the SPA, for someone who did not make the change. */
  forgotPasswordUrl: z.url(),
});

export type PasswordChangedEmail = z.infer<typeof passwordChangedEmailSchema>;

export const signupConfirmationEmailSchema = z.object({
  to: z.email(),
  /** The confirmation page in the SPA, carrying Supabase's signup token hash. */
  confirmUrl: z.url(),
  /** How long the link works; Supabase Auth's OTP expiry, in minutes. */
  expiresInMinutes: z
    .int()
    .min(1)
    .max(24 * 60),
});

export type SignupConfirmationEmail = z.infer<typeof signupConfirmationEmailSchema>;

/**
 * A service contract sent by an owner to the company's contact (ADR 007). Unlike the other
 * emails it goes to someone who has no account, in the owner's name: replies go to the owner,
 * who also gets a copy.
 */
export const serviceContractEmailSchema = z.object({
  to: z.email(),
  /** The owner who sends it: where replies go, and who is copied. */
  senderEmail: z.email(),
  /** Null when the owner has no profile name. */
  senderName: z.string().trim().min(2).max(120).nullable(),
  organizationName: z.string().trim().min(2).max(200),
  clientName: z.string().trim().min(2).max(200),
  contractNumber: z.int().min(1),
  contractDate: z.iso.date(),
  /** A few words of the owner's own, above the standard text. */
  note: z.string().trim().max(1000).nullable(),
  /** The public page where the signed copy comes back, token included. */
  returnUrl: z.url(),
  /** The issued PDF, in Base64. Resend takes 40 MB an email; a contract is well under one. */
  attachment: z.object({
    fileName: z.string().min(5).max(200).endsWith('.pdf'),
    contentBase64: z.string().min(1).max(14_000_000),
  }),
});

export type ServiceContractEmail = z.infer<typeof serviceContractEmailSchema>;

/** Tells the owner who sent a contract that its signed copy came back through the return link. */
export const signedCopyReceivedEmailSchema = z.object({
  to: z.email(),
  clientName: z.string().trim().min(2).max(200),
  contractNumber: z.int().min(1),
  contractDate: z.iso.date(),
  /** The lead's page in the SPA, where the copy is confirmed. */
  leadUrl: z.url(),
});

export type SignedCopyReceivedEmail = z.infer<typeof signedCopyReceivedEmailSchema>;

/**
 * Tells a participant who invited them to the portal and where it is (ADR 022). It carries no
 * token: the person signs in with a code sent to the address this email came to.
 */
export const participantInvitationEmailSchema = z.object({
  to: z.email(),
  clientName: z.string().trim().min(2).max(200),
  organizationName: z.string().trim().min(2).max(200),
  portalUrl: z.url(),
});

export type ParticipantInvitationEmail = z.infer<typeof participantInvitationEmailSchema>;

/** The portal's one-time sign-in code, sent through Supabase Auth's Send Email hook. */
export const signInCodeEmailSchema = z.object({
  to: z.email(),
  code: z.string().regex(/^\d{6,10}$/),
  /** How long the code works; Supabase Auth's email OTP expiry, in minutes. */
  expiresInMinutes: z
    .int()
    .min(1)
    .max(24 * 60),
});

export type SignInCodeEmail = z.infer<typeof signInCodeEmailSchema>;

/** The code a signer types to sign (ADR 023): the API's own, not Supabase Auth's. */
export const signingCodeEmailSchema = z.object({
  to: z.email(),
  code: z.string().regex(/^\d{6}$/),
  expiresInMinutes: z.int().min(1).max(60),
});

export type SigningCodeEmail = z.infer<typeof signingCodeEmailSchema>;

/**
 * Tells a signer that trainings wait for their signature (ADR 023): a count, never the list, and
 * the place they sign in, the portal for a participant or the app for a member.
 */
export const signatureRequestEmailSchema = z.object({
  to: z.email(),
  count: z.int().min(1).max(10_000),
  organizationName: z.string().trim().min(2).max(200),
  signUrl: z.url(),
  place: z.enum(['portal', 'app']),
});

export type SignatureRequestEmail = z.infer<typeof signatureRequestEmailSchema>;

export const smsUsageNoticeKinds = ['sms_80', 'sms_100', 'sms_cap'] as const;
export type SmsUsageNoticeKind = (typeof smsUsageNoticeKinds)[number];

/**
 * Tells an organization's owner that the month's signing codes by SMS reached 80 %, all those
 * included, or the safety cap (ADR 029). Once per kind and month.
 */
export const smsUsageNoticeEmailSchema = z.object({
  to: z.email(),
  kind: z.enum(smsUsageNoticeKinds),
  organizationName: z.string().trim().min(2).max(200),
  /** "Start" or "Profesional"; null for a tester's trial, whose codes are no plan's. */
  planName: z.string().trim().min(2).max(40).nullable(),
  /**
   * True once the first payment went through: codes past the included ones go on and are billed,
   * up to the cap. False for a hard stop at the included ones.
   */
  billed: z.boolean(),
  used: z.int().min(0),
  /** The plan's codes plus any granted by hand. */
  included: z.int().min(1),
  /** Null for a hard stop. */
  cap: z.int().min(1).nullable(),
  overageCents: z.int().min(1),
  periodStart: z.iso.datetime({ offset: true }),
  /** The first moment of the next month, when the count starts again. */
  periodEnd: z.iso.datetime({ offset: true }),
  /** The Abonament tab in the SPA. */
  subscriptionUrl: z.url(),
});

export type SmsUsageNoticeEmail = z.infer<typeof smsUsageNoticeEmailSchema>;

/** `id` is the provider's message id, or null when the email was only logged. */
export type MailReceipt = { id: string | null };

/**
 * The RPC surface of the mail Worker. `apps/mail` implements it and callers type
 * their service binding with it, so neither application imports the other.
 * Every method rejects when the email could not be handed to the provider.
 */
export interface MailService {
  sendWaitlistConfirmation(input: WaitlistConfirmationEmail): Promise<MailReceipt>;
  sendOrganizationInvitation(input: OrganizationInvitationEmail): Promise<MailReceipt>;
  sendPasswordReset(input: PasswordResetEmail): Promise<MailReceipt>;
  sendPasswordChanged(input: PasswordChangedEmail): Promise<MailReceipt>;
  sendSignupConfirmation(input: SignupConfirmationEmail): Promise<MailReceipt>;
  sendServiceContract(input: ServiceContractEmail): Promise<MailReceipt>;
  sendSignedCopyReceived(input: SignedCopyReceivedEmail): Promise<MailReceipt>;
  sendParticipantInvitation(input: ParticipantInvitationEmail): Promise<MailReceipt>;
  sendSignInCode(input: SignInCodeEmail): Promise<MailReceipt>;
  sendSigningCode(input: SigningCodeEmail): Promise<MailReceipt>;
  sendSignatureRequest(input: SignatureRequestEmail): Promise<MailReceipt>;
  sendSmsUsageNotice(input: SmsUsageNoticeEmail): Promise<MailReceipt>;
}
