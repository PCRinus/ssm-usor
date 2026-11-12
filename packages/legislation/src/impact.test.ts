import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseActText } from './act-text';
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

const roadCode = {
  verified: {
    consolidatedOn: '2026-08-25',
    text: parseActText(fixture('oug-195-2002-2026-08-25.html'), 312713),
  },
  current: {
    consolidatedOn: '2026-11-06',
    text: parseActText(fixture('oug-195-2002-text.html'), 41006),
  },
};
const criminalCode = {
  verified: {
    consolidatedOn: '2026-07-23',
    text: parseActText(fixture('codul-penal-2026-07-23.html'), 311787),
  },
  current: {
    consolidatedOn: '2026-10-18',
    text: parseActText(fixture('codul-penal-text.html'), 314314),
  },
};

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
});
