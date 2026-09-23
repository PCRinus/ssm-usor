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
}
