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
}
