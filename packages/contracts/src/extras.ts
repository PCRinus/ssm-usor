import { z } from 'zod';

import { creditsExtra, smsOverage } from './billing';

export const extraKindSchema = z.enum(['sms', 'credits']);
export type ExtraKind = z.infer<typeof extraKindSchema>;

/** Whole euro a month, without VAT, for each kind on its own (ADR 029). */
export const extraCeilingEuros = { min: 1, max: 500 } as const;

// A function, not a constant: billing.ts and this file import each other.
export const extraUnitCents = (kind: ExtraKind) =>
  kind === 'sms' ? smsOverage.price.unitAmount : creditsExtra.price.unitAmount;

/**
 * How many units a ceiling buys: whole codes, or whole blocks of credits, never past it. 10 € is
 * 100 codes, or 6 blocks (600 credits, 9 €).
 */
export const extraUnitsWithin = (kind: ExtraKind, ceilingCents: number) =>
  Math.floor(ceilingCents / extraUnitCents(kind));

export const extraCreditsWithin = (ceilingCents: number) =>
  extraUnitsWithin('credits', ceilingCents) * creditsExtra.blockCredits;

export const extrasUnavailableSchema = z.enum([
  'no_subscription',
  'enterprise',
  // A trial, a tester's included: nothing is paid yet, so nothing past the plan can be billed.
  'trial',
  'past_due',
  'canceled',
]);
export type ExtrasUnavailable = z.infer<typeof extrasUnavailableSchema>;

const cents = z.int().min(0);

export const billingExtraSchema = z.object({
  // Turned on by the owner. While `unavailable` is set it applies only once it clears.
  enabled: z.boolean(),
  // The rest is the owner's alone: null for the other members.
  ceilingCents: cents.nullable(),
  // What the ceiling buys this month: codes, or credits in whole blocks.
  limit: z.int().min(0).nullable(),
  // Codes sent past the allowance this month, or credits bought in blocks.
  used: z.int().min(0).nullable(),
  // Without VAT, on the next invoice.
  spentCents: cents.nullable(),
});
export type BillingExtra = z.infer<typeof billingExtraSchema>;

export const billingExtrasSchema = z.object({
  // Null when the owner can turn extras on.
  unavailable: extrasUnavailableSchema.nullable(),
  sms: billingExtraSchema,
  credits: billingExtraSchema,
});
export type BillingExtras = z.infer<typeof billingExtrasSchema>;

export const setExtraRequestSchema = z.object({
  // Null turns the kind off; what was already used stays on the next invoice.
  ceilingEuros: z.int().min(extraCeilingEuros.min).max(extraCeilingEuros.max).nullable(),
});
export type SetExtraRequest = z.infer<typeof setExtraRequestSchema>;
