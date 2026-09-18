import { z } from 'zod';

import { fullNameField } from '../account/profile-schema';
import { newPasswordField } from '../auth/password-schema';

export const createAccountSchema = z.object({
  fullName: fullNameField,
  password: newPasswordField,
});

export type CreateAccountValues = z.infer<typeof createAccountSchema>;

export const joinSchema = z.object({ fullName: fullNameField });

export type JoinValues = z.infer<typeof joinSchema>;
