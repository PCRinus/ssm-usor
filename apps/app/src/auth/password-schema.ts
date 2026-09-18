import { z } from 'zod';

// Mirrors `newPasswordSchema` in the contracts, which mirrors the Supabase password policy
// in supabase/config.toml. Used wherever a person chooses a password.
export const newPasswordField = z
  .string()
  .min(8, 'Parola trebuie să aibă cel puțin 8 caractere.')
  .max(72, 'Parola poate avea cel mult 72 de caractere.')
  .regex(/[a-z]/, 'Parola trebuie să conțină o literă mică.')
  .regex(/[A-Z]/, 'Parola trebuie să conțină o literă mare.')
  .regex(/[0-9]/, 'Parola trebuie să conțină o cifră.');

export const newPasswordHint = 'Cel puțin 8 caractere, cu o literă mică, o literă mare și o cifră.';

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Introdu adresa de email.')
    .pipe(z.email('Introdu o adresă de email validă.')),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ password: newPasswordField });

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Introdu parola curentă.'),
  newPassword: newPasswordField,
});

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const registerSchema = z.object({
  email: forgotPasswordSchema.shape.email,
  password: newPasswordField,
});

export type RegisterValues = z.infer<typeof registerSchema>;
