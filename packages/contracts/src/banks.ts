import { normalizeIban } from './iban';

// Keyed by the four letters after a Romanian IBAN's check digits, the bank's BIC prefix
// (BNR Regulation 3/2004), as of 2026-11. OTP Bank merged into Banca Transilvania and Alpha Bank
// into UniCredit in 2025, so their codes name the bank that holds the account now.
export const romanianBankNames: Readonly<Record<string, string>> = {
  BTRL: 'Banca Transilvania',
  OTPV: 'Banca Transilvania',
  RNCB: 'Banca Comercială Română',
  BRDE: 'BRD - Groupe Société Générale',
  RZBR: 'Raiffeisen Bank',
  INGB: 'ING Bank',
  BACX: 'UniCredit Bank',
  BUCU: 'UniCredit Bank',
  CECE: 'CEC Bank',
  ROIN: 'Salt Bank',
  BREL: 'Libra Internet Bank',
  CARP: 'Patria Bank',
  WBAN: 'Intesa Sanpaolo Bank',
  UGBI: 'Garanti BBVA',
  EGNA: 'Vista Bank',
  MIRO: 'ProCredit Bank',
  BRMA: 'Exim Banca Românească',
  PIRB: 'First Bank',
  FNNB: 'Nexent Bank',
  TREZ: 'Trezoreria Statului',
};

/** The bank of a Romanian IBAN, typed in full or not, or null when its code is not listed. */
export function bankNameForIban(input: string): string | null {
  const iban = normalizeIban(input);
  if (!iban.startsWith('RO') || iban.length < 8) return null;
  return romanianBankNames[iban.slice(4, 8)] ?? null;
}

const listedBankNames = new Set(Object.values(romanianBankNames));

// A bank the list names belongs to the IBAN and follows it; one the person wrote stays.
export function bankNameAfterIbanChange(iban: string, currentBankName: string): string {
  const current = currentBankName.trim();
  if (current && !listedBankNames.has(current)) return currentBankName;
  return bankNameForIban(iban) ?? '';
}
