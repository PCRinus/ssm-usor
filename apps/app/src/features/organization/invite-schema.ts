import { organizationRoleSchema } from '@ssm-usor/contracts';
import { z } from 'zod';

export const inviteFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Completează adresa de email.')
    .pipe(z.email('Adresa de email nu este validă.').max(254, 'Adresa este prea lungă.')),
  role: organizationRoleSchema,
});

export type InviteFormValues = z.infer<typeof inviteFormSchema>;
