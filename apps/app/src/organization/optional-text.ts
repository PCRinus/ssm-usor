import { z } from 'zod';

// Form values are strings so inputs stay controlled; the API request is derived on submit.
// Everything is optional in these forms: generating a document or a contract is what asks.
export const optionalText = (min: number, max: number, tooShort: string, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .refine((value) => value.length === 0 || value.length >= min, tooShort);

export const textOrNull = (value: string) => (value ? value : null);
