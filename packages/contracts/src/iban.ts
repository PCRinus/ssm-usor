// An IBAN as people type and print it, in groups of four, or without spaces.
const shape = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

export function normalizeIban(input: string) {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** ISO 13616: the country and check digits move to the end, letters count from 10, mod 97 is 1. */
export function isValidIban(input: string) {
  const iban = normalizeIban(input);
  if (!shape.test(iban)) return false;
  let remainder = 0;
  for (const character of iban.slice(4) + iban.slice(0, 4)) {
    const value = character >= 'A' ? character.charCodeAt(0) - 55 : Number(character);
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}

/** "RO49 AAAA 1B31 0075 9384 0000", as a contract prints it. */
export function formatIban(iban: string) {
  return normalizeIban(iban).replace(/(.{4})(?=.)/g, '$1 ');
}
