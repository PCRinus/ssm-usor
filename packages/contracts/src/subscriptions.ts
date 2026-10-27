import { z } from 'zod';

/** How long an organization stays read-only before it is deleted (ADR 029). */
export const readOnlyDays = 30;

export const subscriptionPlanSchema = z.enum(['start', 'profesional', 'enterprise']);
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

export const subscriptionStatusSchema = z.enum(['trialing', 'active', 'past_due', 'canceled']);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const accessLevelSchema = z.enum(['full', 'read_only']);
export type AccessLevel = z.infer<typeof accessLevelSchema>;

export const subscriptionSummarySchema = z.object({
  // During a trial without a chosen plan, the trial's own features: Profesional's.
  plan: subscriptionPlanSchema,
  // True once the owner picked a plan, also while its trial runs on; the badge then names the
  // plan instead of the trial (ADR 029).
  planChosen: z.boolean(),
  status: subscriptionStatusSchema,
  trialEndsAt: z.iso.datetime({ offset: true }).nullable(),
  // When full access ends; null while nothing is due to end.
  accessUntil: z.iso.datetime({ offset: true }).nullable(),
  access: accessLevelSchema,
  // When a read-only organization is deleted; null while it has full access.
  deletesAt: z.iso.datetime({ offset: true }).nullable(),
});

export type SubscriptionSummary = z.infer<typeof subscriptionSummarySchema>;

// The `reason` of the 403 every change answers while the organization is read-only.
export const readOnlyReason = 'read_only';
