import { z } from 'zod';

import { defaultPageSize, listSearchSchema, maxPageSize, pageSchema } from './list';
import { organizationRoleSchema } from './organizations';
import { subscriptionPlanSchema, subscriptionStatusSchema } from './subscriptions';

const timestamp = z.iso.datetime({ offset: true });

// The list's offset is an int4 in the database, which (page - 1) * pageSize past this would
// overflow.
export const maxAdminMemberPage = 100_000;

const adminPageQuery = {
  page: z.coerce.number().int().min(1).max(maxAdminMemberPage).default(1),
  pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
};

export const adminMemberListQuerySchema = z.object({
  // Matches the email, the name or the organization's name, ignoring case and diacritics.
  search: listSearchSchema.optional(),
  ...adminPageQuery,
});

export type AdminMemberListQuery = z.infer<typeof adminMemberListQuerySchema>;

const organizationRefSchema = z.object({ id: z.uuid(), name: z.string() });

export const adminMemberListItemSchema = z.object({
  userId: z.uuid(),
  email: z.string().nullable(),
  // Null until the member has named themselves.
  fullName: z.string().nullable(),
  organization: organizationRefSchema,
  role: organizationRoleSchema,
  // Null for an organization without a subscription, which has full access indefinitely.
  subscription: z
    .object({ plan: subscriptionPlanSchema, status: subscriptionStatusSchema })
    .nullable(),
  lastSignInAt: timestamp.nullable(),
});

export type AdminMemberListItem = z.infer<typeof adminMemberListItemSchema>;

export const adminMemberListSchema = pageSchema(adminMemberListItemSchema);

export type AdminMemberList = z.infer<typeof adminMemberListSchema>;

export const adminImpersonationSchema = z.object({
  id: z.uuid(),
  target: z.object({
    userId: z.uuid(),
    email: z.string().nullable(),
    fullName: z.string().nullable(),
    // Null once the member has left their organization.
    organization: organizationRefSchema.nullable(),
    role: organizationRoleSchema.nullable(),
  }),
  reason: z.string(),
  startedAt: timestamp,
  expiresAt: timestamp,
  endedAt: timestamp.nullable(),
});

export type AdminImpersonation = z.infer<typeof adminImpersonationSchema>;

// The admin's impersonation that applies now: not ended and not expired.
export const adminActiveImpersonationSchema = z.object({
  impersonation: adminImpersonationSchema.nullable(),
});

export type AdminActiveImpersonation = z.infer<typeof adminActiveImpersonationSchema>;

export const maxImpersonationReasonLength = 500;

export const adminImpersonationStartRequestSchema = z.object({
  targetUserId: z.uuid(),
  reason: z.string().trim().min(1).max(maxImpersonationReasonLength),
});

export type AdminImpersonationStartRequest = z.infer<typeof adminImpersonationStartRequestSchema>;

export const adminImpersonationListQuerySchema = z.object(adminPageQuery);

export type AdminImpersonationListQuery = z.infer<typeof adminImpersonationListQuerySchema>;

export const adminImpersonationListSchema = pageSchema(adminImpersonationSchema);

export type AdminImpersonationList = z.infer<typeof adminImpersonationListSchema>;

// The `reason` of a refused start, which the admin app words itself.
export const adminImpersonationErrorReasons = {
  // 422: the account does not exist or belongs to no organization, such as a portal participant.
  targetNotMember: 'target_not_member',
  // 422: the admin chose his own account.
  targetIsSelf: 'target_is_self',
} as const;

export type AdminImpersonationErrorReason =
  (typeof adminImpersonationErrorReasons)[keyof typeof adminImpersonationErrorReasons];
