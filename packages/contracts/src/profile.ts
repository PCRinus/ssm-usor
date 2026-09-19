import { z } from 'zod';

export const currentTermsVersion = '2026-09';

export const fullNameSchema = z.string().trim().min(2).max(120);

/** A specialist's qualification as documents print it, for example "Evaluator autorizat". */
export const professionalTitleSchema = z.string().trim().min(2).max(160);

export const profileSchema = z.object({
  fullName: z.string(),
  professionalTitle: z.string().nullable(),
  termsVersion: z.string().nullable(),
  termsAcceptedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type Profile = z.infer<typeof profileSchema>;

// Leaving the title out keeps it; null clears it.
export const updateProfileRequestSchema = z.object({
  fullName: fullNameSchema,
  professionalTitle: professionalTitleSchema.nullable().optional(),
});

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

// Mirrors the Supabase password policy: at least 8 characters with a lowercase letter, an
// uppercase letter, and a digit. 72 bytes is where bcrypt stops reading.
export const newPasswordSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/[a-z]/, 'Needs a lowercase letter.')
  .regex(/[A-Z]/, 'Needs an uppercase letter.')
  .regex(/[0-9]/, 'Needs a digit.');
