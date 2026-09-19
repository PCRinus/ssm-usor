import { z } from 'zod';

import { organizationRoleSchema } from './organizations';
import { currentTermsVersion, fullNameSchema, newPasswordSchema } from './profile';

const invitedEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const createInvitationRequestSchema = z.object({
  email: invitedEmailSchema,
  role: organizationRoleSchema.default('specialist'),
});

export type CreateInvitationRequest = z.input<typeof createInvitationRequestSchema>;

/** What an owner sees of an invitation that was neither accepted nor revoked. */
export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: organizationRoleSchema,
  status: z.enum(['open', 'expired']),
  // Null when no email has been handed to the provider yet.
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
});

export type Invitation = z.infer<typeof invitationSchema>;

export const invitationListResponseSchema = z.object({ items: z.array(invitationSchema) });

export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

// Lenient on purpose: a mangled token is an unknown invitation, not a malformed request.
const invitationTokenSchema = z.string().min(1).max(200);

export const invitationLookupRequestSchema = z.object({ token: invitationTokenSchema });

export const invitationStatusSchema = z.enum(['open', 'expired', 'revoked', 'accepted']);

export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const invitationLookupResponseSchema = z.object({
  organizationName: z.string(),
  email: z.email(),
  role: organizationRoleSchema,
  status: invitationStatusSchema,
  inviterName: z.string().nullable(),
  // Whether the invited address already has an account, which must then sign in to accept.
  accountExists: z.boolean(),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type InvitationLookupResponse = z.infer<typeof invitationLookupResponseSchema>;

/** For a person without an account: creates it and joins the organization. */
export const acceptInvitationRequestSchema = z.object({
  token: invitationTokenSchema,
  fullName: fullNameSchema,
  password: newPasswordSchema,
  termsVersion: z.literal(currentTermsVersion),
});

export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

/** For a signed-in account without a membership. The name is needed only without a profile. */
export const joinWithInvitationRequestSchema = z.object({
  token: invitationTokenSchema,
  fullName: fullNameSchema.optional(),
  termsVersion: z.literal(currentTermsVersion),
});

export type JoinWithInvitationRequest = z.infer<typeof joinWithInvitationRequestSchema>;

export const invitationAcceptedResponseSchema = z.object({
  organizationId: z.uuid(),
  // The address to sign in with.
  email: z.email(),
});

export type InvitationAcceptedResponse = z.infer<typeof invitationAcceptedResponseSchema>;

/** `reason` values on invitation errors, so the SPA can word them itself. */
export const invitationErrorReasons = [
  'already_member',
  'too_many_open_invitations',
  'sent_recently',
  'invitation_accepted',
  'invitation_revoked',
  'invitation_expired',
  'email_mismatch',
  'already_in_organization',
  'account_exists',
  'full_name_required',
] as const;

export type InvitationErrorReason = (typeof invitationErrorReasons)[number];
