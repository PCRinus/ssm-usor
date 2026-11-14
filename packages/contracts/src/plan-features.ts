import { z } from 'zod';

// What a plan includes beyond its limits (ADR 029). The database decides each one; the app only
// reflects it. A trial has Profesional's, a plan chosen during it included.
export const planFeaturesSchema = z.object({
  // Offers and their contracts. Without them the existing offers are read, archived, restored
  // and turned into clients, and nothing else about them changes.
  offers: z.boolean(),
});

export type PlanFeatures = z.infer<typeof planFeaturesSchema>;

// The `reason` of the 403 every change to an offer answers on a plan without offers.
export const offersNotInPlanReason = 'offers_not_in_plan';
