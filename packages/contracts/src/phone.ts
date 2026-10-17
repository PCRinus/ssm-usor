import { z } from 'zod';

const e164 = /^\+[1-9][0-9]{7,14}$/;
const romanian = /^\+40[0-9]{9}$/;

/**
 * E.164 with Romania as the default country (ADR 022): `0721 000 000` and `0040 721 000 000`
 * become `+40721000000`; a number written with `+` or `00` keeps its own country. Null when the
 * input cannot be read as a number.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s.()-]/g, '');
  let phone: string;
  if (compact.startsWith('+')) phone = compact;
  else if (compact.startsWith('00')) phone = `+${compact.slice(2)}`;
  else if (compact.startsWith('0')) phone = `+40${compact.slice(1)}`;
  else return null;
  // "+40 (0) 721 …": the trunk zero people keep after the country code.
  if (/^\+400[0-9]{9}$/.test(phone)) phone = `+40${phone.slice(4)}`;
  if (!e164.test(phone)) return null;
  if (phone.startsWith('+40') && !romanian.test(phone)) return null;
  return phone;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((input, ctx) => {
    const phone = normalizePhone(input);
    if (phone === null) {
      ctx.addIssue({ code: 'custom', message: 'Invalid phone number.' });
      return z.NEVER;
    }
    return phone;
  });
