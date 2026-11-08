import { describe, expect, it } from 'vitest';

import { bankNameAfterIbanChange, bankNameForIban, romanianBankNames } from './banks';

describe('bank from IBAN', () => {
  it('names the bank from the four letters after the check digits, however it is typed', () => {
    expect(bankNameForIban('RO49BTRL0301205093840001')).toBe('Banca Transilvania');
    expect(bankNameForIban('ro49 rncb 0082 0000 0000 0001')).toBe('Banca Comercială Română');
    expect(bankNameForIban('RO49 INGB')).toBe('ING Bank');
  });

  it('names the bank that took over a merged one', () => {
    expect(bankNameForIban('RO49OTPV0000000000000001')).toBe('Banca Transilvania');
    expect(bankNameForIban('RO49BUCU0000000000000001')).toBe('UniCredit Bank');
  });

  it('names nothing for an unknown code, a foreign account or a code not typed yet', () => {
    expect(bankNameForIban('RO49AAAA1B31007593840000')).toBeNull();
    expect(bankNameForIban('DE89370400440532013000')).toBeNull();
    expect(bankNameForIban('RO49BT')).toBeNull();
    expect(bankNameForIban('')).toBeNull();
  });

  it('lists only four-letter codes', () => {
    for (const code of Object.keys(romanianBankNames)) expect(code).toMatch(/^[A-Z]{4}$/);
  });
});

describe('bank after the IBAN changes', () => {
  it('fills an empty bank from the IBAN', () => {
    expect(bankNameAfterIbanChange('RO49BRDE0000000000000001', '')).toBe(
      'BRD - Groupe Société Générale'
    );
  });

  it('replaces a bank the list names with the one the new IBAN names, or with nothing', () => {
    expect(bankNameAfterIbanChange('RO49RZBR0000000000000001', 'Banca Transilvania')).toBe(
      'Raiffeisen Bank'
    );
    expect(bankNameAfterIbanChange('RO49AAAA', 'Banca Transilvania')).toBe('');
  });

  it('keeps a bank the person wrote', () => {
    expect(bankNameAfterIbanChange('RO49BTRL0000000000000001', 'BT Cluj')).toBe('BT Cluj');
    expect(bankNameAfterIbanChange('RO49AAAA', 'BT Cluj')).toBe('BT Cluj');
  });
});
