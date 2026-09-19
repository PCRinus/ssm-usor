// The stored value is digits only; VAT registration is a separate flag.

const controlKey = [7, 5, 3, 2, 1, 7, 5, 3, 2];

export function cuiControlDigit(body: string) {
  const digits = body.padStart(9, '0').split('').map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * controlKey[index]!, 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidCui(digits: string) {
  if (!/^[1-9][0-9]{1,9}$/.test(digits)) return false;
  return cuiControlDigit(digits.slice(0, -1)) === Number(digits.at(-1));
}

export function normalizeCui(input: string) {
  const compact = input.replace(/[\s.-]/g, '').toUpperCase();
  const match = compact.match(/^(RO)?([0-9]+)$/);
  if (!match) return null;
  return { cui: match[2]!, vatPrefix: match[1] === 'RO' };
}

export function isValidCuiInput(input: string) {
  const normalized = normalizeCui(input);
  return normalized !== null && isValidCui(normalized.cui);
}

export function formatCui(cui: string, vatPayer: boolean) {
  return vatPayer ? `RO${cui}` : cui;
}
