import { z } from 'zod';

/** The version of the terms a person sees when they create their account. */
export const currentTermsVersion = '2026-09';

export const fullNameSchema = z.string().trim().min(2).max(120);

export const profileSchema = z.object({
  fullName: z.string(),
  termsVersion: z.string().nullable(),
  termsAcceptedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type Profile = z.infer<typeof profileSchema>;

export const updateProfileRequestSchema = z.object({ fullName: fullNameSchema });

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
