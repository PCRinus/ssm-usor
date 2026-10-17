import { normalizePhone } from '@ssm-usor/contracts';
import { z } from 'zod';

import { invalidPhoneMessage } from '@/lib/phone';

const emailSchema = z.email().max(254);

export const administratorInviteFormSchema = z
  .object({
    isEmployee: z.boolean(),
    employeeId: z.string(),
    fullName: z.string().trim(),
    channel: z.enum(['', 'email', 'sms']),
    email: z.string().trim().toLowerCase(),
    phone: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.isEmployee && !values.employeeId) {
      ctx.addIssue({ code: 'custom', path: ['employeeId'], message: 'Alege angajatul.' });
    }
    if (!values.isEmployee && values.fullName.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['fullName'],
        message: 'Completează numele și prenumele.',
      });
    }
    if (values.channel === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['channel'],
        message: 'Alege cum trimitem invitația.',
      });
    }
    if (values.channel === 'email' && !emailSchema.safeParse(values.email).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: values.email ? 'Adresa de email nu este validă.' : 'Completează adresa de email.',
      });
    }
    if (values.channel === 'sms' && !normalizePhone(values.phone)) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: values.phone ? invalidPhoneMessage : 'Completează numărul de telefon.',
      });
    }
  });

export type AdministratorInviteFormValues = z.input<typeof administratorInviteFormSchema>;
