import { normalizePhone } from '@ssm-usor/contracts';
import { z } from 'zod';

export const invalidPhoneMessage = 'Numărul de telefon nu este valid pentru țara aleasă.';

export const optionalPhoneField = z
  .string()
  .trim()
  .refine((value) => value === '' || normalizePhone(value) !== null, invalidPhoneMessage);
