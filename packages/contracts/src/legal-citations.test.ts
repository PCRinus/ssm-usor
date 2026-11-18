import { describe, expect, it } from 'vitest';

import { anchorOf, articleLabel, type CitationReference, parseCitation } from './legal-citations';

const watched = new Set([
  'lege-319-2006',
  'lege-307-2006',
  'lege-53-2003',
  'hg-1425-2006',
  'hg-971-2006',
  'oug-195-2002',
  'og-1-2000',
  'omai-163-2007',
  'omai-187-2010',
  'omai-712-2005',
  'ordin-427-2002',
  'ordin-450-825-2006',
]);
const isWatched = (id: string) => watched.has(id);

const parse = (text: string) => parseCitation(text, isWatched);

const linked = (text: string) =>
  parse(text)
    .filter((part) => part.act !== null)
    .map(({ text: piece, act, article, annex }) =>
      [piece, act, article ?? (annex === null ? '' : `anexa ${annex}`)].join(' | ')
    );

const plain = (text: string): CitationReference => ({
  text,
  act: null,
  article: null,
  annex: null,
});

describe('a citation split into its parts', () => {
  it('gives the act and the article each a part, with the text between them plain', () => {
    expect(parse('Legea 319/2006, art. 1')).toEqual([
      { text: 'Legea 319/2006', act: 'lege-319-2006', article: null, annex: null },
      plain(', '),
      { text: 'art. 1', act: 'lege-319-2006', article: '1', annex: null },
    ]);
  });

  it('keeps the alineat, letter and point in the article part', () => {
    expect(linked('H.G. 1425/2006, art. 89 alin. (1)')).toEqual([
      'H.G. 1425/2006 | hg-1425-2006 | ',
      'art. 89 alin. (1) | hg-1425-2006 | 89',
    ]);
    expect(linked('Legea 319/2006, art. 13 lit. f)')).toEqual([
      'Legea 319/2006 | lege-319-2006 | ',
      'art. 13 lit. f) | lege-319-2006 | 13',
    ]);
    expect(linked('Legea 319/2006, art. 23 alin. (1) lit. b) pct. 2')).toContain(
      'art. 23 alin. (1) lit. b) pct. 2 | lege-319-2006 | 23'
    );
  });

  it('reads a range of alineate as one article', () => {
    expect(linked('H.G. 1425/2006, art. 96 alin. (2)–(4)')).toContain(
      'art. 96 alin. (2)–(4) | hg-1425-2006 | 96'
    );
    expect(linked('H.G. 1425/2006, art. 96 alin. (2) - (4)')).toContain(
      'art. 96 alin. (2) - (4) | hg-1425-2006 | 96'
    );
  });

  it('gives each article of a list its own part', () => {
    expect(parse('O.M.A.I. 712/2005, art. 14 și 15')).toEqual([
      { text: 'O.M.A.I. 712/2005', act: 'omai-712-2005', article: null, annex: null },
      plain(', '),
      { text: 'art. 14', act: 'omai-712-2005', article: '14', annex: null },
      plain(' și '),
      { text: '15', act: 'omai-712-2005', article: '15', annex: null },
    ]);
    expect(linked('Legea 319/2006, art. 5, 6 și 7 alin. (2)')).toEqual([
      'Legea 319/2006 | lege-319-2006 | ',
      'art. 5 | lege-319-2006 | 5',
      '6 | lege-319-2006 | 6',
      '7 alin. (2) | lege-319-2006 | 7',
    ]);
  });

  it('reads the common spellings of an act, with or without „nr.”', () => {
    const acts = (text: string) => parse(text).flatMap((part) => (part.act ? [part.act] : []));
    expect(acts('Legea nr. 319/2006')).toEqual(['lege-319-2006']);
    expect(acts('legea 319/2006')).toEqual(['lege-319-2006']);
    expect(acts('L. 319/2006')).toEqual(['lege-319-2006']);
    expect(acts('Legii nr. 319 / 2006')).toEqual(['lege-319-2006']);
    expect(acts('HG 1425/2006')).toEqual(['hg-1425-2006']);
    expect(acts('H.G. nr. 1425/2006')).toEqual(['hg-1425-2006']);
    expect(acts('H. G. 1425/2006')).toEqual(['hg-1425-2006']);
    expect(acts('Hotărârea Guvernului nr. 1425/2006')).toEqual(['hg-1425-2006']);
    expect(acts('OUG 195/2002')).toEqual(['oug-195-2002']);
    expect(acts('O.U.G. nr. 195/2002')).toEqual(['oug-195-2002']);
    expect(acts('Ordonanța de urgență a Guvernului nr. 195/2002')).toEqual(['oug-195-2002']);
    expect(acts('O.G. 1/2000')).toEqual(['og-1-2000']);
    expect(acts('OMAI 712/2005')).toEqual(['omai-712-2005']);
    expect(acts('O.M.A.I. nr. 712/2005')).toEqual(['omai-712-2005']);
    expect(acts('Ordinul MAI 712/2005')).toEqual(['omai-712-2005']);
    expect(acts('Ordinul M.A.I. nr. 712/2005')).toEqual(['omai-712-2005']);
    expect(acts('Ordinul ministrului administrației și internelor nr. 163/2007')).toEqual([
      'omai-163-2007',
    ]);
  });

  it('takes an order named without its issuer for the one watched', () => {
    expect(linked('Ordinul 163/2007, art. 29')).toEqual([
      'Ordinul 163/2007 | omai-163-2007 | ',
      'art. 29 | omai-163-2007 | 29',
    ]);
    expect(linked('Ordinul 427/2002')).toEqual(['Ordinul 427/2002 | ordin-427-2002 | ']);
    expect(linked('Ordinul 450/825/2006, art. 2')).toEqual([
      'Ordinul 450/825/2006 | ordin-450-825-2006 | ',
      'art. 2 | ordin-450-825-2006 | 2',
    ]);
  });

  it('reads the Roman numerals of an amending act’s articles', () => {
    expect(linked('Legea 319/2006, art. I și II')).toEqual([
      'Legea 319/2006 | lege-319-2006 | ',
      'art. I | lege-319-2006 | I',
      'II | lege-319-2006 | II',
    ]);
  });

  it('writes an article with a superscript as the check stores it', () => {
    expect(linked('H.G. 1425/2006, art. 80¹')).toContain('art. 80¹ | hg-1425-2006 | 80^1');
    expect(linked('H.G. 1425/2006, art. 80^1 alin. (2)')).toContain(
      'art. 80^1 alin. (2) | hg-1425-2006 | 80^1'
    );
    expect(articleLabel('109²')).toBe('109^2');
  });

  it('ties an article to the act that follows it with „din”', () => {
    expect(linked('art. 20 din Legea 319/2006')).toEqual([
      'art. 20 | lege-319-2006 | 20',
      'Legea 319/2006 | lege-319-2006 | ',
    ]);
    expect(linked('art. 5 și 7 din Legea 319/2006 și art. 89 din H.G. 1425/2006')).toEqual([
      'art. 5 | lege-319-2006 | 5',
      '7 | lege-319-2006 | 7',
      'Legea 319/2006 | lege-319-2006 | ',
      'art. 89 | hg-1425-2006 | 89',
      'H.G. 1425/2006 | hg-1425-2006 | ',
    ]);
    expect(linked('anexa 11 la H.G. 1425/2006')).toEqual([
      'anexa 11 | hg-1425-2006 | anexa 11',
      'H.G. 1425/2006 | hg-1425-2006 | ',
    ]);
  });

  it('reads several acts in one citation, each with its articles', () => {
    expect(
      linked('Legea 319/2006, art. 5 și H.G. 1425/2006, art. 89; Legea 53/2003, art. 39')
    ).toEqual([
      'Legea 319/2006 | lege-319-2006 | ',
      'art. 5 | lege-319-2006 | 5',
      'H.G. 1425/2006 | hg-1425-2006 | ',
      'art. 89 | hg-1425-2006 | 89',
      'Legea 53/2003 | lege-53-2003 | ',
      'art. 39 | lege-53-2003 | 39',
    ]);
  });

  it('leaves an article of anything but a watched act as plain text', () => {
    expect(parse('IPSU, art. 151')).toEqual([plain('IPSU, art. 151')]);
    expect(parse('I.P.S.S.M., art. 78')).toEqual([plain('I.P.S.S.M., art. 78')]);
    expect(linked('Legea 319/2006, art. 5; I.P.S.S.M., art. 78')).toEqual([
      'Legea 319/2006 | lege-319-2006 | ',
      'art. 5 | lege-319-2006 | 5',
    ]);
    expect(linked('Legea 319/2006, art. 5, I.P.S.S.M., art. 78')).toEqual([
      'Legea 319/2006 | lege-319-2006 | ',
      'art. 5 | lege-319-2006 | 5',
    ]);
    expect(linked('Legea 307/2006, art. 6, IPSU art. 151')).toEqual([
      'Legea 307/2006 | lege-307-2006 | ',
      'art. 6 | lege-307-2006 | 6',
    ]);
    expect(linked('Legea 319/2006, art. 5 și Codul muncii, art. 39')).toEqual([
      'Legea 319/2006 | lege-319-2006 | ',
      'art. 5 | lege-319-2006 | 5',
    ]);
    expect(parse('Legea 1/2020, art. 3')).toEqual([plain('Legea 1/2020, art. 3')]);
    expect(parse('art. 3')).toEqual([plain('art. 3')]);
    expect(parse('Codul muncii')).toEqual([plain('Codul muncii')]);
  });

  it('gives the text back whole', () => {
    for (const text of [
      'Legea 319/2006, art. 13 lit. p), art. 23 alin. (1) lit. e) și art. 26',
      '  Legea 319/2006 – art. 1.  ',
      'vezi art. 20 din Legea nr. 319/2006, apoi IPSU',
    ]) {
      expect(
        parse(text)
          .map((part) => part.text)
          .join('')
      ).toBe(text);
    }
  });
});

