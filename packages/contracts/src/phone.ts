// The `min` metadata, not `max`: `max` adds number types (mobile, fixed line), which a contact
// phone does not need, at about twice the size in every bundle that reads a phone.
import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { z } from 'zod';

export type PhoneCountry = CountryCode;

// The library also reads a number out of free text ("tel 0721…", "0721/000/000", an extension);
// a phone field takes only a number.
const phoneCharacters = /^\+?[0-9\s.()-]+$/;

/**
 * E.164 with Romania as the default country (ADR 022): `0721 000 000` and `0040 721 000 000`
 * become `+40721000000`; a number written with `+` or `00` keeps its own country. Landlines are
 * valid. Null when the input is not a valid number of its country.
 */
export function normalizePhone(input: string, defaultCountry: PhoneCountry = 'RO'): string | null {
  const text = input.trim();
  if (!phoneCharacters.test(text)) return null;
  const phone = parsePhoneNumberFromString(text, { defaultCountry });
  if (!phone?.isValid()) return null;
  return phone.number;
}

export function countryOf(e164: string): PhoneCountry | null {
  const phone = parsePhoneNumberFromString(e164);
  return phone?.isValid() ? (phone.country ?? null) : null;
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
