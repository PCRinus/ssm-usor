import { z } from 'zod';

import { fullNameField } from '../account/profile-schema';

// Mirrors `newPasswordSchema` in the contracts, which mirrors the Supabase policy.
const newPasswordField = z
  .string()
  .min(8, 'Parola trebuie să aibă cel puțin 8 caractere.')
  .max(72, 'Parola poate avea cel mult 72 de caractere.')
  .regex(/[a-z]/, 'Parola trebuie să conțină o literă mică.')
  .regex(/[A-Z]/, 'Parola trebuie să conțină o literă mare.')
  .regex(/[0-9]/, 'Parola trebuie să conțină o cifră.');

export const createAccountSchema = z.object({
  fullName: fullNameField,
  password: newPasswordField,
});

export type CreateAccountValues = z.infer<typeof createAccountSchema>;

export const joinSchema = z.object({ fullName: fullNameField });

export type JoinValues = z.infer<typeof joinSchema>;
