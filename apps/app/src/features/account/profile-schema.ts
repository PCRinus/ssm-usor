import { z } from 'zod';

// Same bounds as `fullNameSchema` in the contracts, worded for the person typing.
export const fullNameField = z
  .string()
  .trim()
  .min(2, 'Completează numele și prenumele.')
  .max(120, 'Numele poate avea cel mult 120 de caractere.');

// Optional. Same bounds as `professionalTitleSchema` in the contracts.
export const professionalTitleField = z
  .string()
  .trim()
  .max(160, 'Titlul poate avea cel mult 160 de caractere.')
  .refine((value) => value.length === 0 || value.length >= 2, 'Titlul are cel puțin 2 caractere.');

export const profileFormSchema = z.object({
  fullName: fullNameField,
  professionalTitle: professionalTitleField,
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
