import { describe, expect, it } from 'vitest';

import {
  contained,
  cuiDigits,
  findQuote,
  findQuotes,
  foldName,
  foldText,
  placeQuote,
  sameName,
  similar,
} from './match';

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

describe('cuiDigits', () => {
  it('reads a CUI past its label and separators', () => {
    for (const written of [
      '12345674',
      'RO 12345674',
      'C.U.I. RO12345674',
      'CUI: 12.345.674',
      'CIF 12345674',
      'Cod fiscal: RO 12345674',
      'Codul unic de înregistrare nr. 12345674',
      'CUI/CIF: 12345674',
    ]) {
      expect(cuiDigits(written), written).toBe('12345674');
    }
    expect(cuiDigits('J35/123/2015')).toBeNull();
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

  it('finds whole words only, except beside an ellipsis', () => {
    expect(findQuote('Instruirea se face la 16 luni.', 'la 1')).toBeNull();
    expect(findQuote('Instruirea se face la 16 luni.', 'face la 16')).not.toBeNull();
    expect(findQuote(text, 'numește dl. Vasilescu An')).toBeNull();
    expect(findQuote(text, 'numește dl. Vasilescu An…')).not.toBeNull();
    expect(findQuote(text, '…ește dl. Vasilescu')).not.toBeNull();
  });

  it('does not find words that are not there', () => {
    expect(findQuote(text, 'Se numește dl. Georgescu Mihai')).toBeNull();
    expect(findQuote(text, '   ')).toBeNull();
  });
});

describe('findQuotes and placeQuote', () => {
  const row = '| Substanțe de curățat (mâini) | Mănuși | - | Inventar |';
  const text = [
    'Posturi evaluate: Bucătar, Cameristă, Recepționer',
    'LOC DE MUNCĂ : RESTAURANT / MESERIA : BUCĂTAR',
    '| Arsuri (mâini) | Mănuși termorezistente | 1 an | Inventar |',
    row,
    '',
    'LOC DE MUNCĂ : HOTEL / MESERIA : CAMERISTĂ',
    '| Alunecare | Încălțăminte | 2 ani | Inventar |',
    row,
    '',
  ].join('\n');
  const cells = row.slice(2, -2);
  const first = text.indexOf(cells);
  const second = text.lastIndexOf(cells);

  it('finds every place of a quote, in order', () => {
    expect(findQuotes(text, row)).toEqual(
      [first, second].map((start) => {
        const span = { start, end: start + cells.length };
        return { ...span, parts: [span] };
      })
    );
    expect(findQuote(text, row)?.start).toBe(first);
  });

  it("takes the place of a repeated row under the heading of the entry's post", () => {
    expect(placeQuote([text], row, 'Cameristă')).toMatchObject({
      textIndex: 0,
      start: second,
      end: second + cells.length,
    });
    expect(placeQuote([text], 'Inventar', 'Cameristă')?.start).toBe(
      text.indexOf('Inventar', text.indexOf('CAMERISTĂ'))
    );
    expect(placeQuote([text], row, 'Bucătar')?.start).toBe(first);
  });

  it('takes the first place when the hint is missing or found nowhere before it', () => {
    expect(placeQuote([text], row)?.start).toBe(first);
    expect(placeQuote([text], row, 'Ospătar')?.start).toBe(first);
    expect(placeQuote([text], 'Lipsește', 'Cameristă')).toBeNull();
  });

  it('reads the texts as one, so a heading on a page heads the rows of the next', () => {
    const pages = [
      `MESERIA : BUCĂTAR\n${row}`,
      `${row}\nMESERIA : CAMERISTĂ`,
      `Continuare\n${row}`,
    ];
    expect(placeQuote(pages, row, 'Cameristă')).toMatchObject({
      textIndex: 2,
      start: pages[2]!.indexOf(cells),
      end: pages[2]!.indexOf(cells) + cells.length,
    });
    expect(placeQuote(pages, row)?.textIndex).toBe(0);
  });

  it('starts an ellipsis quote at the latest first part that still comes before the rest', () => {
    const headed = findQuotes(text, `CAMERISTĂ … ${row}`);
    expect(headed).toHaveLength(2);
    expect(text.slice(headed[0]!.start, headed[0]!.end)).toMatch(/^Cameristă, Recepționer/);
    expect(text.slice(headed[1]!.start, headed[1]!.end)).toBe(
      `CAMERISTĂ\n| Alunecare | Încălțăminte | 2 ani | Inventar |\n| ${cells}`
    );
    const heading = text.indexOf('CAMERISTĂ');
    expect(placeQuote([text], `CAMERISTĂ … ${row}`, 'Cameristă')?.parts).toEqual([
      { start: heading, end: heading + 'CAMERISTĂ'.length },
      { start: second, end: second + cells.length },
    ]);
    const span = findQuote('Mănuși, apoi Mănuși de bumbac și Inventar', 'Mănuși … Inventar');
    expect(span?.start).toBe('Mănuși, apoi '.length);
  });
});
