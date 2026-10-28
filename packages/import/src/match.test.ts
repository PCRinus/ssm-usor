import { describe, expect, it } from 'vitest';

import { contained, findQuote, foldName, foldText, sameName, similar } from './match';

describe('foldText', () => {
  it('drops diacritics of both the comma and the cedilla forms', () => {
    expect(foldText('Ștefănescu Ţăranu şi Ș.A.')).toBe('stefanescu taranu si s a');
    expect(foldText('ştiinţă')).toBe(foldText('știință'));
  });
});

describe('foldName', () => {
  it('drops the company form', () => {
    expect(foldName('S.C. Brutăria Fictivă S.R.L.')).toBe('brutaria fictiva');
    expect(foldName('BRUTARIA FICTIVA SRL')).toBe('brutaria fictiva');
  });
});

describe('similar and contained', () => {
  it('ignore word order and company forms', () => {
    expect(similar('Vasilescu Ana', 'ANA VASILESCU')).toBe(1);
    expect(similar('S.C. Brutăria Fictivă S.R.L.', 'Brutaria Fictiva')).toBe(1);
  });

  it('counts a prefix as found', () => {
    expect(contained('Sediu social', 'Sediul social al societății')).toBe(1);
    expect(contained('Sediu social', 'Punct de lucru Depozit')).toBe(0);
  });
});

describe('sameName', () => {
  it('knows a company despite its form, never by a name that only starts like it', () => {
    expect(sameName('S.C. Brutăria Fictivă S.R.L.', 'BRUTARIA FICTIVA SRL')).toBe(true);
    expect(sameName('Protect SRL', 'Protecție Construct SRL')).toBe(false);
    expect(sameName('Alfa SRL', 'Alfa Construct SRL')).toBe(false);
  });
});

describe('findQuote', () => {
  const text = [
    'DECIZIA nr. 3 din 12.01.2025',
    'Se numește dl. Vasilescu Ana în funcția de',
    'conducător al locului de muncă.',
    '| Nr. | Post | Echipament |',
    '| 1 | Brutar | Mănuși de protecţie |',
  ].join('\n');

  it('finds a quote across a line break, in another case, with the other cedilla', () => {
    const match = findQuote(text, 'în funcția de CONDUCĂTOR al locului');
    expect(match).not.toBeNull();
    expect(text.slice(match!.start, match!.end)).toBe('în funcția de\nconducător al locului');
  });

  it('finds a quote across table cells without the pipes', () => {
    const match = findQuote(text, 'Brutar Mănuși de protecție');
    expect(text.slice(match!.start, match!.end)).toBe('Brutar | Mănuși de protecţie');
  });

  it('finds the parts of a quote with an ellipsis in order', () => {
    expect(findQuote(text, 'Se numește … conducător al locului')).not.toBeNull();
    expect(findQuote(text, 'conducător al locului ... Se numește')).toBeNull();
  });

  it('does not find words that are not there', () => {
    expect(findQuote(text, 'Se numește dl. Georgescu Mihai')).toBeNull();
    expect(findQuote(text, '   ')).toBeNull();
  });
});
