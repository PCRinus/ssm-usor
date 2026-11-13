import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { type ActText, type ConsolidatedForm, parseActText } from './act-text';
import { lawHunks } from './forms';
import { assessImpact } from './impact';
import type { CitedPassage } from './locator';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const quotes = (
  JSON.parse(fixture('template-quotes.json')) as {
    citations: (CitedPassage & { file: string })[];
  }
).citations;
const quotesOf = (act: string) => quotes.filter((citation) => citation.act === act);
const reference = (act: string, article: string | null): CitedPassage => ({
  form: 'reference',
  act,
  article,
  locator: null,
  text: null,
});

const consolidation = (date: string) => ({ date, kind: 'consolidation' as const, path: null });

const roadCode = {
  verified: {
    formPortalId: 312713,
    consolidatedOn: '2026-08-25',
    text: parseActText(fixture('oug-195-2002-2026-08-25.html'), 312713),
    forms: [consolidation('2026-11-06'), consolidation('2026-08-25')],
  },
  current: {
    formPortalId: 41006,
    consolidatedOn: '2026-11-06',
    text: parseActText(fixture('oug-195-2002-text.html'), 41006),
    forms: [consolidation('2026-11-06'), consolidation('2026-08-25')],
  },
};
const criminalCode = {
  verified: {
    formPortalId: 311786,
    consolidatedOn: '2026-07-23',
    text: parseActText(fixture('codul-penal-2026-07-23.html'), 311787),
    forms: [],
  },
  current: {
    formPortalId: 109854,
    consolidatedOn: '2026-10-18',
    text: parseActText(fixture('codul-penal-text.html'), 314314),
    forms: [],
  },
};

const page = (body: string) =>
  `<span class="S_DEN">HOTĂRÂRE nr. 1</span><div id="fisaact"></div>${body}`;
const article = (label: string, body: string, heading = '') =>
  `<span class="S_ART"><span class="S_ART_TTL">Articolul ${label}</span>${heading ? `<span class="S_ART_DEN">${heading}</span>` : ''}<span class="S_ART_BDY">${body}</span></span>`;
const annex = (title: string, body: string) =>
  `<span class="S_ANX"><span class="S_ANX_TTL">${title}</span><span class="S_ANX_BDY">${body}</span></span>`;
const form = (
  text: ActText,
  consolidatedOn: string,
  kind: ConsolidatedForm['kind'] = 'consolidation'
) => ({
  formPortalId: consolidatedOn === '2026-01-01' ? 1 : 2,
  consolidatedOn,
  text,
  forms: [
    { date: '2026-02-01', kind, path: null },
    { date: '2026-01-01', kind: 'consolidation' as const, path: '/Public/DetaliiDocument/1' },
  ],
});
const quote = (locator: string, text: string): CitedPassage => ({
  form: 'quote',
  act: 'hg-1-2000',
  article: null,
  locator,
  text,
});
const assess = (verified: string, current: string, citations: CitedPassage[]) =>
  assessImpact({
    actId: 'hg-1-2000',
    citations,
    verified: form(parseActText(page(verified), 1), '2026-01-01'),
    current: form(parseActText(page(current), 2), '2026-02-01'),
  });

describe('the words the law changed between two of its forms', () => {
  it('are exact, punctuation included, with the words around them', () => {
    expect(
      lawHunks('să poarte casca de protecție.', 'să poarte pe cap cască de protecție;')
    ).toEqual([
      { old: 'casca', new: 'pe cap cască', before: 'să poarte', after: 'de protecție.' },
      { old: '.', new: ';', before: 'să poarte casca de protecție', after: '' },
    ]);
  });

  it('ignore only spacing', () => {
    expect(lawHunks('art. 5 , alin. (2)', 'art.  5, alin. (2)')).toEqual([]);
  });
});