// As supabase/migrations/20261020100100_built_in_test_questions.sql seeds them.
const builtIns: [string, string[]][] = [
  ['Legea 319/2006, art. 1', ['Legea 319/2006 | lege-319-2006 | ', 'art. 1 | lege-319-2006 | 1']],
  [
    'Legea 319/2006, art. 5 lit. g)',
    ['Legea 319/2006 | lege-319-2006 | ', 'art. 5 lit. g) | lege-319-2006 | 5'],
  ],
  [
    'Legea 319/2006, art. 23 alin. (1) lit. b)',
    ['Legea 319/2006 | lege-319-2006 | ', 'art. 23 alin. (1) lit. b) | lege-319-2006 | 23'],
  ],
  [
    'Legea 319/2006, art. 30 alin. (1) lit. g)',
    ['Legea 319/2006 | lege-319-2006 | ', 'art. 30 alin. (1) lit. g) | lege-319-2006 | 30'],
  ],
  [
    'Legea 319/2006, art. 13 lit. p), art. 23 alin. (1) lit. e) și art. 26',
    [
      'Legea 319/2006 | lege-319-2006 | ',
      'art. 13 lit. p) | lege-319-2006 | 13',
      'art. 23 alin. (1) lit. e) | lege-319-2006 | 23',
      'art. 26 | lege-319-2006 | 26',
    ],
  ],
  [
    'Legea 319/2006, art. 22',
    ['Legea 319/2006 | lege-319-2006 | ', 'art. 22 | lege-319-2006 | 22'],
  ],
  [
    'Legea 319/2006, art. 23 alin. (1) lit. d)',
    ['Legea 319/2006 | lege-319-2006 | ', 'art. 23 alin. (1) lit. d) | lege-319-2006 | 23'],
  ],
  [
    'Legea 319/2006, art. 23 alin. (1) lit. c)',
    ['Legea 319/2006 | lege-319-2006 | ', 'art. 23 alin. (1) lit. c) | lege-319-2006 | 23'],
  ],
  ['I.P.S.S.M., art. 78', []],
  ['H.G. 971/2006, anexa 2', ['H.G. 971/2006 | hg-971-2006 | ', 'anexa 2 | hg-971-2006 | anexa 2']],
  ['Legea 307/2006, art. 1', ['Legea 307/2006 | lege-307-2006 | ', 'art. 1 | lege-307-2006 | 1']],
  [
    'O.M.A.I. 163/2007, art. 106 alin. (5)',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 106 alin. (5) | omai-163-2007 | 106'],
  ],
  [
    'O.M.A.I. 163/2007, art. 108 alin. (1)',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 108 alin. (1) | omai-163-2007 | 108'],
  ],
  [
    'O.M.A.I. 712/2005, art. 14 și 15',
    [
      'O.M.A.I. 712/2005 | omai-712-2005 | ',
      'art. 14 | omai-712-2005 | 14',
      '15 | omai-712-2005 | 15',
    ],
  ],
  [
    'O.M.A.I. 712/2005, art. 13 și 18',
    [
      'O.M.A.I. 712/2005 | omai-712-2005 | ',
      'art. 13 | omai-712-2005 | 13',
      '18 | omai-712-2005 | 18',
    ],
  ],
  ['IPSU, art. 164 alin. (2) lit. a)', []],
  [
    'O.M.A.I. 163/2007, art. 29',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 29 | omai-163-2007 | 29'],
  ],
  [
    'O.M.A.I. 163/2007, art. 29 alin. (2)',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 29 alin. (2) | omai-163-2007 | 29'],
  ],
  [
    'O.M.A.I. 163/2007, art. 145',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 145 | omai-163-2007 | 145'],
  ],
  [
    'O.M.A.I. 163/2007, anexa 6',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'anexa 6 | omai-163-2007 | anexa 6'],
  ],
  [
    'O.M.A.I. 187/2010, art. 128 alin. (2)',
    ['O.M.A.I. 187/2010 | omai-187-2010 | ', 'art. 128 alin. (2) | omai-187-2010 | 128'],
  ],
  [
    'O.M.A.I. 163/2007, art. 29 alin. (4)',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 29 alin. (4) | omai-163-2007 | 29'],
  ],
  ['IPSU, art. 163 alin. (2) lit. a) și art. 165 alin. (2) lit. b)', []],
  [
    'Legea 307/2006, art. 6 alin. (2)',
    ['Legea 307/2006 | lege-307-2006 | ', 'art. 6 alin. (2) | lege-307-2006 | 6'],
  ],
  [
    'O.M.A.I. 163/2007, art. 144',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 144 | omai-163-2007 | 144'],
  ],
  [
    'O.M.A.I. 163/2007, art. 34',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 34 | omai-163-2007 | 34'],
  ],
  [
    'O.M.A.I. 163/2007, art. 110 alin. (1)',
    ['O.M.A.I. 163/2007 | omai-163-2007 | ', 'art. 110 alin. (1) | omai-163-2007 | 110'],
  ],
  [
    'O.M.A.I. 712/2005, art. 22',
    ['O.M.A.I. 712/2005 | omai-712-2005 | ', 'art. 22 | omai-712-2005 | 22'],
  ],
  [
    'O.M.A.I. 712/2005, art. 7',
    ['O.M.A.I. 712/2005 | omai-712-2005 | ', 'art. 7 | omai-712-2005 | 7'],
  ],
  [
    'O.M.A.I. 712/2005, art. 46',
    ['O.M.A.I. 712/2005 | omai-712-2005 | ', 'art. 46 | omai-712-2005 | 46'],
  ],
  ['IPSU, art. 151', []],
  ['IPSU, art. 166 lit. b)', []],
];

