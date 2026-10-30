import { describe, expect, it } from 'vitest';

import {
  contained,
  cuiDigits,
  findQuote,
  findQuotes,
  foldName,
  foldText,
  placeQuote,
  sameAddress,
  sameName,
  similar,
  streetKey,
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
    expect(foldName('BRUTĂRIA FICTIVĂ S.A.')).toBe('brutaria fictiva');
  });

  it('drops the form of a sole trader or a family business', () => {
    expect(foldName('VASILESCU M. ANA PFA')).toBe('vasilescu m ana');
    expect(foldName('VASILESCU M.ANA P.F.A.')).toBe('vasilescu m ana');
    expect(foldName('P.F.A. Vasilescu Ana')).toBe('vasilescu ana');
    expect(foldName('Vasilescu Ana I.I.')).toBe('vasilescu ana');
    expect(foldName('Vasilescu Ana I. I.')).toBe('vasilescu ana');
    expect(foldName('Familia Vasilescu I.F.')).toBe('familia vasilescu');
  });

  it('keeps a bare II or IF, which numbers a building or is part of a name', () => {
    expect(foldName('Hala II')).toBe('hala ii');
    expect(foldName('Hala II')).not.toBe(foldName('Hala'));
    expect(foldName('Depozit IF')).toBe('depozit if');
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
    expect(sameName('VASILESCU M. ANA PFA', 'VASILESCU M.ANA P.F.A.')).toBe(true);
  });
});

describe('streetKey and sameAddress', () => {
  const at = (addressLine: string, locality: string | null = 'Timișoara') => ({
    locality,
    addressLine,
  });

  it('take a street the same whatever its type, abbreviations, punctuation and case', () => {
    for (const [a, b] of [
      ['Str. Exemplului , Nr.8 , Camera 2', 'STR. EXEMPLULUI, NR. 8, CAM. 2'],
      ['Calea Inventată ,Nr. 6', 'str. Inventata nr. 6'],
      ['Str. Exemplului , Nr.19, Sc. B , Ap. 17', 'Strada EXEMPLULUI, Nr. 19, Scara B, Ap. 17'],
      [
        'Bd. Exemplului nr. 3, bl. A2, et. 1, ap. 4',
        'B-dul Exemplului, numărul 3, bloc A 2, etaj 1, apartament 4',
      ],
      ['Șos. Exemplului 10A', 'Soseaua Exemplului nr. 10 A'],
      ['Piața Exemplului 1', 'Aleea Exemplului nr. 1'],
    ]) {
      expect(streetKey(a!), a).toBe(streetKey(b!));
      expect(sameAddress(at(a!), at(b!, 'TIMISOARA')), a).toBe(true);
    }
  });

  it('keeps apart another number, another staircase or another locality', () => {
    expect(sameAddress(at('Str. Exemplului nr. 8'), at('Str. Exemplului nr. 9'))).toBe(false);
    expect(sameAddress(at('Str. Exemplului 19, Sc. B'), at('Strada Exemplului 19, Scara C'))).toBe(
      false
    );
    expect(sameAddress(at('Str. Exemplului 8'), at('Str. Exemplului 8', 'Lugoj'))).toBe(false);
    expect(streetKey('nr. 5')).toBe('5');
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

describe('placing a row repeated under posts with like names', () => {
  const row = '| Praf | Mască | 1 an | Inventar |';
  const cells = row.slice(2, -2);
  const tables = (...posts: string[]) =>
    [
      `Posturi evaluate: ${posts.join(', ')}`,
      ...posts.flatMap((post, index) => [
        `MESERIA : ${post}`,
        '| Arsuri | Mănuși | 6 luni | Inventar |',
        ...(index === 0 ? ['| Zgomot | Antifoane | 1 an | Inventar |'] : []),
        row,
        '',
      ]),
    ].join('\n');

  it('counts a post only as the whole of its heading, not inside a longer name or a list', () => {
    const text = tables('BUCĂTAR', 'AJUTOR BUCĂTAR');
    const first = text.indexOf(cells);
    const second = text.lastIndexOf(cells);
    expect(placeQuote([text], row, 'Bucătar')?.start).toBe(first);
    expect(placeQuote([text], row, 'Ajutor bucătar')?.start).toBe(second);

    const workers = tables('MUNCITOR', 'MUNCITOR NECALIFICAT');
    expect(placeQuote([workers], row, 'Muncitor')?.start).toBe(workers.indexOf(cells));
    expect(placeQuote([workers], row, 'Muncitor necalificat')?.start).toBe(
      workers.lastIndexOf(cells)
    );
    const listedLast = tables('MUNCITOR NECALIFICAT', 'MUNCITOR');
    expect(placeQuote([listedLast], row, 'Muncitor')?.start).toBe(listedLast.lastIndexOf(cells));
  });

  it("takes a post's cell as its heading, as in a table that names the post in a column", () => {
    const text = [
      '| Post | Risc | Echipament | Durată | Gestiune |',
      `| Ajutor bucătar ${row}`,
      `| Bucătar ${row}`,
    ].join('\n');
    expect(placeQuote([text], row, 'Bucătar')?.start).toBe(text.lastIndexOf(cells));
    expect(placeQuote([text], row, 'Ajutor bucătar')?.start).toBe(text.indexOf(cells));
  });

  it("places an entry for several posts under each post's own table, by its row", () => {
    const text = tables('BUCĂTAR', 'AJUTOR BUCĂTAR');
    const quote = `MESERIA : BUCĂTAR … ${row}`;
    const heading = text.indexOf('MESERIA : BUCĂTAR');
    const first = text.indexOf(cells);
    const second = text.lastIndexOf(cells);
    expect(placeQuote([text], quote, 'Bucătar')?.parts).toEqual([
      { start: heading, end: heading + 'MESERIA : BUCĂTAR'.length },
      { start: first, end: first + cells.length },
    ]);
    expect(placeQuote([text], quote, 'Ajutor bucătar')).toEqual({
      textIndex: 0,
      start: second,
      end: second + cells.length,
      parts: [{ start: second, end: second + cells.length }],
    });
    expect(placeQuote([text], quote, 'Ospătar')?.start).toBe(heading);
  });

  it('finds a table broken across pages, on the page of its row', () => {
    const pages = [
      'Fișa de dotare\nMESERIA : BUCĂTAR\n| Arsuri | Mănuși | 6 luni | Inventar |',
      `${row}\n\nMESERIA : CAMERISTĂ\n| Alunecare | Încălțăminte | 2 ani | Inventar |`,
      `${row}\nSfârșit`,
    ];
    const quote = `MESERIA : BUCĂTAR … ${row}`;
    expect(placeQuote(pages, quote, 'Bucătar')).toEqual({
      textIndex: 1,
      start: 2,
      end: 2 + cells.length,
      parts: [{ start: 2, end: 2 + cells.length }],
    });
    expect(placeQuote(pages, `MESERIA : CAMERISTĂ … ${row}`, 'Cameristă')).toMatchObject({
      textIndex: 2,
      parts: [{ start: 2, end: 2 + cells.length }],
    });
    const heading = pages[1]!.indexOf('CAMERISTĂ');
    expect(placeQuote(pages, 'CAMERISTĂ … | 2 ani | Inventar |')?.parts).toEqual([
      { start: heading, end: heading + 'CAMERISTĂ'.length },
      { start: pages[1]!.indexOf('2 ani'), end: pages[1]!.lastIndexOf('Inventar') + 8 },
    ]);
  });
});
