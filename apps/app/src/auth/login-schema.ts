import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Introdu adresa de email.')
    .pipe(z.email('Introdu o adresă de email validă.')),
  // Login accepts an existing password unchanged; strength rules belong to account creation.
  password: z.string().min(1, 'Introdu parola.'),
});

export type LoginValues = z.infer<typeof loginSchema>;