describe('the built-in questions’ citations', () => {
  it.each(builtIns)('%s', (citation, parts) => {
    expect(linked(citation)).toEqual(parts);
    expect(
      parse(citation)
        .map((part) => part.text)
        .join('')
    ).toBe(citation);
  });

  it('are all of them', () => {
    expect(builtIns).toHaveLength(32);
  });
});

describe('the place of a cited article', () => {
  const at = (annex: string | null, article: string | null, anchor: string) => ({
    annex,
    article,
    path: '/Public/DetaliiDocument/1',
    anchor,
  });
  const order = [
    at(null, '1', 'id_artA27'),
    at('Anexa', null, 'id_anxA41'),
    at('Anexa', '1', 'id_artA14'),
    at('Anexa', '14', 'id_artA89'),
    at('2', null, 'id_anxA90'),
  ];

  it('is the one article of that number, in the act or in the norms it approves', () => {
    expect(anchorOf(order, { article: '14', annex: null })?.anchor).toBe('id_artA89');
  });

  it('is not guessed when the act and its norms both have the number', () => {
    expect(anchorOf(order, { article: '1', annex: null })).toBeNull();
  });

  it('is the annex itself for an annex', () => {
    expect(anchorOf(order, { article: null, annex: '2' })?.anchor).toBe('id_anxA90');
    expect(anchorOf(order, { article: null, annex: '3' })).toBeNull();
  });

  it('is unknown for a part that names only the act', () => {
    expect(anchorOf(order, { article: null, annex: null })).toBeNull();
  });
});
