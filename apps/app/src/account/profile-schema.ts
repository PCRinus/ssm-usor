import { z } from 'zod';

// Same bounds as `fullNameSchema` in the contracts, worded for the person typing.
export const fullNameField = z
  .string()
  .trim()
  .min(2, 'Completează numele și prenumele.')
  .max(120, 'Numele poate avea cel mult 120 de caractere.');

export const profileFormSchema = z.object({ fullName: fullNameField });

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
