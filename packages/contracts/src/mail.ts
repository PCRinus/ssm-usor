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
}
