// Romanian personal numeric code (CNP) helpers.
// Format: S AA LL ZZ JJ NNN C — sex/century, year, month, day, county, sequence, control.
// The stored value is the thirteen digits; the code is optional on an employee.

const controlKey = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];

export function cnpControlDigit(body: string) {
  const digits = body.split('').map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * controlKey[index]!, 0);
  const remainder = sum % 11;
  return remainder === 10 ? 1 : remainder;
}

// The century is encoded in the first digit for Romanian citizens only; codes issued to
// foreign residents (7, 8) and foreign nationals (9) do not determine it.
const centuryBySexDigit: Record<string, number | undefined> = {
  '1': 1900,
  '2': 1900,
  '3': 1800,
  '4': 1800,
  '5': 2000,
  '6': 2000,
};

function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Thirteen digits, a leading sex/century digit, a plausible calendar date, and a
// valid control digit. The county field is not validated: the issuing list changed
// over time and mistakes there do not affect any workflow.
export function isValidCnp(digits: string) {
  if (!/^[1-9][0-9]{12}$/.test(digits)) return false;
  const month = Number(digits.slice(3, 5));
  const day = Number(digits.slice(5, 7));
  if (month < 1 || month > 12 || day < 1) return false;
  const century = centuryBySexDigit[digits[0]!];
  // Without a known century, accept the day if any leap year would allow it.
  const year = century === undefined ? 2000 : century + Number(digits.slice(1, 3));
  if (day > daysInMonth(year, month)) return false;
  return cnpControlDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}

// Accepts user input with spaces or dashes; returns the digits or null when malformed.
export function normalizeCnp(input: string) {
  const compact = input.replace(/[\s.-]/g, '');
  return /^[0-9]{13}$/.test(compact) ? compact : null;
}

export function isValidCnpInput(input: string) {
  const normalized = normalizeCnp(input);
  return normalized !== null && isValidCnp(normalized);
}

export type CnpSex = 'male' | 'female';

// Data encoded in a valid CNP. The birth date is null when the century is not encoded.
export function decodeCnp(digits: string): { birthDate: string | null; sex: CnpSex | null } {
  const sexDigit = digits[0]!;
  const sex: CnpSex | null =
    sexDigit === '9' ? null : Number(sexDigit) % 2 === 1 ? 'male' : 'female';
  const century = centuryBySexDigit[sexDigit];
  if (century === undefined) return { birthDate: null, sex };
  return {
    birthDate: isoDate(
      century + Number(digits.slice(1, 3)),
      Number(digits.slice(3, 5)),
      Number(digits.slice(5, 7))
    ),
    sex,
  };
}

// Masked for display: the last four digits only.
export function maskCnp(cnp: string) {
  return `•••••••••${cnp.slice(-4)}`;
}