describe('assessing what a new consolidated form means for the templates', () => {
  it('finds the quoted alineat the law changed, with its hunks and the amending act', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: quotesOf('oug-195-2002'),
      ...roadCode,
    });
    expect(impact.outcome).toBe('quote_differs');
    expect(impact.review).toEqual([]);
    expect(impact.amendingActs.map((act) => act.name)).toEqual(['Legea 207/2026']);
    expect(impact.amendedUnits.map((note) => note.subject)).toEqual([
      'Alineatul (2), Articolul 36, Sectiunea 1, Capitolul V',
    ]);
    expect(
      Object.fromEntries(impact.citations.map((result) => [result.citation.locator, result.status]))
    ).toEqual({
      'Art. 1 alin. (1), (2)': 'unaffected',
      'Art. 35 alin. (1) – (7)': 'unaffected',
      'Art. 36 alin. (1) – (3)': 'quote_differs',
    });
    const changed = impact.citations.find((result) => result.status === 'quote_differs');
    expect(changed?.units).toEqual([
      {
        unit: expect.objectContaining({ article: '36', alineat: '2', label: 'Art. 36 alin. (2)' }),
        status: 'changed',
        old: '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.',
        new: '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.',
        hunks: [
          {
            old: 'casca',
            new: 'pe cap cască',
            before: 'acestea au obligația să poarte',
            after: 'de protecție omologată.',
          },
          {
            old: '',
            new: 'pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător',
            before: 'poarte casca de protecție omologată',
            after: '.',
          },
        ],
      },
    ]);
  });

  it('sends a referred article the law changed for review', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: [reference('oug-195-2002', '36'), reference('oug-195-2002', '1')],
      ...roadCode,
    });
    expect(impact.outcome).toBe('needs_review');
    expect(impact.review).toEqual(['Art. 36 is referred to and was changed.']);
    expect(impact.citations.map((result) => result.status)).toEqual([
      'reference_touched',
      'unaffected',
    ]);
  });

  it('sends a cited article in neither form for review', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: [reference('oug-195-2002', '999')],
      ...roadCode,
    });
    expect(impact.outcome).toBe('needs_review');
    expect(impact.citations[0]?.status).toBe('unit_missing');
  });

  it('finds no impact where the cited units read the same, and none for an act-level reference', () => {
    const impact = assessImpact({
      actId: 'lege-286-2009',
      citations: [...quotesOf('lege-286-2009'), reference('lege-286-2009', null)],
      ...criminalCode,
    });
    expect(impact.outcome).toBe('no_impact');
    expect(impact.units.map((unit) => [unit.unit.label, unit.status])).toEqual([
      ['Art. 349', 'unchanged'],
      ['Art. 350', 'unchanged'],
    ]);
  });

  it('asks for a review when no form was verified, instead of counting everything', () => {
    const impact = assessImpact({
      actId: 'oug-195-2002',
      citations: quotesOf('oug-195-2002'),
      verified: null,
      current: roadCode.current,
    });
    expect(impact.outcome).toBe('needs_review');
    expect(impact.review).toHaveLength(1);
    expect(impact.citations).toEqual([]);
  });

  it("tells an untitled annex's article from the act's own article of that number", () => {
    const decision = article('2', 'Se aprobă normele.');
    const impact = assess(
      decision + annex('ANEXA', article('2', 'Angajatorul instruiește lucrătorii anual.')),
      decision + annex('ANEXA', article('2', 'Angajatorul instruiește lucrătorii lunar.')),
      [quote('Art. 2', 'Angajatorul instruiește lucrătorii anual.'), reference('hg-1-2000', '2')]
    );
    expect(impact.outcome).toBe('quote_differs');
    expect(impact.units.map((unit) => [unit.unit.label, unit.status])).toEqual([
      ['Anexa, Art. 2', 'changed'],
      ['Art. 2', 'unchanged'],
    ]);
  });

  it('sends a cited unit with no words to read for review', () => {
    const impact = assess(
      annex('ANEXA nr. 2', '<img src="a.png">'),
      annex('ANEXA nr. 2', '<img src="b.png">'),
      [quote('Anexa 2', 'Semn de avertizare')]
    );
    expect(impact.outcome).toBe('needs_review');
    expect(impact.citations[0]?.status).toBe('uncompared');
    expect(impact.review).toEqual([
      'Anexa 2 is cited and its text could not be read in both forms.',
    ]);
  });

  it('compares the marginal title of a cited article', () => {
    const impact = assess(
      article('3', 'Angajatorul instruiește lucrătorii.', 'Instruirea'),
      article('3', 'Angajatorul instruiește lucrătorii.', 'Instruirea periodică'),
      [quote('Art. 3', 'Angajatorul instruiește lucrătorii.')]
    );
    expect(impact.outcome).toBe('quote_differs');
  });

  it('trusts a note that says a cited unit changed although its text reads the same', () => {
    const note =
      '<span class="S_PAR">(la 15-01-2026, Articolul 3 a fost modificat de Punctul 1., Articolul I din HOTĂRÂREA nr. 5 din 10 ianuarie 2026, publicată în MONITORUL OFICIAL nr. 20 din 12 ianuarie 2026)</span>';
    const impact = assess(
      article('3', 'Angajatorul instruiește lucrătorii.'),
      article('3', `Angajatorul instruiește lucrătorii.${note}`),
      [quote('Art. 3', 'Angajatorul instruiește lucrătorii.')]
    );
    expect(impact.outcome).toBe('needs_review');
    expect(impact.review).toEqual([
      'Art. 3 is cited and reads the same, but a note says Articolul 3 was modified on 2026-01-15.',
    ]);
  });

  it('sends a change across a republication for review, whatever the texts say', () => {
    const text = article('3', 'Angajatorul instruiește lucrătorii.');
    const impact = assessImpact({
      actId: 'hg-1-2000',
      citations: [quote('Art. 3', 'Angajatorul instruiește lucrătorii.')],
      verified: form(parseActText(page(text), 1), '2026-01-01'),
      current: form(parseActText(page(text), 2), '2026-02-01', 'republication'),
    });
    expect(impact.outcome).toBe('needs_review');
    expect(impact.review).toEqual([
      'The act was republished on 2026-02-01, so its numbering may have changed.',
    ]);
  });

  it('refuses to compare a form with itself', () => {
    expect(() =>
      assessImpact({
        actId: 'oug-195-2002',
        citations: quotesOf('oug-195-2002'),
        verified: roadCode.current,
        current: roadCode.current,
      })
    ).toThrow(/same/);
  });

  it('compares a point an amending act writes as a plain paragraph', () => {
    const points = (third: string) =>
      article(
        'II',
        [
          'Normele se modifică după cum urmează:',
          '1. După articolul 80 se introduce un nou articol, articolul 80^1, cu următorul cuprins:',
          '"Art. 80^1. - Durata instruirii este de cel puțin 8 ore.',
          '2. Acest text nu e un punct al actului."',
          `2. La articolul 87, alineatul (2) se ${third}.`,
        ]
          .map((line) => `<span class="S_PAR">${line}</span>`)
          .join('')
      );
    const unchanged = assess(points('abrogă'), points('modifică'), [
      quote('Art. II, pct. 1', 'Art. 80¹. - Durata instruirii este de cel puțin 8 ore.'),
    ]);
    expect(unchanged.outcome).toBe('no_impact');
    expect(unchanged.units[0]).toMatchObject({ status: 'unchanged' });
    const changed = assess(points('abrogă'), points('modifică'), [
      quote('Art. II, pct. 2', 'La articolul 87, alineatul (2) se abrogă.'),
    ]);
    expect(changed.outcome).toBe('quote_differs');
  });
});

describe('the words the law changed in a long text', () => {
  it('are found line by line where a word-by-word table would be too large', () => {
    const lines = Array.from({ length: 3000 }, (_, index) => `rândul ${index} al tabelului`);
    const changed = lines.map((line, index) =>
      index === 10 || index === 2990 ? `${line} modificat` : line
    );
    expect(
      lawHunks(lines.join('\n'), changed.join('\n'))?.map((hunk) => [
        hunk.old,
        hunk.new,
        hunk.before,
      ])
    ).toEqual([
      ['', 'modificat', 'tabelului\nrândul 10 al tabelului'],
      ['', 'modificat', 'tabelului\nrândul 2990 al tabelului'],
    ]);
  });

  it('are not found where even the lines are too many to compare', () => {
    const lines = (offset: number) =>
      Array.from({ length: 2100 }, (_, index) => `rândul ${index * 2 + offset}`).join('\n');
    expect(lawHunks(lines(0), lines(1))).toBeNull();
  });
});
