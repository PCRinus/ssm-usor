import { z } from 'zod';

import { currentTermsVersion, fullNameSchema } from './profile';

/** Mirrors the `organization_role` enum in the database. */
export const organizationRoleSchema = z.enum(['owner', 'specialist']);

export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const membershipSchema = z.object({
  organization: z.object({ id: z.uuid(), name: z.string() }),
  role: organizationRoleSchema,
});

export type OrganizationMembership = z.infer<typeof membershipSchema>;

export const organizationMemberSchema = z.object({
  userId: z.uuid(),
  email: z.email().nullable(),
  // Null for an account from before profiles existed that has not named itself yet.
  fullName: z.string().nullable(),
  role: organizationRoleSchema,
  joinedAt: z.iso.datetime({ offset: true }),
});

export type OrganizationMember = z.infer<typeof organizationMemberSchema>;

// Organizations are small teams, so the list is not paginated.
export const organizationMemberListResponseSchema = z.object({
  items: z.array(organizationMemberSchema),
});

export type OrganizationMemberListResponse = z.infer<typeof organizationMemberListResponseSchema>;

export const changeMemberRoleRequestSchema = z.object({ role: organizationRoleSchema });

export type ChangeMemberRoleRequest = z.infer<typeof changeMemberRoleRequestSchema>;

/** `reason` values on member management errors, so the SPA can word them itself. */
export const memberErrorReasons = ['own_membership'] as const;

export type MemberErrorReason = (typeof memberErrorReasons)[number];

export const organizationNameSchema = z.string().trim().min(2).max(160);

/** Onboarding: an account without a membership creates its organization and owns it. */
export const createOrganizationRequestSchema = z.object({
  organizationName: organizationNameSchema,
  fullName: fullNameSchema,
  // Accepted on the organization's behalf, with a checkbox, when it is created.
  termsVersion: z.literal(currentTermsVersion),
});

export type CreateOrganizationRequest = z.infer<typeof createOrganizationRequestSchema>;

/** `reason` values on onboarding errors, so the SPA can word them itself. */
export const onboardingErrorReasons = ['already_in_organization', 'email_not_confirmed'] as const;

export type OnboardingErrorReason = (typeof onboardingErrorReasons)[number];

/** An open invitation sent to the signed-in account's address. No id and no token. */
export const pendingInvitationSchema = z.object({
  organizationName: z.string(),
  inviterName: z.string().nullable(),
  role: organizationRoleSchema,
  expiresAt: z.iso.datetime({ offset: true }),
});

export type PendingInvitation = z.infer<typeof pendingInvitationSchema>;

export const pendingInvitationListResponseSchema = z.object({
  items: z.array(pendingInvitationSchema),
});

export type PendingInvitationListResponse = z.infer<typeof pendingInvitationListResponseSchema>;
